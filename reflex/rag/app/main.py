import hmac
import os
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import store
from .parse import parse

app = FastAPI(title="Reflex RAG service")


def auth(x_rag_secret: str = Header("")):
    want = os.getenv("RAG_SECRET", "")  # unset secret means deny everything
    if not want or not hmac.compare_digest(x_rag_secret, want):
        raise HTTPException(401, "unauthorized")


class User(BaseModel):
    name: str
    roles: List[str] = []
    clearance: str = "public"


class TextDoc(BaseModel):
    doc_key: str = Field(min_length=1, max_length=200)
    title: Optional[str] = None
    body: str = Field(min_length=1, max_length=500_000)
    level: str = "internal"
    roles: List[str] = []
    source: str = ""


class SearchReq(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    user: User
    k: int = Field(4, ge=1, le=10)


def _ingest(d: dict, actor: str):
    if d["level"] not in store.LEVELS:
        raise HTTPException(422, "level must be one of " + ", ".join(store.LEVELS))
    return store.ingest(d, actor)


@app.get("/health")
def health():
    return {"ok": True, "embed_backend": os.getenv("EMBED_BACKEND", "hash")}


@app.post("/ingest/text", dependencies=[Depends(auth)])
def ingest_text(d: TextDoc):
    return _ingest(d.model_dump(), "api")


@app.post("/ingest/file", dependencies=[Depends(auth)])
async def ingest_file(file: UploadFile = File(...), doc_key: str = Form(...), title: str = Form(""),
                      level: str = Form("internal"), roles: str = Form(""), source: str = Form("")):
    try:
        body = parse(file.filename or "", await file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not body.strip():
        raise HTTPException(422, "no extractable text (scanned PDF? OCR is not enabled)")
    return _ingest({"doc_key": doc_key, "title": title or file.filename, "body": body, "level": level,
                    "roles": [r for r in roles.split(",") if r], "source": source}, "api")


@app.post("/search", dependencies=[Depends(auth)])
def search(r: SearchReq):
    try:
        return {"hits": store.search(r.user.model_dump(), r.question, r.k)}
    except store.ReindexRequired as e:
        raise HTTPException(409, str(e))


@app.get("/usage", dependencies=[Depends(auth)])
def usage():
    return {"usage": store.usage()}
