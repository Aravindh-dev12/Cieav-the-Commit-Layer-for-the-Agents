# Privacy architecture

LATCH is designed around data minimization.

## Browser-side data reduction

For protected actions the extension can collect:

- URL and origin
- page title
- clicked element text/ARIA metadata
- nearby redacted text
- form field names, labels and input types
- inferred categories such as identity/financial/credential/file
- generic file descriptors

It intentionally does **not** collect raw values from form inputs for semantic analysis.

## Local-only mode

Local-only mode disables backend/model analysis and stores action receipts only in browser extension storage.

## Connected mode

Connected mode sends the reduced `ActionContext` to the configured LATCH API. If an OpenAI key is configured on that server, the server may send the reduced context to the model API for structured semantic classification.

## Receipt data

Receipts may include the source URL, page title, semantic effects, risk, reversibility and timestamps. A future consumer release should add configurable URL minimization and per-site retention controls before broad public deployment.
