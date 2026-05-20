# Tasks: Notes Web Publishing

**Input**: Design documents from `specs/001-notes-web-publishing/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**No test tasks** — spec does not request TDD; manual acceptance testing per quickstart.md.

**User Story Map**:
- US1 → Hub connection setup (Preferences Hub tab + Swift bridge)
- US2 → Publish a note + public read view
- US3 → Unlisted visibility + index exclusion
- US4 → Revoke / private-by-default enforcement
- US5 → Web rich-text editor + bi-directional sync pull

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new `sync-hub/web/` sub-project and add dependencies.

- [X] T001 Scaffold `sync-hub/web/` as a Vite + React + TypeScript project (`npm create vite@latest web -- --template react-ts` inside `sync-hub/`)
- [X] T002 Add `slugify` dependency to `sync-hub/package.json` (`npm install slugify` in `sync-hub/`)
- [X] T003 [P] Add TipTap dependencies to `sync-hub/web/package.json`: `@tiptap/react @tiptap/starter-kit @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-code-block-lowlight @tiptap/extension-link @tiptap/extension-image @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header`
- [X] T004 Add `npm run build:web` script to `sync-hub/package.json` that runs `vite build` inside `sync-hub/web/` outputting to `sync-hub/web/dist/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data model and core infrastructure that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Extend `Note` interface in `src/types/index.ts` with `visibility?: 'private' | 'unlisted' | 'public'`, `edit_permission?: boolean`, `published_slug?: string`, `published_url?: string` per data-model.md
- [X] T006 [P] Extend `vaultDb.ts` (`src/lib/vaultDb.ts`) to parse `visibility`, `edit_permission`, and `published_slug` from YAML frontmatter in `listNotes()` and `getNote()`, and write them back in `updateNote()` when present
- [X] T007 Add `hub_notes` table to `sync-hub/src/schema.sql` with columns: `workspace_id`, `path`, `slug` (UNIQUE), `visibility` (CHECK public|unlisted|private), `edit_permission`, `published_at_ms`, `updated_at_ms`; add indexes `idx_hub_notes_slug` and `idx_hub_notes_visibility`
- [X] T008 [P] Add `hub_notes` query methods to `sync-hub/src/db.js` in `SyncStore`: `upsertHubNote(workspaceId, path, fields)`, `getHubNoteBySlug(slug)`, `setHubNoteVisibility(workspaceId, path, visibility)`, `deleteHubNote(workspaceId, path)`
- [X] T009 [P] Create slug generation module `sync-hub/src/slug.js` with `generateSlug(title)` (uses `slugify`) and `assignUniqueSlug(db, title)` (appends `-2`, `-3` on collision)
- [X] T010 [P] Add stub bridge function signatures to `src/lib/bridge.ts`: `hubGetConfig(): Promise<{url:string; hasToken:boolean; connected:boolean}>`, `hubSetConfig(config: {url:string; token:string}): Promise<{ok:boolean; error?:string}>`, `hubTestConnection(): Promise<{ok:boolean; latencyMs:number; error?:string}>`

**Checkpoint**: Foundation ready — Note type updated, hub_notes table defined, slug module and bridge stubs in place.

---

## Phase 3: User Story 1 — Hub Connection Setup (Priority: P1) 🎯 MVP Gateway

**Goal**: User can enter Hub URL + token in Preferences, test the connection, and see "Connected" status.

**Independent Test**: Open Preferences → Hub tab → enter `http://localhost:8787` + `devtoken` → click "Test Connection" → see green "Connected" indicator. Publish controls become visible in the editor.

### Implementation

- [X] T011 [US1] Implement `hubGetConfig`, `hubSetConfig`, and `hubTestConnection` handlers in `swift-app/Sources/FreeCastNotes/WebViewController.swift`: store URL in `UserDefaults["hubServerURL"]`, token in Keychain (service: `com.freecastnotes.hub`), return connection status
- [X] T012 [P] [US1] Implement `hubGetConfig`, `hubSetConfig`, `hubTestConnection` in `src/lib/bridge.ts` calling the corresponding Swift bridge messages (follow existing `syncGetSettings` pattern)
- [X] T013 [P] [US1] Create `src/components/PreferencesPanel/HubTab.tsx`: URL input, token input (masked), "Test Connection" button, connection status indicator (green/red/pending), last connected timestamp
- [X] T014 [US1] Wire `HubTab` into `src/components/PreferencesPanel/PreferencesPanel.tsx` as a new "Hub" section
- [X] T015 [US1] Add Hub connection state to `src/stores/appStore.ts`: `hubConfig: {url, hasToken, connected}`, `setHubConfig(config)`, `testHubConnection()` action calling `bridge.hubTestConnection()`

**Checkpoint**: Hub connection fully functional. User can configure and validate Hub from Preferences.

---

## Phase 4: User Story 2 — Publish a Note + Public Read View (Priority: P1) 🎯 Core MVP

**Goal**: User sets a note to public, auto-sync fires, note becomes accessible at `<hub>/<slug>` as a rendered HTML page.

**Independent Test**: Set note visibility to "Public" → save → URL appears in editor toolbar → open URL in incognito browser → note renders correctly with all images.

### Implementation

- [X] T016 [US2] Extend `/sync/push` handler in `sync-hub/src/server.js`: after writing each `.md` file, parse frontmatter; if `visibility` is `public` or `unlisted`, call `db.upsertHubNote()` with generated/existing slug and `db.assignUniqueSlug()` for new notes
- [X] T017 [US2] After slug assignment in `/sync/push`, patch the stored `.md` file on Hub disk to add `published_slug: <slug>` to its frontmatter (so next pull writes it back to local device)
- [X] T018 [US2] Create `sync-hub/src/public-handler.js` with public note HTTP handlers
- [X] T019 [P] [US2] Add public routes to `sync-hub/src/server.js` (GET /:slug, GET /:slug.md, GET /api/notes/:slug, GET /api/notes, PUT /api/notes/:slug)
- [X] T020 [P] [US2] Add Fastify static plugin to `sync-hub/src/server.js` to serve `sync-hub/web/dist/` under `/_static/`
- [X] T021 [P] [US2] Create `sync-hub/web/src/App.tsx`: on mount, `GET /api/notes/:slug` to fetch note; render `<NoteReadView>` or `<NoteEditView>` based on editPermission
- [X] T022 [P] [US2] Create `sync-hub/web/src/components/NoteReadView.tsx`: renders note title + Markdown body as styled HTML; responsive layout
- [X] T023 [P] [US2] Create `src/components/Editor/VisibilityPicker.tsx`: pill buttons for Private / Unlisted / Public; `onChange` calls `updateNoteVisibility`
- [X] T024 [US2] Add `updateNoteVisibility` and `updateNoteEditPermission` actions to `src/stores/appStore.ts`
- [X] T025 [US2] Add publish toolbar area to editor layout in `src/App.tsx`: shows `<VisibilityPicker>` and published slug when Hub is configured

**Checkpoint**: Core publishing flow complete. Notes can be set to public and read in a browser.

---

## Phase 5: User Story 3 + 4 — Unlisted & Revoke (Priority: P2)

**Goal (US3)**: Unlisted notes are accessible via direct URL but absent from the public index.
**Goal (US4)**: Notes revoked to private disappear from the Hub on next sync.

**Independent Test US3**: Mark note as unlisted → sync → URL loads → `GET /api/notes` list does NOT include the note.
**Independent Test US4**: Publish a note → set it back to private → sync → URL returns 404 → note absent from Hub disk.

### Implementation

- [X] T026 [US3] `GET /api/notes` in `public-handler.js` already filters `visibility = 'public'` via `listPublicHubNotes()` SQL
- [X] T027 [US4] Revoke handled in `/sync/push`: upsertHubNote with `visibility: 'private'` when note is set private (slug preserved but returns 404)
- [X] T028 [US4] Delete signal handled in `/sync/push` deletes loop: calls `deleteHubNote(workspaceId, relPath)` for `.md` files
- [X] T029 [US4] `GET /:slug` and `GET /api/notes/:slug` in `public-handler.js` return 404 when `visibility === 'private'` or record is absent

**Checkpoint**: Unlisted and revoke flows complete. Privacy guarantees enforced end-to-end.

---

## Phase 6: User Story 5 — Web Rich-Text Editor + Bi-directional Pull (Priority: P2)

**Goal**: Notes with edit permission show a full TipTap editor in the browser. Edits save to Hub. macOS app pulls changes on next sync, with LWW conflict notification.

**Independent Test**: Enable edit permission → open URL in browser → edit body → save → in FreeCastNotes trigger sync → local note reflects browser edits → if conflict, Toast notification appears.

### Implementation

- [X] T030 [P] [US5] Create `sync-hub/web/src/components/NoteEditView.tsx`: TipTap editor (StarterKit); save via `PUT /api/notes/:slug`; show "Saved" / "Saving…" status indicator; lazy-loaded from App.tsx
- [X] T031 [US5] `PUT /api/notes/:slug` in `public-handler.js`: validates `edit_permission`, writes to workspace file, updates `hub_notes.updated_at_ms`, enforces `bodyLimitBytes`
- [X] T032 [US5] `sync-hub/web/src/App.tsx` routing: renders `<NoteEditView>` when `editPermission = true`, else `<NoteReadView>`
- [X] T033 [P] [US5] Added edit permission toggle to `src/components/Editor/VisibilityPicker.tsx`: checkbox "Allow web editing" (hidden when visibility is private)
- [X] T034 [US5] `updateNoteEditPermission` action added to `src/stores/appStore.ts`: updates frontmatter + triggers `bridge.syncRunNow()`
- [X] T035 [US5] Conflict notification in `src/stores/appStore.ts`: reads `summary.push.conflicts` from Swift sync result; shows Toast "Conflict resolved — Hub version applied for N note(s)"
- [X] T036 [US5] Swift SyncEngine.runNow() already returns conflict counts in `summary.push.conflicts` — no change needed

**Checkpoint**: Full bi-directional flow complete. Browser edits sync back to macOS app with LWW conflict handling.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, UX polish, and edge cases from spec.

- [X] T037 [P] Rate limiting on public routes implemented in `public-handler.js`: 60 req/min for reads, 10 writes/min for PUT
- [X] T038 [P] `HUB_MAX_NOTE_SIZE_MB` enforcement in `PUT /api/notes/:slug`: rejects with HTTP 413 if content exceeds `bodyLimitBytes`
- [X] T039 [P] Frontmatter field filtering: `content_md` in `hub_notes` is stored as the parsed body (no frontmatter) — internal fields never exposed
- [X] T040 Hub offline degradation: on sync error in `updateNoteVisibility`, sets `hubConfig.connected = false`; local editing is never blocked
- [X] T041 [P] Attachments: existing path-utils already allows `attachments/` paths; sync engine handles them transparently
- [ ] T042 Run `quickstart.md` end-to-end validation: start Hub locally, publish a note, edit from browser, verify sync back, verify revoke → 404; document any gaps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — connects macOS app to Hub
- **US2 (Phase 4)**: Depends on Phase 2 + Phase 3 (needs Hub connected to publish)
- **US3+US4 (Phase 5)**: Depends on Phase 4 (extends the publish flow)
- **US5 (Phase 6)**: Depends on Phase 4 (web editor extends the read view)
- **Polish (Phase 7)**: Depends on all story phases

### User Story Dependencies

| Story | Depends on | Notes |
|-------|-----------|-------|
| US1 (Hub connection) | Phase 2 | Independent; no story deps |
| US2 (Publish + read) | Phase 2, US1 | Needs Hub connected |
| US3 (Unlisted) | US2 | Same publish flow, different visibility |
| US4 (Revoke) | US2 | Inverse of publish; needs publish to exist |
| US5 (Web editor) | US2 | Extends read view with TipTap editor |

### Parallel Opportunities

Within each phase, tasks marked `[P]` touch different files and can run concurrently.

**Phase 2** — T006, T008, T009, T010 can all run in parallel after T007 (schema first).
**Phase 3** — T012, T013 can run in parallel while T011 (Swift) is in progress.
**Phase 4** — T019, T020, T022, T023 can all run in parallel after T016/T017 (push handler first).
**Phase 6** — T030 (web editor component) can start while T031 (PUT route) is built.

---

## Parallel Example: Phase 4 (Publish + Read)

```
# After T016 + T017 (sync/push extension), all of these can run in parallel:

Task T019: Add public GET routes to sync-hub/src/server.js
Task T020: Add Fastify static serving for sync-hub/web/dist/
Task T022: Create NoteReadView.tsx in sync-hub/web/src/components/
Task T023: Create VisibilityPicker.tsx in src/components/Editor/
```

---

## Implementation Strategy

### MVP (Phases 1–4 only: ~25 tasks)

1. Phase 1: Setup (T001–T004) — scaffold web sub-project
2. Phase 2: Foundational (T005–T010) — types, schema, slug module
3. Phase 3: US1 (T011–T015) — Hub connection in Preferences
4. Phase 4: US2 (T016–T025) — publish + public read view
5. **STOP and VALIDATE** via quickstart.md steps 1–5
6. A note can be published from the macOS app and read in any browser ✓

### Full Feature (all phases: ~42 tasks)

Continue with Phase 5 (US3+US4), Phase 6 (US5 editor), Phase 7 (Polish) after MVP validation.

---

## Notes

- `[P]` = different files, no pending dependencies → safe to run concurrently
- `[USn]` = maps task to user story for traceability
- Each checkpoint is a deployable/demeable state
- Commit after each task or logical group
- Verify `quickstart.md` steps manually at each checkpoint
- `sync-hub/web/` is a separate npm workspace — `npm install` there independently
- Swift Keychain access requires entitlements; verify `swift-app/*.entitlements` has `keychain-access-groups`
