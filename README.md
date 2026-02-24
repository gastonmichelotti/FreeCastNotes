# FreeCastNotes

**The Raycast Notes experience, free and open source. Unlimited notes, zero cost.**

A fast, minimal, always-on-top notes app for macOS — inspired by [Raycast Notes](https://www.raycast.com/).

> Disclaimer: FreeCastNotes is **not affiliated with Raycast**. “Raycast” is a trademark of its respective owner.

## Why?

Raycast Notes is a beautifully designed scratchpad. But it's limited to **5 notes** on the free plan. FreeCastNotes removes that limit — giving you unlimited notes with the same keyboard-driven workflow, completely free and open source.

## Features

- **Instant access** — Global hotkey (`Option+N`, customizable) to show/hide from anywhere
- **Always on top** — Stays above other windows while you work
- **Space-aware** — Always appears on your *current* macOS Space (Spotlight-like)
- **Rich text editing** — Headings, bold, italic, code blocks, lists, task lists, blockquotes, links, images
- **Unlimited notes** — No artificial limits, all stored locally in a vault folder (Markdown files)
- **Command palette** (`Cmd+K`) — Search and execute any action
- **Browse notes** (`Cmd+P`) — Quick switcher with fuzzy search
- **Find & replace** (`Cmd+F`) — Search within notes with match highlighting
- **Pin notes** — Pin important notes to the top, access with `Cmd+1-9`
- **Images** — Insert via format bar, paste, or drag & drop; resize with corner handles
- **Import** — Import Markdown files as new notes
- **Export** — Copy as Markdown, HTML, or plain text; export current note to file (`Shift+Cmd+E` opens export options)
- **Preferences** (`Cmd+,`) — Dedicated Preferences window: vault location, layout, sort order, global shortcut, launch at login
- **Optional secure sync with remote workspace** (Beta) — Manual/auto sync via a VPS hub
- **Launch at login** — Option in Preferences to start FreeCast Notes when you log in
- **Split layout** (`Cmd+S`) — Toggle between single editor and sidebar + editor view
- **System tray** — Menu bar icon with quick actions (Preferences, New Note, View, Quit)
- **Auto-sizing window** — Window grows/shrinks with content (toggle with `Shift+Cmd+/`)
- **Format bar** — Toggle visibility with `Option+Cmd+,`
- **Dark theme** — Native macOS dark appearance
- **Fully local** — All data stored on your machine, no cloud, no accounts

## Releases

See [CHANGELOG.md](CHANGELOG.md) for version history. **Current: v1.1.0.**

## Installation

### Download

Download the latest `FreeCastNotes-*.dmg` from the [Releases](https://github.com/gastonmichelotti/FreeCastNotes/releases) page.

Open the DMG and drag **FreeCastNotes** to your **Applications** folder.

> Note: the app is currently **not notarized/signed**, so macOS Gatekeeper may block the first launch. If that happens: right‑click the app → **Open** → **Open**.

### Build from source

**Prerequisites:**
- [Node.js](https://nodejs.org/) 18+
- Swift 5.9+ (included with Xcode or Xcode Command Line Tools)
- macOS 13+

```bash
# Clone the repo
git clone https://github.com/gastonmichelotti/FreeCastNotes.git
cd FreeCastNotes

# Install dependencies
make install

# Run in development (Vite + Swift)
make dev

# Build .app bundle
make bundle

# Build .dmg for distribution
make dmg
```

The `.app` and `.dmg` will be in the `build/` directory.

### Publishing a release (e.g. v1.1.0)

1. Update version in `package.json` if needed (e.g. `"version": "1.1.0"`).
2. Update [CHANGELOG.md](CHANGELOG.md) with the release date and any last-minute notes.
3. Build the DMG: `make dmg`
4. Commit and tag:
   ```bash
   git add -A && git commit -m "Release v1.1.0"
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin main && git push origin v1.1.0
   ```
5. On GitHub: [Releases](https://github.com/gastonmichelotti/FreeCastNotes/releases) → **Draft a new release** → choose tag `v1.1.0`, paste the changelog for that version, attach `build/FreeCastNotes.dmg`, and publish.

### Makefile commands

| Command | Description |
|---------|-------------|
| `make dev` | Run in dev mode (Vite HMR + Swift) |
| `make dev-front` | Run only the frontend (Vite on :1420) |
| `make dev-swift` | Run only the Swift app (needs Vite running) |
| `make build` | Production build (frontend + Swift release) |
| `make bundle` | Generate `FreeCastNotes.app` |
| `make dmg` | Generate `FreeCastNotes.dmg` |
| `make check` | Type-check frontend |
| `make install` | Install npm + Swift dependencies |
| `make clean` | Clean all build artifacts |
| `make kill` | Kill running processes |
| `make open` | Launch the built app |

## Keyboard Shortcuts

### General
| Shortcut | Action |
|----------|--------|
| `Option+N` | Show/Hide window (global, customizable in Preferences) |
| `Cmd+,` | Open Preferences |
| `Cmd+K` | Open command palette |
| `Cmd+P` | Browse notes |
| `Cmd+F` | Find in note |
| `Cmd+N` | New note |
| `Cmd+D` | Duplicate note |
| `Cmd+S` | Toggle split layout (single / sidebar + editor) |
| `Shift+Cmd+P` | Toggle pin |
| `Cmd+[` | Navigate back |
| `Cmd+]` | Navigate forward |
| `Cmd+1-9` | Jump to pinned note |
| `Shift+Cmd+/` | Toggle auto-sizing |
| `Option+Cmd+,` | Toggle format bar |
| `Esc` | Hide window |

### Export
| Shortcut | Action |
|----------|--------|
| `Shift+Cmd+C` | Copy as Markdown |
| `Shift+Cmd+E` | Open command palette with Export submenu |

### Formatting
| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+U` | Underline |
| `Shift+Cmd+S` | Strikethrough |
| `Option+Cmd+1/2/3` | Heading 1/2/3 |
| `Option+Cmd+C` | Code block |
| `Shift+Cmd+B` | Blockquote |
| `Shift+Cmd+8` | Bullet list |
| `Shift+Cmd+7` | Ordered list |
| `Shift+Cmd+9` | Task list |

## Tech Stack

- **Swift + AppKit** — Native macOS shell with `NSWindow` and `WKWebView`
- **[React 19](https://react.dev/)** — UI rendered in WKWebView
- **[TipTap](https://tiptap.dev/)** — Rich text editor (ProseMirror-based)
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety
- **[Tailwind CSS v4](https://tailwindcss.com/)** — Utility-first styling
- **[Zustand](https://zustand.docs.pmnd.rs/)** — State management
- **[Vite](https://vite.dev/)** — Frontend build tool
- **[HotKey](https://github.com/soffes/HotKey)** — Global keyboard shortcuts

### Architecture

FreeCastNotes uses a hybrid architecture: a native Swift shell provides the macOS window management, system tray, and global shortcuts, while the UI is a React app running inside a `WKWebView`. Communication between Swift and React happens through a bidirectional JavaScript bridge.

This approach gives us the best of both worlds: native macOS windowing behavior (Spotlight-like Space handling, tray, global hotkeys) with a modern, fast UI framework.

## Sync with Remote Workspace (Beta)

FreeCastNotes can optionally sync your local vault with a remote VPS folder using a small sync hub service (`sync-hub/`). This is useful if you want to operate on notes directly on a server/workspace and let the app synchronize changes back to your Mac.

### What is Sync (Beta)?

- Keep your local FreeCast vault in sync with a remote workspace on your VPS
- Use the app locally while also editing/reading files on the server
- Support manual sync or periodic auto-sync (30s / 60s / 5m)

### Architecture (Mac client + VPS hub)

```text
FreeCastNotes (macOS app)
  ├─ Swift SyncEngine scans local vault (Markdown + attachments)
  ├─ Calls sync API (manifest / push / pull / state)
  └─ Applies pulled changes into local vault

VPS (freecast-sync-hub)
  ├─ Fastify API + Bearer auth (+ optional HMAC)
  ├─ SQLite state/changelog/conflicts
  └─ Workspace files on disk
     <SYNC_DATA_ROOT>/workspaces/<workspaceId>/...
```

### How to self-host sync server

The sync hub is included in this repo under `sync-hub/`.

```bash
cd sync-hub
cp .env.example .env
npm install

# Example (Linux / VPS)
export SYNC_TOKEN='replace-with-strong-random-token'
export SYNC_DATA_ROOT='/var/lib/freecast-sync'
npm start
```

Defaults:

- Direction: `bidirectional`
- Conflict policy (MVP): `latest_modified_wins`
- Auto-sync interval default: `60s`
- Included: `*.md`, `attachments/**`
- Excluded: `_deleted/**`

### How to configure app settings

Open **Preferences** (`Cmd+,`) and configure:

1. Enable Sync
2. Server URL (example: `https://sync.example.com`)
3. Workspace ID (example: `gato-main`)
4. Device Name / Device ID
5. API Token (stored in Keychain)
6. Mode (`Manual` or `Auto`)
7. Interval (`30s`, `60s`, `5m`)
8. Direction (`Upload only`, `Download only`, `Bidirectional`)
9. Conflict Policy (`Latest modified wins`)

Use the buttons:

- `Test Connection`
- `Sync Now`
- `Open Sync Logs`

### Security notes

- Protect all `/sync/*` routes with `Authorization: Bearer <token>`
- Use HTTPS (reverse proxy / TLS) in production
- Optionally enable `X-Signature` HMAC body signing (`SYNC_HMAC_SECRET`)
- Keep payload size limited (default `10MB`)
- Do not log note contents or attachment payloads

### Conflict resolution (MVP)

- Policy: `latest_modified_wins`
- If both client and server changed a file, the newer `mtime` wins
- Conflicts are recorded server-side in SQLite (`conflicts` table)
- Server may instruct the client to pull the server copy when it wins

### Troubleshooting

- **Invalid token / 401 unauthorized**: verify the API token in Preferences and `SYNC_TOKEN` on the server match exactly
- **Clock drift / unexpected conflict winner**: ensure Mac and VPS clocks are synced (NTP) because MVP conflict policy uses modified timestamps
- **Connection test fails**: confirm `Server URL` is reachable and exposed over HTTP/HTTPS from your Mac
- **Sync says configured = No**: check `Server URL`, `Workspace ID`, and that an API token is saved (Keychain)
- **Large attachments rejected**: increase `SYNC_BODY_LIMIT_MB` or reduce attachment size / split syncs
- **File blocked / write error on Mac**: verify the vault folder is writable and no external process is locking the file

### No vendor lock-in

- Sync is optional and disabled by default
- You choose the server URL, credentials, and sync policy
- The same app build works with different self-hosted servers by changing only settings
- No FreeCast-owned server or domain is required

## Support

If FreeCastNotes saves you time, consider supporting development (pay what you want, suggested **$3**):

- Gumroad tip jar: https://michelotti2.gumroad.com/l/freecast

Downloads are always free on GitHub Releases:
- https://github.com/gastonmichelotti/FreeCastNotes/releases

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

[MIT](LICENSE)
