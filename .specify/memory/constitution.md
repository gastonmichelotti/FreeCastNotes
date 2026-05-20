<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0

Modified principles:
  - V. Selective Web Publishing: "Hub is read-only replica" clause removed.
    Hub is now the canonical store when configured; sync is bi-directional.
    Web editor requirement added.

Added:
  - Architecture Constraints: web editor parity requirement
  - Architecture Constraints: bi-directional sync and last-write-wins conflict resolution

Removed:
  - "Hub is read-only replica until bi-directional sync is explicitly ratified" clause

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — no change needed (generic scaffold)
  ✅ .specify/templates/spec-template.md   — no change needed (generic scaffold)
  ✅ .specify/templates/tasks-template.md  — no change needed (generic scaffold)

Rationale: spec 001-notes-web-publishing explicitly designs, specifies, and ratifies
bi-directional sync with Hub as canonical store — satisfying the deferral condition
stated in the original Principle V.

Deferred TODOs: none
-->

# FreeCastNotes Constitution

## Core Principles

### I. Local-First Data

Notes are stored as individual Markdown files on the user's machine
(`~/Documents/FreeCastNotes` by default). The app MUST function fully offline.
No cloud dependency is required to read, write, search, or manage notes.
The vault path is user-configurable; the app MUST respect the chosen location.

### II. Privacy by Default

All sharing, sync, and publishing capabilities are opt-in. No data MUST leave
the device without an explicit, intentional user action. Any feature that exposes
note content externally MUST require per-note permission controls to be configured
before a note can be accessed outside the local vault.

### III. Open Formats

Notes MUST be stored as standard CommonMark Markdown. Proprietary binary formats
are prohibited. Import and export MUST be lossless for Markdown, HTML, and plain-text
formats. Frontmatter metadata (YAML) is permitted as long as it remains human-readable
and strippable without data loss.

### IV. Native macOS Integration

The application shell MUST be Swift + AppKit. WKWebView is the rendering surface for
the React UI layer. Global hotkeys, system tray integration, and macOS Spaces awareness
are non-negotiable UX requirements. Electron and cross-platform frameworks are not
permitted. The JS↔Native bridge (`bridge.ts` ↔ `WebViewController.swift` via
WKScriptMessageHandler) is the sole communication channel; Swift MUST NOT manipulate
the DOM directly.

### V. Selective Web Publishing

Notes MAY be published to a self-hosted FreeCast Hub with configurable per-note
visibility: **public** (accessible to anyone with the URL), **unlisted** (accessible
via direct link only), or **private** (not accessible externally). The user retains
full control of what is published and MUST be able to revoke access at any time.

When a Hub is configured, the Hub is the **canonical data store**; FreeCastNotes
(macOS) and the browser web interface are both clients that sync with it.
Sync is **bi-directional**: local changes push to the Hub; Hub changes pull to local.
Conflict resolution MUST apply last-write-wins by modification timestamp; conflicts
MUST surface a non-blocking notification in the macOS app.

The Hub's web interface MUST provide a rich-text editor for notes with edit permission
enabled, offering feature parity with the FreeCastNotes desktop editor.

Without a Hub configured, FreeCastNotes operates in pure local-vault mode with no
behavior change. The Hub MUST be self-hostable as a single process (Node/Fastify)
or Docker container with no external managed-cloud dependency.

## Architecture Constraints

- The WKWebView bridge is the only permitted JS↔Native communication channel.
  Swift MUST NOT write to or read from the DOM outside of the bridge protocol.
- Vault storage is file-based (one `.md` file per note). No relational database
  is required to run the macOS app.
- The `sync-hub` server component uses SQLite for changelog and conflict tracking.
  No external database service is required for self-hosting.
- The FreeCast Hub MUST be deployable as a single long-running process (Node 20+,
  Fastify) or as a Docker image. Deployment MUST NOT require managed cloud services.
- Images and attachments are extracted to `attachments/` within the vault and
  referenced by relative paths; the Hub MUST handle attachment sync alongside
  note content.
- The Hub's web editor MUST maintain feature parity with the FreeCastNotes desktop
  editor. Features added to the desktop editor MUST be reflected in the web editor
  within the same release cycle.
- Bi-directional sync applies last-write-wins by `updatedAt` timestamp. The Hub's
  timestamp is authoritative when a Hub is configured.

## Development Workflow

- All features follow the SpecKit flow:
  `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Constitution gates MUST pass before Phase 0 research begins in any implementation
  plan. Gates MUST be re-checked after Phase 1 design.
- SemVer (`MAJOR.MINOR.PATCH`) applies to both the macOS app and the Hub server.
  App version is the source of truth in `package.json`; Hub version is tracked
  separately in `sync-hub/package.json`.
- Features that affect Principle II (Privacy) or Principle V (Web Publishing) MUST
  be reviewed for security implications before merge.

## Governance

- This constitution supersedes all other project practices and documentation.
- Amendments MUST be documented, version-bumped, and accompanied by a migration
  plan if any existing behavior changes.
- Constitution versioning follows SemVer:
  - **MAJOR**: Backward-incompatible principle removals or redefinitions.
  - **MINOR**: New principles or materially expanded guidance added.
  - **PATCH**: Clarifications, wording improvements, typo fixes.
- All pull requests touching sharing, sync, or publishing features MUST assert
  compliance with Principles II and V in the PR description before merge.
- The ratification date records the original adoption; `Last Amended` updates on
  every constitution change.

**Version**: 1.1.0 | **Ratified**: 2026-05-20 | **Last Amended**: 2026-05-20
