# Phase 0 Research: Notes Web Publishing

**Feature**: 001-notes-web-publishing
**Date**: 2026-05-20

---

## Decision 1: Bi-directional sync engine

**Decision**: Reuse the existing `sync-hub` engine unchanged.

**Rationale**: The current sync-hub already implements `bidirectional` direction with
`latest_modified_wins` conflict resolution (by `mtime_ms`). This is exactly what the
spec requires (FR-011, FR-012). No re-implementation needed.

**Key existing code**:
- `sync-hub/src/db.js` → `SyncStore.computeManifestDecision()` — already handles
  push/pull/conflict per file with mtime comparison
- Conflict policy `latest_modified_wins` is already the default

**Alternatives considered**: Building a new CRDT-based sync. Rejected — over-engineered
for single-owner use case; LWW is sufficient per spec decision.

---

## Decision 2: Per-note visibility storage

**Decision**: Store `visibility` and `edit_permission` in **both** YAML frontmatter
(travels with the note file) and a new `hub_notes` SQLite table on the Hub (enables
fast public-route queries without parsing frontmatter).

**Rationale**: Frontmatter is the source of truth on the local side (consistent with
Principle III — Open Formats). The SQLite table on the Hub allows the public HTTP layer
to quickly look up slug → note path → visibility without reading every `.md` file.

**New frontmatter fields** (added to existing YAML):
```yaml
visibility: public          # public | unlisted | private (default: omitted = private)
edit_permission: true       # boolean (default: omitted = false)
published_slug: my-note     # set by Hub on first sync, written back to local
```

**New SQLite table**: `hub_notes`
```sql
CREATE TABLE hub_notes (
  workspace_id TEXT NOT NULL,
  path         TEXT NOT NULL,          -- relative file path (e.g., note-abc123.md)
  slug         TEXT NOT NULL UNIQUE,   -- public URL slug
  visibility   TEXT NOT NULL DEFAULT 'private',  -- public | unlisted | private
  edit_permission INTEGER NOT NULL DEFAULT 0,    -- 0 | 1
  published_at_ms INTEGER,
  updated_at_ms   INTEGER,
  PRIMARY KEY (workspace_id, path),
  FOREIGN KEY (workspace_id, path) REFERENCES files(workspace_id, path)
);
```

**Alternatives considered**: Storing visibility only in frontmatter and parsing on each
request. Rejected — adds latency and IO on every public page load.

---

## Decision 3: Public URL slug generation

**Decision**: Use `slugify` npm package. Slug derived from note title (first H1 or
filename stem). Hub assigns slug on first publish, writes it back to frontmatter as
`published_slug`. Collision resolved by appending `-2`, `-3`, etc.

**Rationale**: Human-readable slugs are more shareable than opaque IDs (user's choice
per spec Q2). The `published_slug` frontmatter field ensures the slug is stable across
renames — the original slug persists until explicitly changed.

**Alternatives considered**: UUID-based slugs (e.g., `/a3f9b2`). Rejected per user
decision in spec session.

---

## Decision 4: Hub web editor architecture

**Decision**: Build a separate Vite + React bundle (`sync-hub/web/`) that is compiled
and served as static assets by Fastify. TipTap is used for the editor (same library as
the desktop app).

**Rationale**: Re-using TipTap ensures feature parity with the desktop editor at the
library level (FR-010). Building a separate bundle keeps the Hub server code clean and
allows independent deployment (no SSR complexity).

**Build integration**: A `npm run build:web` script in sync-hub compiles the web bundle
to `sync-hub/web/dist/`. Fastify serves these as static files under `/_static/`.
The rendered note route (`GET /:slug`) returns the HTML shell which loads the bundle;
the bundle fetches the note via the JSON API and renders read or edit view.

**Editor extensions** (must match desktop): StarterKit, TaskList, TaskItem, CodeBlock,
Link, Image, Table, Heading, Bold, Italic, BulletList, OrderedList, Blockquote.

**Alternatives considered**: Server-side rendering with a Markdown-to-HTML pipeline
(no TipTap on server). Rejected — would not achieve edit feature parity; TipTap's
JSON ↔ Markdown round-trip is already used in the desktop app.

---

## Decision 5: Web editor save flow

**Decision**: Web editor saves directly to the Hub via `PUT /api/notes/:slug` (no
local vault involved). On next sync from the macOS app, Hub changes are pulled via
the existing sync protocol. LWW applies if local also changed since last sync.

**Rationale**: The Hub is the canonical store (Principle V); web edits go directly to
the Hub, not through the macOS app. This avoids a round-trip and keeps the protocol
simple.

**Write API call**: `PUT /api/notes/:slug` with `{ content: "<markdown>" }` body.
Updates `hub_notes.updated_at_ms` and writes new content to the workspace `.md` file.
Requires the note to have `edit_permission = 1`; otherwise returns 403.

---

## Decision 6: Hub connection config (macOS app side)

**Decision**: Store Hub URL in `UserDefaults`; store auth token in macOS **Keychain**
(consistent with Architecture Constraints). A new Swift bridge command `hubGetConfig` /
`hubSetConfig` exposes this to the React frontend via the existing JS↔Native bridge.

**Rationale**: Keychain for sensitive credentials is mandated by Principle II. The
bridge pattern is consistent with the existing sync settings (`syncGetSettings` /
`syncSetSettings` pattern already in `src/lib/bridge.ts`).

**New bridge commands**:
```typescript
hubGetConfig(): Promise<{ url: string; hasToken: boolean; connected: boolean }>
hubSetConfig(config: { url: string; token: string }): Promise<{ ok: boolean; error?: string }>
hubTestConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }>
```

---

## Decision 7: Auto-sync on save trigger

**Decision**: When a note with `visibility !== 'private'` is saved in the macOS app,
the JS frontend calls the existing `bridge.syncRunNow()` command immediately after
`vaultDb.updateNote()`. No new Swift code required — the existing sync infrastructure
handles the upload.

**Rationale**: Leverages the existing sync engine with minimal coupling. The sync
engine already debounces concurrent syncs (will no-op if a sync is already running).

**Full-sync (Sync All)**: Existing "Sync Now" button in Preferences already triggers
`syncRunNow()`. No changes needed; it will naturally pick up all public/unlisted notes.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Conflict resolution strategy | LWW by `mtime_ms` — already in sync-hub |
| Visibility storage | Frontmatter + `hub_notes` SQLite table |
| Slug generation | `slugify` npm; `published_slug` written back to frontmatter |
| Web editor library | TipTap (same as desktop) in separate Vite bundle |
| Web editor save flow | Direct `PUT /api/notes/:slug` to Hub |
| Hub config storage | URL in UserDefaults, token in Keychain via new bridge commands |
| Auto-sync trigger | Call `syncRunNow()` after save for public/unlisted notes |
