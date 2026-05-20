import slugify from 'slugify';

/**
 * Generate a URL slug from a note title (first H1 heading or filename stem).
 * Returns a lowercase kebab-case string, max 60 chars.
 */
export function generateSlug(title) {
  const clean = (title ?? 'untitled')
    .replace(/^#+\s+/, '')   // strip leading markdown heading marks
    .trim()
    .slice(0, 100);

  return slugify(clean, {
    lower: true,
    strict: true,       // strip special chars
    trim: true,
  }).slice(0, 60) || 'untitled';
}

/**
 * Extract the note title from raw Markdown content.
 * Uses the first H1 heading; falls back to the filename stem.
 */
export function extractTitle(content, filenameStem = 'untitled') {
  for (const line of (content ?? '').split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return filenameStem;
}

/**
 * Assign a unique slug for a note in a given SyncStore db.
 * If the base slug is already taken by a different (workspace, path), appends -2, -3, etc.
 */
export function assignUniqueSlug(db, title, workspaceId, path) {
  const base = generateSlug(title);

  // Check if this note already has a slug assigned
  const existing = db.getHubNoteByPath(workspaceId, path);
  if (existing?.slug) return existing.slug;

  // Try base slug, then base-2, base-3, ...
  let candidate = base;
  let attempt = 1;
  while (true) {
    const conflict = db.getHubNoteBySlug(candidate);
    if (!conflict) return candidate;
    // Conflict with the same note (shouldn't happen given above check, but guard)
    if (conflict.workspace_id === workspaceId && conflict.path === path) return candidate;
    attempt++;
    candidate = `${base}-${attempt}`;
  }
}
