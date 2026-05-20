# Feature Specification: Notes Web Publishing

**Feature Branch**: `001-notes-web-publishing`

**Created**: 2026-05-20

**Status**: Draft

**Input**: User description: "Exponer notas a URLs públicas con permisos configurables via
FreeCast Hub auto-alojado. El Hub es siempre la fuente de verdad cuando está configurado.
FreeCastNotes (macOS) es el cliente principal y gestiona permisos. El browser es cliente
secundario con editor rico (mismas capacidades que local) cuyo acceso depende de los
permisos por nota. Sync bidireccional con last-write-wins en conflictos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Connect FreeCast Hub (Priority: P1)

Before publishing any note, the user sets up a connection to their FreeCast Hub instance.
They open FreeCastNotes Preferences, navigate to a new "Hub" tab, enter the Hub URL and
an authentication token, and click "Test Connection." The app validates the connection and
enables publishing controls across the app.

**Why this priority**: All other stories are blocked without a working Hub connection.

**Independent Test**: Enter valid Hub URL and token → click "Test Connection" → see
"Connected" status → Publish controls become visible in note editor. Fully testable
in isolation.

**Acceptance Scenarios**:

1. **Given** a valid Hub URL and token, **When** the user clicks "Test Connection",
   **Then** a "Connected" indicator appears and per-note publish controls are enabled.
2. **Given** invalid credentials, **When** the user clicks "Test Connection",
   **Then** a descriptive error is shown and publish controls remain disabled.
3. **Given** a configured Hub, **When** the Hub URL becomes unreachable,
   **Then** the app shows a "Hub offline" warning but continues to work fully offline.

---

### User Story 2 — Publish a Note and Read It on the Web (Priority: P1)

The user selects a note, sets its visibility to **public**, and triggers a sync. The note
is pushed to the FreeCast Hub and becomes accessible at a stable public URL. Anyone can
open that URL in a browser and read the note rendered as a styled HTML page.

**Why this priority**: Core value of the feature — the primary user need.

**Independent Test**: After publishing, open the note URL in an incognito browser from
a separate device. Note renders with full content and images. No login required.

**Acceptance Scenarios**:

1. **Given** a note with text and inline images, **When** set to public and synced,
   **Then** a URL is displayed in the app and the note renders correctly in a browser.
2. **Given** a published note, **When** the user edits it locally and syncs again,
   **Then** the public URL reflects the updated content.
3. **Given** a published note, **When** the user sets it to private and syncs,
   **Then** the URL returns a "not available" page (404).

---

### User Story 5 — Edit a Note from the Browser (Priority: P2)

The user configures a note with **edit** permission (in addition to public/unlisted
visibility). When someone opens the note URL in a browser, they see a full rich-text
editor — identical in capabilities to the FreeCastNotes desktop editor — and can edit
the note directly. Edits are saved to the Hub. On reconnect, the macOS app syncs the
Hub version back to local, applying last-write-wins conflict resolution.

**Why this priority**: Enables lightweight editing without opening the native app;
unlocks collaborative use cases.

**Independent Test**: Set a note to public + edit permission. Open its URL in a browser.
Edit the title and body. Close browser. Back in FreeCastNotes, trigger sync — the local
note reflects the browser edits.

**Acceptance Scenarios**:

1. **Given** a note with edit permission, **When** opened in a browser,
   **Then** a rich editor is presented (not a static read view) with full formatting
   capabilities: headings, bold, italic, lists, task lists, code blocks, links, images.
2. **Given** edits made in the browser, **When** the macOS app syncs,
   **Then** the local note is updated to reflect the Hub version (Hub wins).
3. **Given** a note without edit permission, **When** opened in a browser,
   **Then** only a read-only rendered view is shown (no editor controls).
4. **Given** a conflict (local and Hub both changed since last sync),
   **When** the macOS app syncs, **Then** the version with the most recent timestamp
   wins; the app displays a brief "Conflict resolved — Hub version applied" notification.

---

### User Story 3 — Unlisted Note (Link-Only Sharing) (Priority: P2)

The user wants to share a draft or semi-private note with a specific person via a direct
link, without it being publicly discoverable. They mark the note as **unlisted**. The URL
works when accessed directly but the note does not appear in any public Hub index.

**Why this priority**: Important privacy middle-ground; enables controlled sharing without
full public exposure.

**Independent Test**: Mark note as unlisted and sync. Direct URL loads the note. Verify
the note is absent from the Hub's public index/listing page.

**Acceptance Scenarios**:

1. **Given** a note marked unlisted, **When** accessed via its direct URL,
   **Then** it renders normally for anyone with the link.
2. **Given** the Hub's public listing page, **When** a note is unlisted,
   **Then** it does NOT appear in that listing.

---

### User Story 4 — Revoke and Private-by-Default (Priority: P2)

Notes default to **private** — they are never synced to the Hub. The user can explicitly
revoke a previously published note by setting it back to private and syncing; the note
is then removed from the Hub and its URL goes dark.

**Why this priority**: Enforces Constitution Principle II (Privacy by Default).

**Independent Test**: Set a published note to private, trigger sync. Attempt to access
the URL — it returns 404. Verify the note content is absent from the Hub.

**Acceptance Scenarios**:

1. **Given** a new note (default private), **When** a full sync runs,
   **Then** the note's content is never uploaded to the Hub.
2. **Given** a previously published note set back to private, **When** synced,
   **Then** the URL returns 404 and content is removed from the Hub.

---

### Edge Cases

- Hub unreachable during sync: sync fails gracefully, local state preserved, user notified
  with a retry option. No partial uploads.
- Slug collision (two notes with same title): Hub appends a numeric suffix to ensure
  uniqueness (e.g., `/my-note-2`).
- Very large image attachments: sync respects a configurable max attachment size; oversized
  attachments are skipped with a per-note warning in the app.
- Note with sensitive frontmatter: only a safe allowlist of frontmatter fields is published
  (title, date, public tags); internal fields are stripped before upload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The user MUST be able to set per-note visibility: `private` (default),
  `unlisted`, or `public`.
- **FR-002**: The system MUST sync published notes (public + unlisted) and their
  attachments to the connected FreeCast Hub.
- **FR-003**: The Hub MUST serve published notes as rendered HTML pages at stable public
  URLs.
- **FR-004**: The user MUST be able to configure the Hub connection (URL + auth token)
  in FreeCastNotes Preferences and validate it before publishing.
- **FR-005**: The user MUST be able to revoke a note's published status; the Hub MUST
  remove access on the next sync.
- **FR-006**: Notes marked private MUST never be uploaded to the Hub, even during a full
  sync.
- **FR-007**: Sync operates in two modes: (a) **auto-sync on save** — whenever a note
  marked public or unlisted is saved locally, it is pushed to the Hub automatically;
  (b) **explicit full-sync** — a manual "Sync All" action pushes all public/unlisted notes
  in a single batch. Both modes MUST be supported.
- **FR-008**: Each published note MUST receive a stable URL on the Hub using a slug
  auto-derived from the note title (e.g., `notes.yourserver.com/my-note-on-rust`).
  Slug collisions MUST be resolved by appending a numeric suffix. The slug MUST
  update if the note title changes and a new sync occurs (old slug redirects to new
  one for a configurable grace period).
- **FR-009**: The Hub MUST expose each published note via three endpoints: (a) a styled
  HTML page for browser rendering, (b) a raw Markdown download (e.g., `/slug.md`),
  and (c) a JSON API endpoint for programmatic access and bi-directional sync.
- **FR-010**: The Hub's web interface MUST provide a rich-text editor for notes
  configured with edit permission. The editor MUST support the same formatting
  capabilities as the FreeCastNotes desktop editor: headings, bold, italic, code blocks,
  task lists, ordered/unordered lists, blockquotes, inline images, and links.
- **FR-011**: When a Hub is configured, the Hub MUST be the source of truth for all
  synced notes. FreeCastNotes MUST sync local changes to the Hub on save (for
  public/unlisted notes) and pull Hub changes on reconnect or on-demand sync.
- **FR-012**: Conflict resolution MUST apply last-write-wins based on modification
  timestamp. When a conflict is resolved automatically, FreeCastNotes MUST display
  a non-blocking notification identifying the note and the winning version (Hub or local).
- **FR-013**: Without a Hub configured, FreeCastNotes MUST continue to operate in
  pure local-vault mode with no behavior change (Hub is optional).

### Key Entities

- **Note** (local): extended with `visibility` (`private` | `unlisted` | `public`),
  `editPermission` (boolean), `publishedUrl` (nullable), and `lastSyncedAt` (timestamp).
- **HubConfig**: Hub server URL, auth token (system keychain), connection status.
  Lives in FreeCastNotes Preferences.
- **HubNote** (Hub): canonical record of a note; Markdown content, rendered HTML cache,
  attachment refs, visibility, edit permission, `updatedAt` timestamp (used for
  conflict resolution).
- **Attachment** (Hub): image or file asset linked to a HubNote, served at a stable URL.
- **SyncEvent**: record of a sync operation (timestamp, notes affected, conflicts
  resolved, errors). Used for the conflict notification in the macOS app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A note published and synced is accessible via its public URL within 10
  seconds of sync completion.
- **SC-002**: A revoked note's URL returns 404 within one sync cycle (≤10 seconds after
  sync).
- **SC-003**: Hub setup (URL + token + test connection) completes in under 60 seconds
  following the Preferences UI.
- **SC-004**: Sync of up to 50 notes with images completes within 30 seconds on a
  standard broadband connection.
- **SC-005**: Zero notes marked private are ever detectable on the Hub (hard privacy
  guarantee).
- **SC-006**: Edits made in the browser editor are reflected in FreeCastNotes after one
  sync cycle (≤30 seconds on reconnect or manual sync).
- **SC-007**: The web editor loads and is ready to type within 3 seconds on a standard
  broadband connection.

## Assumptions

- The user controls a server (VPS or home server) where they can self-host the FreeCast
  Hub and assign a subdomain to it.
- The FreeCast Hub server component is deployed separately; this spec covers the macOS
  app side, the Hub's web editor interface, and the app↔Hub API contract. Hub internal
  implementation details (database schema, deployment config) may warrant a companion
  spec.
- Hub is optional: users without a Hub configured experience no behavior change — the
  local vault remains their only data store.
- Conflict resolution in v1 is last-write-wins by timestamp. More sophisticated merge
  strategies (CRDT, manual resolution) are deferred to a future iteration.
- The web editor uses the same Markdown/TipTap feature set as the desktop app; advanced
  features added later to the desktop app should be propagated to the web editor in the
  same release.
- User authentication for the web editor is not in scope for v1 — edit-permission notes
  are editable by anyone with the link. Access control beyond visibility flags is a
  future iteration.
- **Constitution V amendment required**: This spec supersedes the "Hub is read-only
  replica" clause in Constitution V. The Hub is now the canonical store when configured;
  sync is bi-directional. The constitution should be amended to v1.1.0 alongside this
  feature.
