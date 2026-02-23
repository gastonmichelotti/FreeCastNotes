import path from 'node:path';

const ALLOWED_TOP_LEVEL = ['attachments'];

export function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') throw new Error('workspaceId is required');
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(trimmed)) {
    throw new Error('Invalid workspaceId');
  }
  return trimmed;
}

export function normalizeRelativePath(input) {
  if (typeof input !== 'string') throw new Error('Invalid path');
  if (input.includes('\0')) throw new Error('Path contains null byte');
  let p = input.replace(/\\/g, '/').trim();
  if (!p) throw new Error('Empty path');
  if (p.startsWith('/')) throw new Error('Absolute paths are not allowed');
  p = p.replace(/\/+/g, '/');
  const normalized = path.posix.normalize(p);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    throw new Error('Path traversal is not allowed');
  }
  if (normalized.startsWith('_deleted/')) {
    throw new Error('Path excluded from sync');
  }
  const isMarkdown = normalized.endsWith('.md');
  const isAttachment = ALLOWED_TOP_LEVEL.some((prefix) => normalized === prefix || normalized.startsWith(prefix + '/'));
  if (!isMarkdown && !isAttachment) {
    throw new Error('Path not allowed by sync include rules');
  }
  return normalized;
}

export function resolveWorkspaceFilePath(workspacesRoot, workspaceId, relativePath) {
  const full = path.join(workspacesRoot, workspaceId, relativePath);
  const root = path.join(workspacesRoot, workspaceId) + path.sep;
  if (!full.startsWith(root) && full !== root.slice(0, -1)) {
    throw new Error('Resolved path escapes workspace root');
  }
  return full;
}
