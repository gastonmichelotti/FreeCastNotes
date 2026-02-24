# FreeCast Sync Hub (MVP)

Fastify + SQLite sync API for FreeCastNotes remote workspace sync.

## Endpoints

- `GET /health`
- `POST /sync/manifest`
- `POST /sync/push`
- `POST /sync/pull`
- `GET /sync/state`

## Run locally

### Option A: from repo root (recommended in dev)

```bash
make sync-hub-start
make sync-hub-logs
make sync-hub-stop
```

This uses:

- PID file: `sync-hub/.run/sync-hub.pid`
- Log file: `sync-hub/.run/sync-hub.log`

### Option B: manual start (inside `sync-hub/`)

```bash
cd sync-hub
cp .env.example .env
npm install
SYNC_TOKEN=dev-token npm start
```

Server data is stored under `SYNC_DATA_ROOT` (default: `./data`, resolved relative to `sync-hub/`).

- `state.sqlite`
- `workspaces/<workspaceId>/...`

Layout:

- `<SYNC_DATA_ROOT>/state.sqlite`
- `<SYNC_DATA_ROOT>/workspaces/<workspaceId>/...`

## Data root configuration

`SYNC_DATA_ROOT` is infrastructure configuration (where the hub stores sync state/files), not app business logic.

- Relative path (recommended for dev): `SYNC_DATA_ROOT=./data`
  - Resolved relative to the `sync-hub/` folder
- Absolute path (recommended for prod): `SYNC_DATA_ROOT=/var/lib/freecast-sync`

### Dev local example

```env
SYNC_PORT=8787
SYNC_TOKEN=change-me
SYNC_DATA_ROOT=./data
```

### Production example (VPS / Docker volume)

```env
SYNC_PORT=8787
SYNC_TOKEN=change-me
SYNC_DATA_ROOT=/var/lib/freecast-sync
```

## Security (MVP)

- Bearer token required on `/sync/*`
- Optional `X-Signature` HMAC SHA-256 (enable with `SYNC_HMAC_SECRET`)
- Payload limit via `SYNC_BODY_LIMIT_MB` (default 10MB)
- Path sanitization blocks traversal / absolute paths / null bytes
- Basic rate limit by IP + deviceId

## Tests

```bash
cd sync-hub
npm test
```
