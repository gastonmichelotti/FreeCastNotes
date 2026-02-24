import crypto from 'node:crypto';
import { parseDocument, stringify } from 'yaml';

function nowIso() {
  return new Date().toISOString();
}

function isIsoParseable(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function splitFrontmatter(content) {
  if (typeof content !== 'string') return null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/.exec(content);
  if (!m) return null;
  return {
    yamlText: m[1],
    body: content.slice(m[0].length),
    fullMatchLength: m[0].length,
  };
}

export function parseNoteFrontmatter(content) {
  const parts = splitFrontmatter(content);
  if (!parts) {
    return { hasFrontmatter: false, meta: null, body: content, parseError: null };
  }

  const doc = parseDocument(parts.yamlText);
  if (doc.errors?.length) {
    return {
      hasFrontmatter: true,
      meta: null,
      body: parts.body,
      parseError: doc.errors.map((e) => e.message).join('; '),
    };
  }

  const meta = doc.toJS();
  if (!isPlainObject(meta)) {
    return {
      hasFrontmatter: true,
      meta: null,
      body: parts.body,
      parseError: 'Frontmatter must be a YAML object',
    };
  }

  return { hasFrontmatter: true, meta, body: parts.body, parseError: null };
}

export function validateNoteFrontmatter(content) {
  const parsed = parseNoteFrontmatter(content);
  if (!parsed.hasFrontmatter) {
    return { ok: false, reason: 'missing_frontmatter' };
  }
  if (parsed.parseError) {
    return { ok: false, reason: 'invalid_yaml_frontmatter' };
  }
  const meta = parsed.meta;
  if (!isPlainObject(meta)) {
    return { ok: false, reason: 'invalid_yaml_frontmatter' };
  }
  if (typeof meta.id !== 'string' || !meta.id.trim()) {
    return { ok: false, reason: 'missing_id' };
  }
  if (!isIsoParseable(meta.created_at)) {
    return { ok: false, reason: 'invalid_created_at' };
  }
  if (!isIsoParseable(meta.updated_at)) {
    return { ok: false, reason: 'invalid_updated_at' };
  }
  return { ok: true, meta, body: parsed.body };
}

function uuidV4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function ensureNoteFrontmatter(content, options = {}) {
  const now = options.nowIso || nowIso();
  const idFactory = options.idFactory || uuidV4;
  const parsed = parseNoteFrontmatter(content);

  let body = parsed.body ?? content;
  let meta = isPlainObject(parsed.meta) ? { ...parsed.meta } : {};
  let changed = false;

  if (!parsed.hasFrontmatter || parsed.parseError) {
    changed = true;
    meta = {};
    body = content;
  }

  if (typeof meta.id !== 'string' || !meta.id.trim()) {
    meta.id = idFactory();
    changed = true;
  }
  if (!isIsoParseable(meta.created_at)) {
    meta.created_at = now;
    changed = true;
  }
  if (!isIsoParseable(meta.updated_at)) {
    meta.updated_at = now;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'tags') && !Array.isArray(meta.tags)) {
    meta.tags = [];
    changed = true;
  }

  const normalizedMeta = {};
  for (const key of ['id', 'created_at', 'updated_at']) {
    if (key in meta) normalizedMeta[key] = meta[key];
  }
  for (const key of Object.keys(meta)) {
    if (!(key in normalizedMeta)) normalizedMeta[key] = meta[key];
  }

  const yaml = stringify(normalizedMeta, { lineWidth: 0 }).trimEnd();
  const normalizedContent = `---\n${yaml}\n---\n\n${body.replace(/^\n+/, '')}`;
  if (!changed && normalizedContent !== content) changed = true;

  return { content: normalizedContent, changed, meta: normalizedMeta };
}
