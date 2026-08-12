# LATCH Platform Runtime

LATCH is an always-on local commit platform. The Control Center is optional UI; the Gateway is the product runtime.

## Runtime topology

```text
OS login / boot
      ↓
LATCH Gateway (Python, loopback only)
      ├─ supervises semantic service
      ├─ supervises protected browser surface
      ├─ owns privileged local lifecycle control
      ├─ exposes health/status
      └─ provides stable surface-control boundary

Protected browser surface
      ↓
consequential action
      ↓
deterministic floor + semantic interpretation
      ↓
cognitive-friction policy
      ↓
COMMIT / CANCEL
      ↓
receipt / verified inverse when available
```

The browser is the first surface. Future surfaces (agent actions, mail, files, native applications) should integrate through the Gateway boundary rather than becoming independent policy engines.

## Process ownership

Python owns runtime lifecycle and supervision.

Current child processes:

- compiled semantic service (`apps/api/dist/server.js`)
- Chromium browser mediator (`apps/browser/main.mjs`)

The remaining Node/JavaScript components are implementation adapters, not the platform control plane. Browser injected code remains JavaScript because it executes inside Chromium's isolated world.

## Failure behavior

The Gateway is fail-conservative.

- If the semantic service exits, the Gateway stops the protected browser surface instead of leaving it running with a missing production backend.
- The semantic service is restarted with bounded exponential backoff.
- The browser surface is restarted with bounded exponential backoff.
- A stable process resets its restart backoff.
- Closing the Control Center has no effect on protection.
- `pause` intentionally stops the protected surface but keeps the Gateway alive.
- `resume` restores semantic health before restarting the protected surface.

## Local control security

Gateway API binds only to `127.0.0.1`.

`GET /health` is intentionally non-secret and exposes minimal process health.

All privileged endpoints require a randomly generated bearer token stored in the local LATCH state directory with restrictive file permissions where supported.

Privileged routes currently include:

```text
GET  /v1/status
POST /v1/pause
POST /v1/resume
POST /v1/restart-surface
POST /v1/open-test-lab
```

The Test Lab HTML itself is synthetic and contains no secrets. `latch test-lab` does not open the system default browser: it asks the Gateway to open the Test Lab URL inside the protected Chromium surface.

## OS lifecycle

LATCH installs as a per-user startup runtime:

- Linux: systemd user service
- macOS: launchd LaunchAgent
- Windows: Task Scheduler ONLOGON task

CLI lifecycle:

```bash
latch gateway install
latch gateway start
latch gateway stop
latch gateway restart
latch gateway status
latch gateway uninstall
```

Protection lifecycle without killing the Gateway:

```bash
latch gateway pause
latch gateway resume
latch gateway restart-surface
```

## Surface contract

A future LATCH surface must not bypass the deterministic safety floor. Surfaces should provide privacy-reduced Action Context evidence and accept a resulting action decision/manifest. They may execute an approved action only through a narrowly scoped replay/commit capability appropriate to that surface.

Required properties for every surface:

1. hostile external content is treated as data, never policy;
2. sensitive raw values are minimized before semantic inference;
3. model output cannot lower deterministic risk or reversibility constraints;
4. HIGH/CRITICAL/sensitive actions cannot habituate to PASSIVE;
5. execution authority is narrower than observation authority;
6. a receipt records what LATCH observed and approved;
7. Undo is only advertised when a concrete inverse can be verified;
8. surface failure must not silently degrade into unmediated execution.

## Testing

Install the editable Python platform package and build the semantic service:

```bash
python -m pip install -e .
npm install
npm run build:api
```

Run platform verification:

```bash
npm run platform:check
```

Run the Gateway interactively for first testing:

```bash
latch gateway run
```

In another terminal:

```bash
latch gateway status
latch doctor
latch test-lab
```

`latch test-lab` opens synthetic payment, permission, publish, delete, upload, prompt-injection and repeated-medium-risk actions in the protected browser surface. No real external action is performed.

Once foreground testing is satisfactory, install the always-on service:

```bash
latch gateway install
```
