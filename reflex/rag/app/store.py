import hashlib
import json
import math
import os
import re
import sqlite3
import time
import zlib
from collections import Counter

import numpy as np

LEVELS = ["public", "internal", "restricted"]  # restricted = export-controlled
STOP = set("a an and are as at be by for from how in is it of on or that the this to was what when where which who why with".split())
DIM = 256


class ReindexRequired(Exception):
    pass


def conn():
    c = sqlite3.connect(os.getenv("RAG_DB", "rag.db"))
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS docs(id INTEGER PRIMARY KEY, doc_key TEXT, version INTEGER, title TEXT, level TEXT,
      roles TEXT, source TEXT, hash TEXT, status TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY, doc_id INTEGER, n INTEGER, text TEXT, emb BLOB);
    CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
    CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY, ts REAL, user TEXT, op TEXT, tokens INTEGER, cost REAL);
    """)
    return c


_model = None


def embed(texts):
    """EMBED_BACKEND=sbert uses a real sentence-transformer; the default is a local hashed n-gram fallback."""
    global _model
    if os.getenv("EMBED_BACKEND", "hash") == "sbert":
        if _model is None:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5"))
        return np.asarray(_model.encode(texts, normalize_embeddings=True), dtype="float32")
    out = np.zeros((len(texts), DIM), dtype="float32")
    for i, t in enumerate(texts):
        s = " " + re.sub(r"[^a-z0-9]+", " ", t.lower()) + " "
        for j in range(len(s) - 2):
            out[i, zlib.crc32(s[j:j + 3].encode()) % DIM] += 1
    n = np.linalg.norm(out, axis=1, keepdims=True)
    n[n == 0] = 1
    return out / n


def tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP]


def track(c, user, op, text):
    tok = int(len(text.split()) * 1.3)
    c.execute("INSERT INTO usage(ts,user,op,tokens,cost) VALUES(?,?,?,?,?)",
              (time.time(), user, op, tok, tok / 1000 * float(os.getenv("EMBED_PRICE_PER_1K", "0"))))
    c.commit()


def can_see(user, level, roles):  # fail closed: unknown levels see nothing
    if level not in LEVELS or user["clearance"] not in LEVELS:
        return False
    if LEVELS.index(user["clearance"]) < LEVELS.index(level):
        return False
    return "admin" in user["roles"] or not roles or bool(set(roles) & set(user["roles"]))


def chunk(body, mx=120):
    out, cur = [], []
    for para in re.split(r"\n{2,}", body):
        w = para.split()
        if not w:
            continue
        if len(cur) + len(w) > mx and cur:
            out.append(" ".join(cur)); cur = []
        if len(w) > mx:
            out += [" ".join(w[i:i + mx]) for i in range(0, len(w), mx)]
        else:
            cur += w
    if cur:
        out.append(" ".join(cur))
    return out


def ingest(d, actor):
    level, roles = d.get("level", "internal"), [str(r) for r in d.get("roles", [])]
    h = hashlib.sha256(json.dumps([level, roles, d["body"]]).encode()).hexdigest()
    c = conn()
    last = c.execute("SELECT id, version, hash FROM docs WHERE doc_key=? ORDER BY version DESC LIMIT 1", (d["doc_key"],)).fetchone()
    if last and last["hash"] == h:
        return {"id": last["id"], "version": last["version"], "unchanged": True}
    version = (last["version"] if last else 0) + 1
    pieces = chunk(d["body"])
    vecs = embed(pieces)
    with c:  # one transaction: the old version is superseded only if the new one lands
        c.execute("UPDATE docs SET status='superseded' WHERE doc_key=?", (d["doc_key"],))
        did = c.execute("INSERT INTO docs(doc_key,version,title,level,roles,source,hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                        (d["doc_key"], version, d.get("title") or d["doc_key"], level, json.dumps(roles), d.get("source", ""), h, "released", time.time())).lastrowid
        for n, (t, v) in enumerate(zip(pieces, vecs)):
            c.execute("INSERT INTO chunks(doc_id,n,text,emb) VALUES(?,?,?,?)", (did, n, t, v.astype("float32").tobytes()))
    track(c, actor, "ingest", d["body"])
    return {"id": did, "version": version, "chunks": len(pieces)}


def search(user, q, k=4):
    """Permission filter runs before ranking: restricted text never influences scores or results."""
    c = conn()
    rows = [r for r in c.execute(
        "SELECT c.text, c.emb, d.doc_key, d.version, d.title, d.level, d.roles FROM chunks c JOIN docs d ON d.id=c.doc_id WHERE d.status='released'")
        if can_see(user, r["level"], json.loads(r["roles"]))]
    track(c, user["name"], "search", q)
    if not rows:
        return []
    qv = embed([q])[0]
    mat = np.stack([np.frombuffer(r["emb"], dtype="float32") for r in rows])
    if mat.shape[1] != qv.shape[0]:
        raise ReindexRequired("embedding backend changed; re-ingest documents")
    sem = mat @ qv
    docs = [tokens(r["text"]) for r in rows]
    n, avg = len(rows), sum(len(d) for d in docs) / len(rows) or 1
    df = Counter(t for d in docs for t in set(d))
    qt = tokens(q)
    lex = np.zeros(n)
    for i, d in enumerate(docs):
        tf = Counter(d)
        for t in qt:
            if tf[t]:
                lex[i] += math.log(1 + (n - df[t] + .5) / (df[t] + .5)) * tf[t] * 2.2 / (tf[t] + 1.2 * (.25 + .75 * len(d) / avg))
    rl, rs = np.argsort(np.argsort(-lex)) + 1, np.argsort(np.argsort(-sem)) + 1
    smin = float(os.getenv("SEM_MIN", "0.5"))
    keep = [i for i in range(n) if lex[i] > 0 or sem[i] > smin]  # no real match: return nothing
    keep.sort(key=lambda i: -(1 / (60 + rl[i]) + 1 / (60 + rs[i])))
    return [{k_: rows[i][k_] for k_ in ("text", "doc_key", "version", "title")} for i in keep[:k]]


def usage():
    c = conn()
    return [dict(r) for r in c.execute("SELECT op, user, COUNT(*) calls, SUM(tokens) tokens, ROUND(SUM(cost),6) cost FROM usage GROUP BY op, user")]
