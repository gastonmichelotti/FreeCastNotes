/**
 * Handlers for public note endpoints (HTML, raw Markdown, JSON API).
 * Mounted in server.js after authentication routes.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { marked } from 'marked';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const CSS = `
  :root { color-scheme: dark; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #1a1a1a;
    color: #e5e5e7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    padding: 2rem 1rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; line-height: 1.3; font-weight: 600; }
  h1 { font-size: 2rem; }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.25rem; }
  p { margin: 0.75em 0; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #2a2a2a; border-radius: 4px; padding: 0.15em 0.4em; font-size: 0.9em; font-family: 'SF Mono', 'Fira Code', monospace; }
  pre { background: #2a2a2a; border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 1em 0; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #444; padding-left: 1rem; color: #a0a0a0; margin: 1em 0; }
  ul, ol { padding-left: 1.5rem; margin: 0.75em 0; }
  li { margin: 0.25em 0; }
  hr { border: none; border-top: 1px solid #333; margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #333; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #222; }
  img { max-width: 100%; border-radius: 6px; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
  .edit-link { display: inline-block; margin-top: 2rem; padding: 0.4rem 0.9rem; background: #2a2a2a; border-radius: 6px; font-size: 0.85rem; color: #a0a0a0; }
  .edit-link:hover { background: #333; color: #e5e5e7; text-decoration: none; }
`;

function htmlShell({ title, bodyHtml, slug, editPermission, updatedAtMs }) {
  const dateStr = updatedAtMs ? new Date(updatedAtMs).toLocaleDateString(undefined, { dateStyle: 'long' }) : '';
  const editLink = editPermission
    ? `<a class="edit-link" href="/${slug}/edit">Edit this note</a>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <h1>${escHtml(title)}</h1>
    ${dateStr ? `<p class="meta">Updated ${dateStr}</p>` : ''}
    <div class="prose">${bodyHtml}</div>
    ${editLink}
  </div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Register public note routes on the Fastify app.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 * @param {string} opts.hubBaseUrl - base URL for slug write-back (e.g. https://notes.example.com)
 * @param {string} opts.workspacesRoot - absolute path to workspaces root directory
 */
export async function registerPublicRoutes(app, { hubBaseUrl = '', workspacesRoot = '' } = {}) {
  function noteFilePath(workspaceId, notePath) {
    return path.join(workspacesRoot, workspaceId, notePath);
  }
  // Rate limiting: 60 reads/min, 10 writes/min
  const readLimit = {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  };
  const writeLimit = {
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  };

  // GET /api/notes — list public notes
  app.get('/api/notes', { config: { rateLimit: readLimit } }, async (_req, reply) => {
    const notes = app.syncStore.listPublicHubNotes();
    return notes.map((n) => ({
      slug: n.slug,
      title: n.title,
      visibility: n.visibility,
      editPermission: n.edit_permission === 1,
      updatedAtMs: n.updated_at_ms,
      url: `${hubBaseUrl}/${n.slug}`,
    }));
  });

  // GET /api/notes/:slug — JSON representation
  app.get('/api/notes/:slug', { config: { rateLimit: readLimit } }, async (req, reply) => {
    const note = app.syncStore.getHubNoteBySlug(req.params.slug);
    if (!note || note.visibility === 'private') {
      return reply.code(404).send({ error: 'not_found' });
    }
    return {
      slug: note.slug,
      title: note.title,
      content: note.content_md,
      visibility: note.visibility,
      editPermission: note.edit_permission === 1,
      updatedAtMs: note.updated_at_ms,
    };
  });

  // PUT /api/notes/:slug — update content from web editor
  app.put('/api/notes/:slug', { config: { rateLimit: writeLimit } }, async (req, reply) => {
    const note = app.syncStore.getHubNoteBySlug(req.params.slug);
    if (!note || note.visibility === 'private') {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!note.edit_permission) {
      return reply.code(403).send({ error: 'edit_not_allowed' });
    }
    const { content } = req.body ?? {};
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content_required' });
    }
    const maxBytes = (app.syncConfig?.bodyLimitBytes ?? 10 * 1024 * 1024);
    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      return reply.code(413).send({ error: 'content_too_large' });
    }
    const nowMs = Date.now();

    // Update hub_notes cache
    app.syncStore.upsertHubNote({
      workspaceId: note.workspace_id,
      path: note.path,
      slug: note.slug,
      title: note.title,
      visibility: note.visibility,
      editPermission: note.edit_permission,
      contentMd: content,
      updatedAtMs: nowMs,
    });

    // Write updated content back to workspace file so macOS client picks it up on next pull
    if (workspacesRoot) {
      try {
        const fullPath = noteFilePath(note.workspace_id, note.path);
        const existing = await fsp.readFile(fullPath, 'utf8').catch(() => null);
        if (existing !== null) {
          // Preserve frontmatter, replace body
          const frontmatterMatch = existing.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
          const newFileContent = frontmatterMatch
            ? `${frontmatterMatch[1]}\n${content}`
            : `${content}`;
          const buf = Buffer.from(newFileContent, 'utf8');
          const hash = sha256Hex(buf);
          await fsp.writeFile(fullPath, buf);
          app.syncStore.applyUpsert({
            workspaceId: note.workspace_id,
            path: note.path,
            sha256: hash,
            size: buf.length,
            mtimeMs: nowMs,
            actorDeviceId: 'hub-web-editor',
            nowMs,
          });
        }
      } catch {
        // File write is best-effort; hub_notes is authoritative
      }
    }

    return { ok: true, updatedAtMs: nowMs };
  });

  // GET /:slug.md — raw Markdown (no frontmatter)
  app.get('/:slug.md', { config: { rateLimit: readLimit } }, async (req, reply) => {
    const note = app.syncStore.getHubNoteBySlug(req.params.slug);
    if (!note || note.visibility === 'private') {
      return reply.code(404).send('Not found');
    }
    reply.type('text/markdown; charset=utf-8');
    return note.content_md ?? '';
  });

  // GET /:slug/edit — web editor shell (SPA handles the route)
  app.get('/:slug/edit', { config: { rateLimit: readLimit } }, async (req, reply) => {
    const note = app.syncStore.getHubNoteBySlug(req.params.slug);
    if (!note || !note.edit_permission || note.visibility === 'private') {
      return reply.code(403).type('text/html').send('<html><body><h1>Edit not allowed</h1></body></html>');
    }
    // SPA handles routing; serve index.html
    reply.type('text/html');
    return reply.sendFile('index.html');
  });

  // GET /:slug — HTML rendered note
  app.get('/:slug', { config: { rateLimit: readLimit } }, async (req, reply) => {
    const note = app.syncStore.getHubNoteBySlug(req.params.slug);
    if (!note || note.visibility === 'private') {
      return reply.code(404).type('text/html').send('<html><body><h1>Note not found</h1></body></html>');
    }
    const bodyHtml = marked(note.content_md ?? '', { gfm: true, breaks: false });
    reply.type('text/html');
    return htmlShell({
      title: note.title,
      bodyHtml,
      slug: note.slug,
      editPermission: note.edit_permission === 1,
      updatedAtMs: note.updated_at_ms,
    });
  });
}
