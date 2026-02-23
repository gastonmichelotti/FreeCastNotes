# Changelog

All notable changes to FreeCast Notes are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Remote Sync (Beta)** — New sync backend (`sync-hub/`, Fastify + SQLite) with `health`, `manifest`, `push`, `pull`, and `state` endpoints for syncing a FreeCast vault with a VPS workspace folder.
- **Sync Engine (Swift)** — Local vault scanner + sync client (`SyncEngine`, `SyncAPIClient`, `SyncSettings`, `SyncStateStore`) with manual sync and persisted cursor/state.
- **Sync settings in Preferences** — New **Sync (Beta)** section with server/workspace/device settings, token update (Keychain), mode/interval/direction controls, status, test connection, sync now, and sync logs.
- **Auto-sync (Beta)** — Background auto-sync loop in the macOS app with basic retry backoff after errors.

### Changed

- **Documentation** — README now includes a full “Remote Sync (Beta)” section with architecture, server setup, app setup, security, conflict policy, and troubleshooting.

## [1.1.0] - 2025-02-18

### Added

- **Preferences window** — Dedicated window for settings (⌘, or tray menu → Preferences). No longer an overlay; opens in a separate floating window so the note window stays open and in place.
- **Launch at login** — Option in Preferences to start FreeCast Notes when you log in (macOS login items).
- **Split layout** — Toggle between single editor and sidebar + editor view. Shortcut: **⌘S**. Title bar and traffic light (close button) span the full window in split mode; title and tags stay centered.
- **Format bar toggle** — Show/hide the format bar with **⌥⌘,** (Option+Command+Comma).

### Changed

- **Layout shortcut** — Toggle split layout changed from **⌘\\** to **⌘S**.
- **Export shortcut** — **⇧⌘E** now opens the command palette with the Export submenu focused (Markdown, HTML, plain text).
- **Preferences** — Vault folder, layout mode, sort order, and global shortcut are now in the Preferences window. Note count in Preferences loads correctly in the standalone window (vault list is fetched).
- **Window chrome** — Only the red (close) traffic light is shown; minimize and zoom buttons were removed. In split layout, the close button is at the top-left of the entire window (above the sidebar).
- **Toolbar and tags** — In the main window, note title and tags are on one line and centered together as a single unit.

### Fixed

- **Preferences note count** — Fixed "0 notes" in the Preferences vault section when opening Preferences in its own window; the app now loads the vault list there so the count is correct.
- **Format bar shortcut** — **⌥⌘,** now correctly toggles the format bar (no double-toggle).

### Removed

- **Export All Notes** — The "Export All Notes" action and its batch export flow were removed from the command palette and codebase.

---

## [1.0.0] - Initial release

- Global hotkey, always-on-top, space-aware window
- Rich text editor (TipTap), unlimited notes, vault (Markdown on disk)
- Command palette (⌘K), browse notes (⌘P), find in note (⌘F)
- Pin notes, images, import/export, system tray, dark theme

[1.1.0]: https://github.com/gastonmichelotti/FreeCastNotes/releases/tag/v1.1.0
[1.0.0]: https://github.com/gastonmichelotti/FreeCastNotes/releases/tag/v1.0.0
