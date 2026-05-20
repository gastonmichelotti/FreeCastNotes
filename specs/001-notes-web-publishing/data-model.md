# Data Model: Notes Web Publishing

**Feature**: 001-notes-web-publishing
**Date**: 2026-05-20

---

## 1. Local Note (extended)

### TypeScript type extension (`src/types/index.ts`)

```typescript
interface Note {
  // --- existing fields ---
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  last_opened_at?: string;
  is_pinned: number;
  pin_order: number;
  tags: string[];

  // --- new fields (default: omitted = private, no edit) ---
  visibility?: 'private' | 'unlisted' | 'public';  // default: 'private'
  edit_permission?: boolean;                          // default: false
  published_slug?: string;                           // set by Hub on first sync
  published_url?: string;                            // derived: hub_url + '/' + published_slug
}
```

### YAML frontmatter extension

New optional fields appended to existing frontmatter by `vaultDb.ts`:

```yaml
---
id: abc12345-...
created_at: 2026-05-20T10:00:00Z
updated_at: 2026-05-20T14:32:00Z
tags: [notes, dev]
visibility: public          # public | unlisted  (omitted = private)
edit_permission: true       # (omitted = false)
published_slug: my-note     # written back by Hub after first publish
---

# Note title

Body content...
```

**Rules**:
- `visibility` omitted → treated as `private` everywhere; never synced to Hub
- `published_slug` is set by the Hub on the first successful push and written back
  to the local `.md` file via the sync pull; it is stable thereafter unless
  the user manually clears it
- `edit_permission: true` is only meaningful when `visibility` is `public` or `unlisted`

---

## 2. HubConfig (macOS app, not persisted in vault)

Managed by Swift via bridge commands; not stored in any `.md` file.

```typescript
interface HubConfig {
  url: string;           // e.g., "https://notes.yourserver.com"
  hasToken: boolean;     // whether a token is stored in Keychain
  connected: boolean;    // last known connection status
}
```

**Storage**: URL in `UserDefaults["hubServerURL"]`; token in macOS Keychain
(service: `com.freecastnotes.hub`, account: `apiToken`).

---

## 3. Hub SQLite schema extension (`sync-hub/src/schema.sql`)

New table added alongside existing `files`, `devices`, `workspaces`, `change_log`,
`conflicts`:

```sql
CREATE TABLE IF NOT EXISTS hub_notes (
  workspace_id    TEXT    NOT NULL,
  path            TEXT    NOT NULL,   -- relative path, e.g. "my-note-abc123.md"
  slug            TEXT    NOT NULL,   -- URL slug, e.g. "my-note"
  visibility      TEXT    NOT NULL    DEFAULT 'private'
                  CHECK (visibility IN ('public', 'unlisted', 'private')),
  edit_permission INTEGER NOT NULL    DEFAULT 0,
  published_at_ms INTEGER,            -- first publish timestamp
  updated_at_ms   INTEGER,            -- last content update via web editor
  PRIMARY KEY (workspace_id, path),
  FOREIGN KEY (workspace_id, path)
    REFERENCES files(workspace_id, path) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_notes_slug ON hub_notes(slug);
CREATE INDEX IF NOT EXISTS idx_hub_notes_visibility
  ON hub_notes(visibility, workspace_id);
```

**Populated**: when a note with `visibility: public|unlisted` is pushed via
`/sync/push`; the Hub reads the frontmatter and upserts into `hub_notes`.

---

## 4. HubNote (runtime, for public routes)

Used internally by `sync-hub/src/public-handler.js` when serving a request:

```typescript
interface HubNote {
  workspaceId: string;
  path: string;           // relative file path on Hub disk
  slug: string;
  visibility: 'public' | 'unlisted' | 'private';
  editPermission: boolean;
  content: string;        // raw Markdown (read from disk)
  updatedAtMs: number;
}
```

---

## 5. SyncEvent (frontend notification)

Emitted by the sync engine to the React frontend via the bridge after each sync cycle:

```typescript
interface SyncEvent {
  completedAt: string;          // ISO timestamp
  notesUploaded: number;
  notesDownloaded: number;
  conflicts: ConflictSummary[];
  errors: string[];
}

interface ConflictSummary {
  noteTitle: string;
  winner: 'hub' | 'local';
  resolvedAt: string;
}
```

**Usage**: Displayed as a non-blocking Toast notification in the app when
`conflicts.length > 0` (FR-012, SC per spec).

---

## 6. State transitions for note visibility

```
                  User sets visibility
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       private        unlisted        public
    (never synced)  (synced, not    (synced,
                     in index)      in index)
          │              │              │
          └──────────────┴──────────────┘
                  User revokes (→ private)
                         │
                    sync removes
                    from Hub + 404
```

**Transitions**:
- `private → public/unlisted`: next sync pushes note; Hub creates `hub_notes` record
  and assigns slug; slug written back to frontmatter on pull
- `public/unlisted → private`: next sync sends delete signal; Hub sets
  `visibility = 'private'` and public route returns 404
- `visibility change + title change`: slug remains as assigned (stable URL);
  a manual "regenerate slug" action is a future feature
