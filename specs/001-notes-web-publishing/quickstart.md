# Quickstart: Notes Web Publishing — Local Dev Setup

**Feature**: 001-notes-web-publishing
**Date**: 2026-05-20

---

## Prerequisites

- Node.js 20+
- npm 10+
- Xcode 15+ (for macOS app Swift build)
- A running FreeCastNotes dev session (`make dev` or `npm run dev`)

---

## 1. Start the Hub server (dev mode)

```bash
cd sync-hub
npm install
npm run dev         # starts Fastify on http://localhost:8787
```

The Hub needs a `SYNC_TOKEN` env var (any string for dev):

```bash
SYNC_TOKEN=devtoken npm run dev
```

Check it's running: `curl http://localhost:8787/health`

---

## 2. Build the Hub web editor

```bash
cd sync-hub
npm run build:web   # compiles sync-hub/web/ → sync-hub/web/dist/
```

For live development of the web editor:

```bash
cd sync-hub/web
npm install
npm run dev         # Vite dev server on http://localhost:5174
```

Point it at the Hub API by setting `VITE_HUB_URL=http://localhost:8787` in
`sync-hub/web/.env.local`.

---

## 3. Configure Hub connection in FreeCastNotes

1. Open FreeCastNotes
2. Open Preferences (`Cmd+,`) → Hub tab
3. Enter Hub URL: `http://localhost:8787`
4. Enter token: `devtoken`
5. Click "Test Connection" — should show "Connected ✓"

---

## 4. Publish a note

1. Select any note in FreeCastNotes
2. In the editor toolbar, click the share icon → set visibility to "Public"
3. Save the note (`Cmd+S`)
4. Auto-sync fires; after a few seconds the note's URL appears in the toolbar
5. Click the URL to open in browser → note renders in the Hub web editor shell

---

## 5. Test web editing

1. Set a note to Public + enable Edit permission in the visibility picker
2. Open the note URL in a browser
3. Edit the body text and click Save (or auto-save after 2s idle)
4. Back in FreeCastNotes, trigger sync (`Cmd+Shift+S` or Preferences → Sync Now)
5. The local note should reflect the browser edits

---

## 6. Test conflict resolution

1. Go offline (disable WiFi)
2. Edit a note locally
3. In a browser, edit the same note (if Hub is still reachable — e.g., localhost)
4. Reconnect / trigger sync
5. The version with the later `mtime` wins; a Toast notification appears:
   "Conflict resolved — Hub version applied" (or "local version kept")

---

## Environment variables (sync-hub)

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_TOKEN` | (required) | Bearer token for sync API auth |
| `PORT` | `8787` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen host |
| `SYNC_DATA_ROOT` | `./data` | Directory for SQLite DB and workspace files |
| `HUB_MAX_NOTE_SIZE_MB` | `10` | Max note content size for web editor writes |
| `HUB_PUBLIC_INDEX` | `true` | Whether to expose `GET /api/notes` public listing |
