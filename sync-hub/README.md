# FreeCast Sync Hub (MVP)

Fastify + SQLite sync API for FreeCastNotes remote workspace sync.

## Endpoints

- `GET /health`
- `POST /sync/manifest`
- `POST /sync/push`
- `POST /sync/pull`
- `GET /sync/state`

## Run locally

```bash
cd sync-hub
cp .env.example .env
npm install
SYNC_TOKEN=dev-token npm start
```

Server data is stored under `SYNC_DATA_ROOT` (default: `/home/opc/documents/freecast-sync`):

- `state.sqlite`
- `workspaces/<workspaceId>/...`

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
