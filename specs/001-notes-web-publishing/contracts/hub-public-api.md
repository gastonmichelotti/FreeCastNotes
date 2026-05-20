# Contract: Hub Public API

**Feature**: 001-notes-web-publishing
**Date**: 2026-05-20
**Server**: FreeCast Hub (Fastify, sync-hub/)

All routes below are **new** additions to the Hub server.
Existing `/sync/*` routes are documented in `hub-sync-api.md`.

---

## Authentication

Public read routes (`GET /:slug`, `GET /:slug.md`) require **no authentication**.
The note's `visibility` field controls access.

Write routes (`PUT /api/notes/:slug`) require **no user authentication** in v1 —
access is controlled solely by the note's `edit_permission` flag. Anyone with the
URL of an edit-enabled note can write to it.

Sync routes (`/sync/*`) retain their existing Bearer token auth.

---

## Routes

### GET `/:slug`

Serve the published note as a web page (rendered read view or TipTap editor).

**Access control**:
- `visibility = public` → accessible to anyone
- `visibility = unlisted` → accessible to anyone with the exact URL (not indexed)
- `visibility = private` → 404

**Response** (200): HTML page (the Hub web editor shell)

The shell loads `/_static/bundle.js` which fetches `GET /api/notes/:slug` and renders
either:
- `<NoteReadView>` if `edit_permission = false`
- `<NoteEditor>` if `edit_permission = true`

**Response** (404): `{ error: "note_not_found" }` JSON or styled 404 page

---

### GET `/:slug.md`

Serve the raw Markdown source of the published note.

**Access control**: same as `GET /:slug`

**Response headers**:
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="<slug>.md"
```

**Response** (200): raw Markdown body (frontmatter stripped; only body content)

**Response** (404): `{ error: "note_not_found" }`

---

### GET `/api/notes/:slug`

JSON API — fetch note content and metadata. Used by the web editor bundle.

**Access control**: same as `GET /:slug`

**Response** (200):
```json
{
  "slug": "my-note",
  "title": "My Note",
  "content": "# My Note\n\nBody text...",
  "visibility": "public",
  "editPermission": true,
  "updatedAtMs": 1716201600000
}
```

**Response** (404):
```json
{ "error": "note_not_found" }
```

---

### PUT `/api/notes/:slug`

Update note content from the web editor.

**Access control**: requires `edit_permission = true` on the note; otherwise 403.

**Request body**:
```json
{
  "content": "# My Note\n\nUpdated body..."
}
```

**Validation**:
- `content` MUST be a non-empty string
- `content` MUST be valid UTF-8
- Maximum content size: 10 MB (configurable via `HUB_MAX_NOTE_SIZE_MB` env var)

**Response** (200):
```json
{
  "slug": "my-note",
  "updatedAtMs": 1716205200000
}
```

**Response** (403):
```json
{ "error": "edit_permission_denied" }
```

**Response** (404):
```json
{ "error": "note_not_found" }
```

**Response** (413):
```json
{ "error": "content_too_large", "maxBytes": 10485760 }
```

**Side effects**:
- Writes updated Markdown to the workspace file on disk
- Updates `hub_notes.updated_at_ms`
- Appends a `change_log` entry (so macOS app pull picks it up on next sync)
- Does NOT update `mtime_ms` to a client-provided value — server time is used

---

### GET `/api/notes` (public index)

List all `visibility = public` notes. Used by the Hub's public index page (if enabled).

**No authentication required.**

**Query params**:
- `limit` (default: 50, max: 200)
- `offset` (default: 0)

**Response** (200):
```json
{
  "notes": [
    {
      "slug": "my-note",
      "title": "My Note",
      "updatedAtMs": 1716201600000,
      "url": "/my-note"
    }
  ],
  "total": 1
}
```

Notes with `visibility = unlisted` are **never** included in this response.

---

## Static assets

### GET `/_static/*`

Serve compiled Hub web editor assets (JS bundle, CSS, fonts).

Built by `npm run build:web` in `sync-hub/`; output in `sync-hub/web/dist/`.
Served with long-lived cache headers (`Cache-Control: public, max-age=31536000`).

---

## Error format (all routes)

```json
{
  "error": "<error_code>",
  "message": "<human-readable description>"
}
```

Common error codes:
- `note_not_found` — no note with that slug, or visibility is private
- `edit_permission_denied` — note exists but edit_permission is false
- `content_too_large` — payload exceeds max size
- `invalid_content` — content failed validation
- `internal_error` — unexpected server error (logged server-side)

---

## Rate limiting

All public routes are rate-limited at 60 requests/minute per IP (same as existing
`/sync/*` rate limiting). The `PUT /api/notes/:slug` write route is limited to
10 writes/minute per IP to prevent abuse.
