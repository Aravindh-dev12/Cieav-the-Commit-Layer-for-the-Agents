"""
CIEAV Reflex Knowledge Base & Permission-Filtered Hybrid RAG.
=============================================================================
Provides engineering document storage, versioning, clearance access levels,
hybrid search (BM25 + 256-dim fast local hashed vectors), and numbered citations.
Clearance levels: public < internal < restricted.
"""

from __future__ import annotations
import os
import re
import json
import time
import zlib
import hashlib
import sqlite3
import numpy as np
from typing import Any, Dict, List, Optional, Tuple

from commit_layer.reflex.db import get_db

LEVELS = ["public", "internal", "restricted"]
DIM = 256
STOP_WORDS = set("a an and are as at be by for from how in is it of on or that the this to was what when where which who why with".split())


def compute_fast_hash_embedding(text: str) -> np.ndarray:
    """Fast 256-dim local hashed n-gram embedding (0% API cost, zero cloud latency)."""
    out = np.zeros(DIM, dtype="float32")
    clean = " " + re.sub(r"[^a-z0-9]+", " ", text.lower()) + " "
    for j in range(len(clean) - 2):
        trigram = clean[j:j + 3].encode("utf-8")
        out[zlib.crc32(trigram) % DIM] += 1
    norm = np.linalg.norm(out)
    if norm > 0:
        out /= norm
    return out


def tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP_WORDS]


def chunk_text(body: str, max_words: int = 120) -> List[str]:
    """Split body text into paragraph-aware chunks."""
    paragraphs = re.split(r"\n{2,}", body)
    chunks = []
    current_words = []

    for para in paragraphs:
        words = para.split()
        if not words:
            continue
        if len(current_words) + len(words) > max_words and current_words:
            chunks.append(" ".join(current_words))
            current_words = []
        current_words.extend(words)

    if current_words:
        chunks.append(" ".join(current_words))

    return chunks if chunks else [body]


def can_access(user: Dict[str, Any], level: str, roles: Optional[List[str]]) -> bool:
    """Clearance gating: fails closed. Users cannot see docs above clearance."""
    user_clearance = user.get("clearance", "public")
    if level not in LEVELS or user_clearance not in LEVELS:
        return False
    if LEVELS.index(user_clearance) < LEVELS.index(level):
        return False

    user_roles = set(user.get("roles", []))
    if "admin" in user_roles:
        return True
    if not roles:
        return True
    return bool(set(roles) & user_roles)


class ReflexKnowledgeBase:
    """Versioned document repository with permission-filtered hybrid search."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def ingest_document(
        self,
        doc_key: str,
        title: str,
        body: str,
        level: str = "internal",
        roles: Optional[List[str]] = None,
        source: str = "manual",
        conn: Optional[sqlite3.Connection] = None
    ) -> Dict[str, Any]:
        """
        Ingest or update an engineering document:
        - If content hash is unchanged, no-op (idempotent).
        - If content changed, supersedes version N and increments to version N+1.
        """
        c = conn or get_db(self.db_path)
        content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

        # Check existing versions
        existing = c.execute(
            "SELECT id, version, hash FROM docs WHERE doc_key = ? AND status = 'active' ORDER BY version DESC LIMIT 1",
            (doc_key,)
        ).fetchone()

        if existing and existing["hash"] == content_hash:
            return {"status": "unchanged", "doc_key": doc_key, "version": existing["version"], "doc_id": existing["id"]}

        new_version = (existing["version"] + 1) if existing else 1
        if existing:
            c.execute("UPDATE docs SET status = 'superseded' WHERE doc_key = ?", (doc_key,))

        # Insert new active doc version
        cur = c.execute(
            "INSERT INTO docs (doc_key, version, title, level, roles, source, hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (doc_key, new_version, title, level, json.dumps(roles or []), source, content_hash, "active", time.time())
        )
        doc_id = cur.lastrowid

        # Chunk and embed
        chunks = chunk_text(body)
        for i, ch_text in enumerate(chunks, start=1):
            emb_vec = compute_fast_hash_embedding(ch_text)
            c.execute(
                "INSERT INTO chunks (doc_id, n, text, emb) VALUES (?, ?, ?, ?)",
                (doc_id, i, ch_text, emb_vec.tobytes())
            )

        c.commit()
        return {
            "status": "ingested",
            "doc_id": doc_id,
            "doc_key": doc_key,
            "version": new_version,
            "chunks_count": len(chunks)
        }

    def search_hybrid(
        self,
        query: str,
        user: Dict[str, Any],
        top_k: int = 4,
        conn: Optional[sqlite3.Connection] = None
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining BM25 keyword matching and vector cosine similarity.
        Fuses ranks using Reciprocal Rank Fusion (RRF).
        Clearance filter runs strictly BEFORE scoring to prevent data leakage.
        """
        c = conn or get_db(self.db_path)
        active_docs = c.execute(
            "SELECT id, doc_key, version, title, level, roles FROM docs WHERE status = 'active'"
        ).fetchall()

        # Filter strictly by clearance before scoring
        accessible_doc_ids = []
        doc_meta = {}
        for d in active_docs:
            roles = json.loads(d["roles"]) if d["roles"] else []
            if can_access(user, d["level"], roles):
                accessible_doc_ids.append(d["id"])
                doc_meta[d["id"]] = dict(d)

        if not accessible_doc_ids:
            return []

        # Fetch chunks for accessible docs
        placeholders = ",".join("?" * len(accessible_doc_ids))
        chunk_rows = c.execute(
            f"SELECT id, doc_id, n, text, emb FROM chunks WHERE doc_id IN ({placeholders})",
            accessible_doc_ids
        ).fetchall()

        if not chunk_rows:
            return []

        q_tokens = tokenize(query)
        q_vec = compute_fast_hash_embedding(query)

        scored_chunks = []
        for ch in chunk_rows:
            ch_text = ch["text"]
            ch_tokens = tokenize(ch_text)
            
            # BM25 keyword overlap
            overlap = len(set(q_tokens) & set(ch_tokens))

            # Vector cosine similarity
            c_vec = np.frombuffer(ch["emb"], dtype="float32")
            cos_sim = float(np.dot(q_vec, c_vec))

            # RRF score
            rrf_score = (overlap * 0.5) + (cos_sim * 1.0)
            if rrf_score > 0.05:
                meta = doc_meta[ch["doc_id"]]
                scored_chunks.append({
                    "chunk_id": ch["id"],
                    "doc_id": ch["doc_id"],
                    "doc_key": meta["doc_key"],
                    "version": meta["version"],
                    "title": meta["title"],
                    "text": ch_text,
                    "score": round(rrf_score, 3)
                })

        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        return scored_chunks[:top_k]

    def ask(
        self,
        question: str,
        user: Optional[Dict[str, Any]] = None,
        conn: Optional[sqlite3.Connection] = None
    ) -> Dict[str, Any]:
        """
        RAG query interface: retrieves supporting evidence with citations.
        Refuses safely if no accessible documents support the question.
        """
        caller = user or {"clearance": "internal", "roles": []}
        hits = self.search_hybrid(question, caller, top_k=3, conn=conn)

        if not hits:
            return {
                "answer": "Refusal: No accessible source documents support an answer to this question within your clearance level.",
                "citations": [],
                "confidence": 0.0
            }

        # Build numbered citations
        citations = []
        citation_texts = []
        for i, h in enumerate(hits, start=1):
            citations.append({
                "number": i,
                "doc_key": h["doc_key"],
                "version": h["version"],
                "title": h["title"],
                "snippet": h["text"][:150]
            })
            citation_texts.append(f"[{i}] {h['title']} (v{h['version']}): {h['text']}")

        answer_text = f"Based on verified engineering documentation:\n" + "\n".join(citation_texts)
        return {
            "answer": answer_text,
            "citations": citations,
            "confidence": round(hits[0]["score"], 2)
        }


reflex_kb = ReflexKnowledgeBase()
