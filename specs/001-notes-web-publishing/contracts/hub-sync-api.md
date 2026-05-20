# Contract: Hub Sync API (reference)

**Feature**: 001-notes-web-publishing
**Date**: 2026-05-20

This document is a reference for the **existing** sync API that this feature builds on.
No changes are made to these routes; they are documented here for planning context.

All routes require `Authorization: Bearer <SYNC_TOKEN>` header.

---

## Existing routes (unchanged)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/health` | Server health check |
| POST | `/sync/manifest` | Compare local ↔ server state; get push/pull decision |
| POST | `/sync/push` | Upload files (base64) from device to Hub |
| POST | `/sync/pull` | Download files (base64) from Hub to device |
| GET | `/sync/state` | Query device sync state (cursor, last errors) |

## Frontmatter handling during push (new behavior)

When a `.md` file is received via `POST /sync/push`, the Hub now **also** reads the
`visibility`, `edit_permission`, and `published_slug` frontmatter fields and upserts
the `hub_notes` table accordingly.

If `visibility` is `public` or `unlisted` and no `published_slug` exists:
1. Hub generates a slug from the note title (first H1 or filename stem)
2. Hub writes the slug to `hub_notes`
3. Hub patches the frontmatter in the stored `.md` file to add `published_slug: <slug>`
4. On the next `POST /sync/pull`, the local device receives the patched file and
   saves the `published_slug` back to its local vault

If `visibility` is `private` (or omitted) and a `hub_notes` record exists:
1. Hub sets `hub_notes.visibility = 'private'`
2. The public route for that slug returns 404

## Conflict resolution (unchanged)

The existing `latest_modified_wins` policy applies. `mtime_ms` is the local file
modification time provided by the client. The Hub always uses server-side timestamps
for its own change log entries. No changes to this logic.
