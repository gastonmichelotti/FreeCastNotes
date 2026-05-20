# Implementation Plan: Notes Web Publishing

**Branch**: `001-notes-web-publishing` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-notes-web-publishing/spec.md`

## Summary

Enable FreeCastNotes users to publish individual notes to public URLs via a self-hosted
FreeCast Hub, with configurable per-note visibility (public/unlisted/private) and optional
edit permission. The Hub acts as the canonical data store when configured; the macOS app
and the browser web interface are bi-directional sync clients. The Hub already has a
working bi-directional sync engine (`latest_modified_wins`); this feature extends it with
public HTTP serving, slug-based routing, per-note visibility metadata, and a TipTap-based
web editor served as a static bundle from the Hub.

## Technical Context

**Language/Version**:
- macOS app: Swift 5.9, TypeScript 5.x, React 19
- sync-hub: Node.js 20+, JavaScript (CommonJS, existing convention)
- Hub web editor: TypeScript + React 19 + TipTap (new Vite bundle, built into `sync-hub/web/`)

**Primary Dependencies**:
- App (existing): TipTap, Zustand, Tailwind CSS v4, Vite 7, HotKey
- Hub (existing): Fastify 5.6, better-sqlite3 11, yaml 2.8, rate-limiting
- Hub (new): `slugify` (slug generation), `@tiptap/starter-kit` + extensions (web editor),
  `vite` + React (web editor build), `@vitejs/plugin-react`

**Storage**:
- Local vault: file-based (one `.md` per note, YAML frontmatter extended with
  `visibility`, `edit_permission`, `published_slug`)
- Hub: SQLite (existing `files`, `change_log`, `devices`, `workspaces` tables extended
  with new `hub_notes` table for public metadata)

**Testing**:
- App: Vite dev server + manual browser testing (existing pattern)
- Hub: Node.js built-in `node:test` or manual curl/fetch testing

**Target Platform**: macOS 13+ (app), Linux/macOS server (Hub), any modern browser (web editor)

**Project Type**: desktop-app (macOS) + web-service (Hub server) + web-app (Hub web editor)

**Performance Goals**:
- Note accessible via public URL within 10s of sync
- Web editor ready to type within 3s on broadband
- 50-note full sync completes within 30s on broadband

**Constraints**:
- Hub is optional — offline/local-only mode unchanged (FR-013)
- No external database; SQLite only (Architecture Constraints)
- Web editor must match desktop TipTap feature set (FR-010)
- Zero private notes ever reach the Hub (FR-006, SC-005)

**Scale/Scope**: Single owner, personal server, hundreds of notes, no multi-tenancy

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: ✅ all pass.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| Local-First Data (I) | Notes work fully offline; Hub is optional | ✅ PASS | FR-013 explicit; vaultDb unchanged without Hub |
| Privacy by Default (II) | Notes default private; per-note opt-in required | ✅ PASS | FR-001/006: `private` is default; sync skips private notes |
| Open Formats (III) | New fields are standard YAML; no binary formats | ✅ PASS | `visibility`, `edit_permission`, `published_slug` added to frontmatter |
| Native macOS Integration (IV) | Swift bridge extended minimally; UI in React/WKWebView | ✅ PASS | New bridge commands for Hub prefs; no DOM manipulation from Swift |
| Selective Web Publishing (V) | This feature ratifies Principle V | ✅ PASS | Hub is canonical when configured; bi-directional sync with LWW |

No violations. Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/001-notes-web-publishing/
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions
├── data-model.md        # Phase 1 — entity schemas and frontmatter
├── quickstart.md        # Phase 1 — local dev setup guide
├── contracts/
│   ├── hub-public-api.md     # New public HTTP routes
│   └── hub-sync-api.md       # Existing sync API (reference)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
# macOS app (existing, extended)
src/
├── types/index.ts                        # Note type: add visibility/editPermission fields
├── lib/
│   ├── vaultDb.ts                        # Parse/write new frontmatter fields
│   └── bridge.ts                         # Add hubGetConfig, hubSetConfig bridge commands
├── stores/appStore.ts                    # Visibility state; auto-sync on save trigger
└── components/
    ├── Editor/                           # Add publish toolbar button + visibility picker
    ├── PreferencesPanel/                 # Add Hub tab (URL, token, test connection)
    └── Toast/                            # Reuse for conflict-resolved notifications

# Swift bridge (minimal changes)
swift-app/Sources/FreeCastNotes/
├── WebViewController.swift               # Handle new hubGetConfig / hubSetConfig messages
└── SyncManager.swift (or equivalent)    # Wire auto-sync-on-save trigger from JS

# Hub server (existing, extended)
sync-hub/
├── src/
│   ├── server.js                         # Add public routes + serve web editor static files
│   ├── db.js                             # Add hub_notes table queries
│   ├── schema.sql                        # Add hub_notes table
│   ├── slug.js                           # New: slug generation + collision resolution
│   └── public-handler.js                # New: render note as HTML / serve editor
└── web/                                  # New: Hub web editor (Vite + React + TipTap)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx                       # Route: read view vs editor based on permissions
        └── components/
            ├── NoteEditor.tsx            # TipTap editor (same extensions as desktop)
            └── NoteReadView.tsx          # Styled read-only render
```
