# Reflex

Learn a task once, replay it with checks after every step, and approve anything irreversible.
Full-stack Node service: REST API, SQLite store, hash-chained audit log, and a web dashboard.

## Run

    cp .env.example .env      # set API_KEY to a long random string
    docker compose up --build # open http://localhost:3000, paste the API key

Without Docker: `npm install && API_KEY=your-long-secret npm start`. Tests: `npm test`.

## API (all under /api, header `x-api-key`)

| Method | Path | Purpose |
|---|---|---|
| POST | /traces | Trace JSON in, deterministic procedure out |
| GET | /procedures, /procedures/:id | List and inspect |
| GET | /recall?q= | Exact + BM25 retrieval, rank-fused |
| POST | /runs | Run by `procedureId` or natural `query`, with `params` |
| POST | /runs/:id/repair | `{decision: approve|reject}` for an agent's proposed fix |
| POST | /runs/:id/approve | `{decision: approve|reject}` for R2/R3 steps |
| GET | /activity, /activity/verify | Audit log and tamper check |

## What is implemented vs. not yet

| Implemented | Not yet (next modules) |
|---|---|
| Node pipelines: DAG engine, cycle check, pause/resume on approval | Branching and loop nodes, scheduled triggers |
| Visual canvas: drag, link, edit config, live node status | Undo/redo in the editor |
| Self-repair agent: failed step -> proposal from visible controls only -> human approval -> procedure patched and logged | Multi-step repair plans, repair of R3 steps without re-approval |
| Agent node and model gateway (Anthropic, Ollama, offline stand-in) | LLM repair of failed steps, tool-using agents |
| Semantic retriever (local hashed vectors) fused with exact + BM25 | Real embedding models |
| Deterministic extractor, verifier rule, risk classes | Desktop recorder (macOS AX, Windows UIA) |
| Exact + BM25 recall with rank fusion | Embedding (semantic) retriever |
| Permission gateway, manifests, approval cards | Real OS action drivers (set `DRIVER_URL` to plug one in) |
| Checked step replay, parameters, hash-chained log | LLM handoff and write-back, undo handlers |
| API-key auth, rate limit, helmet, Docker, tests | Multi-user auth, Postgres, team sync, scheduler, MCP server |

Single-process SQLite: fine for one team; use Postgres before scaling out.

## Real driver contract

Set `DRIVER_URL` to a service that performs steps on a real machine. Reflex POSTs `{step, value}`; reply with
`{ok, text, ui}`, where `text` is what was observed (checked against the step) and `ui` lists the visible control names
(used by the repair agent). Until a desktop driver exists, this is the integration point.

## Knowledge base (engineering documents)

`POST /api/docs` (editor or admin) ingests `{doc_key, title, body, level, roles}`. Resending the same content is a no-op;
changed content becomes version N+1 and supersedes the old one, so answers always reflect the latest released version.
`POST /api/ask {question}` returns an answer with numbered citations, or a refusal when no source the caller may see
supports it. Levels are `public < internal < restricted` (export-controlled); `roles` further restrict a document.
Users come from `USERS` in `.env`; the permission filter runs before ranking, so restricted text never reaches the model.
Every ask and ingest is in the hash-chained audit log. `eval/cases.json` plus `test/rag.test.js` is the regression set:
retrieval accuracy, latest-version wins, no cross-clearance leaks, refusal when unsupported.
Pipelines can use it through the `ask` node, which runs as the user who started the pipeline.

## Python RAG service (`rag/`)

FastAPI service for parsing (PDF, DOCX including tables, Markdown/text), chunking, embeddings, versioned storage,
permission-filtered hybrid search (BM25 + vectors, rank-fused) and usage tracking. Set `RAG_URL` and `RAG_SECRET`
(docker compose does this) and the Node gateway forwards identity-checked requests to it. Node stays the only public entry
point; the service rejects any call without the shared secret.

    cd rag && pip install -r requirements-dev.txt && python -m pytest -q
    PUT /api/docs/file?doc_key=SPEC-1&name=spec.pdf&level=internal   (raw file body)

Embeddings: the default is a local hashed n-gram fallback. For real semantic embeddings build with
`requirements-sbert.txt` and set `EMBED_BACKEND=sbert` (model via `EMBED_MODEL`; adjust `SEM_MIN`; re-ingest after switching).
Vectors live in SQLite and are scored with NumPy, which is exact and fine up to roughly 100k chunks; move to pgvector beyond that.

## SSO and cost

Entra ID: set `ENTRA_TENANT_ID`, `ENTRA_AUDIENCE`, `GROUP_MAP`; send `Authorization: Bearer <token>`. Tokens are verified (RS256
signature, expiry, audience, issuer) and groups map to roles and clearance; unmapped users see public documents only.
`GET /api/usage` (admin) reports model tokens and USD cost (set `PRICE_IN_PER_MTOK` / `PRICE_OUT_PER_MTOK`) plus retrieval usage.

## Connectors, approvals and governance

- **Approvals (Power Automate):** with `REQUIRE_APPROVAL=1`, every new or changed document waits as `pending` and is invisible to search.
  Reflex POSTs `{id, doc_key, title, level, requested_by, callback}` to `APPROVAL_FLOW_URL` (a flow starting with
  "When an HTTP request is received"). The flow runs its multi-stage approval and finishes with an HTTP action:
  `POST <callback>` with header `x-flow-secret: <APPROVAL_SECRET>` and body `{decision: approve|reject, approver: "email"}`.
  The approver must differ from the requester. `GET /api/approvals` lists requests.
- **GitLab:** add a push webhook to `/hooks/gitlab` with `GITLAB_WEBHOOK_TOKEN`. Pushes to the default branch re-index changed
  Markdown/text under `DOC_PATHS`, versioned and idempotent, and go through the approval gate when it is on.
- **Waypoint, Dynamics 365, any JSON API:** describe the source in `PULL_SOURCES` (URL, bearer token env var, `items_path`, field map,
  `level_map`) and run `POST /api/sync/<name>` as admin. Unknown classifications become `restricted`. Paging (`@odata.nextLink`)
  and automatic token refresh are not implemented; I have not seen Waypoint's API, so its mapping is yours to fill in.
- **Rate limit:** `ASK_LIMIT_PER_HOUR` per user. **OCR:** build the rag image with `WITH_OCR=1` and set `OCR=1`.
- **Browser sign-in:** `npm run vendor:msal` copies MSAL into `public/vendor` (already included). With `ENTRA_*` set, the dashboard shows
  "Sign in with Microsoft". Register the app as a single-page application with redirect URI equal to your site origin.

## Assurance, trust and outcomes

- `GET /api/procedures/:id/lint`: rule checks (every risky step needs a verifiable check, known classes only).
- `POST /api/procedures/:id/simulate`: replays the procedure in a throwaway database with fault injection at every checked step, and
  verifies it stops safely, never runs a step after a failure, and gates every risky step for approval. Pass lint plus all scenarios and the
  procedure becomes `trusted`. Add your own scenarios in the body: `{scenarios:[{name, params, script:{"2":{ok:false,text:""}}, expect:"handoff"}]}`.
- Unattended runs (`POST /api/runs` with `unattended:true`, e.g. from a scheduler) require a trusted procedure. Any repair resets trust.
- `GET /api/outcomes`: runs, completions, model-free rate versus `TARGET_MODEL_FREE_RATE`, operator corrections codified, and minutes saved
  (`MINUTES_PER_RUN`): the numbers a performance-linked contract would use.
- `GET /api/procedures/:id/export`: portable JSON; POST it to `/api/traces` to re-import (round-trips to the same procedure).

## Mapping to an internal AI platform role

| Workstream | In this repo | Not verified or not built |
|---|---|---|
| Central AI system | Python RAG, cited permission-aware answers, regression set, cost tracking, rate limits | Sentence-transformer and OCR paths need a machine that can download models; pgvector for very large corpora |
| Tool integration | GitLab webhook, config-driven pull connector (Waypoint, Dynamics 365), file upload | Waypoint-specific mapping, OData paging, token refresh |
| Document approvals | Approval gate, Power Automate callback, segregation of duties | The flow itself is built in Power Automate; Reflex defines its contract above |
| Git workflow | GitLab-driven indexing of docs | Protected-branch setup and CI templates live in GitLab |
| Identity | Entra token verification, group mapping, browser sign-in code | Sign-in popup not exercised against a real tenant |
