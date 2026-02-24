import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from './config.js';
import { SyncStore } from './db.js';
import { normalizeRelativePath, normalizeWorkspaceId, resolveWorkspaceFilePath } from './path-utils.js';
import { authPreHandler } from './auth.js';
import { validateNoteFrontmatter } from './note-frontmatter.js';

const DIRECTIONS = ['upload_only', 'download_only', 'bidirectional'];
const CONFLICT_POLICIES = ['latest_modified_wins'];

function nowMs() {
  return Date.now();
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function redactError(err) {
  if (!err) return null;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

function base64ToBuffer(contentBase64) {
  try {
    return Buffer.from(contentBase64, 'base64');
  } catch {
    throw new Error('Invalid base64 payload');
  }
}

function setFileMtime(fullPath, mtimeMs) {
  const t = new Date(Math.max(0, mtimeMs));
  return fsp.utimes(fullPath, t, t).catch(() => {});
}

function jsonSchemas() {
  const fileMeta = {
    type: 'object',
    additionalProperties: false,
    required: ['path', 'sha256', 'size', 'mtimeMs'],
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4096 },
      sha256: { type: 'string', minLength: 1, maxLength: 128 },
      size: { type: 'integer', minimum: 0 },
      mtimeMs: { type: 'integer', minimum: 0 },
    },
  };
  const deleteMeta = {
    type: 'object',
    additionalProperties: false,
    required: ['path', 'deletedAtMs'],
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4096 },
      deletedAtMs: { type: 'integer', minimum: 0 },
    },
  };

  return {
    manifestBody: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'device', 'sync', 'files', 'deletes'],
      properties: {
        workspaceId: { type: 'string', minLength: 1, maxLength: 128 },
        device: {
          type: 'object',
          additionalProperties: false,
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string', minLength: 1, maxLength: 128 },
            deviceName: { type: 'string', maxLength: 128 },
            appVersion: { type: 'string', maxLength: 64 },
            platform: { type: 'string', maxLength: 64 },
          },
        },
        sync: {
          type: 'object',
          additionalProperties: false,
          required: ['direction', 'conflictPolicy'],
          properties: {
            direction: { type: 'string', enum: DIRECTIONS },
            conflictPolicy: { type: 'string', enum: CONFLICT_POLICIES },
          },
        },
        files: { type: 'array', maxItems: 5000, items: fileMeta },
        deletes: { type: 'array', maxItems: 5000, items: deleteMeta },
        cursor: { type: 'string', maxLength: 64 },
      },
    },
    pushBody: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'deviceId', 'files', 'deletes'],
      properties: {
        workspaceId: { type: 'string', minLength: 1, maxLength: 128 },
        deviceId: { type: 'string', minLength: 1, maxLength: 128 },
        files: {
          type: 'array',
          maxItems: 1000,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'sha256', 'size', 'mtimeMs', 'encoding', 'contentBase64'],
            properties: {
              path: { type: 'string', minLength: 1, maxLength: 4096 },
              sha256: { type: 'string', minLength: 1, maxLength: 128 },
              size: { type: 'integer', minimum: 0 },
              mtimeMs: { type: 'integer', minimum: 0 },
              encoding: { type: 'string', const: 'base64' },
              contentBase64: { type: 'string', minLength: 0 },
            },
          },
        },
        deletes: { type: 'array', maxItems: 5000, items: deleteMeta },
      },
    },
    pullBody: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'deviceId', 'paths'],
      properties: {
        workspaceId: { type: 'string', minLength: 1, maxLength: 128 },
        deviceId: { type: 'string', minLength: 1, maxLength: 128 },
        paths: { type: 'array', maxItems: 5000, items: { type: 'string', minLength: 1, maxLength: 4096 } },
      },
    },
    stateQuery: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceId', 'deviceId'],
      properties: {
        workspaceId: { type: 'string', minLength: 1, maxLength: 128 },
        deviceId: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
  };
}

function parseAndSanitizeManifestInput(body) {
  const workspaceId = normalizeWorkspaceId(body.workspaceId);
  const files = body.files.map((f) => ({
    path: normalizeRelativePath(f.path),
    sha256: String(f.sha256).toLowerCase(),
    size: f.size,
    mtimeMs: f.mtimeMs,
  }));
  const deletes = body.deletes.map((d) => ({ path: normalizeRelativePath(d.path), deletedAtMs: d.deletedAtMs }));
  return { workspaceId, files, deletes };
}

async function ensureWorkspaceDir(workspacesRoot, workspaceId) {
  await fsp.mkdir(path.join(workspacesRoot, workspaceId), { recursive: true });
}

function makeRateLimitKey(request) {
  let deviceId = '';
  const q = request.query;
  if (q && typeof q === 'object' && 'deviceId' in q && typeof q.deviceId === 'string') {
    deviceId = q.deviceId;
  }
  const b = request.body;
  if (!deviceId && b && typeof b === 'object' && !Array.isArray(b)) {
    if (typeof b.deviceId === 'string') deviceId = b.deviceId;
    else if (b.device && typeof b.device === 'object' && typeof b.device.deviceId === 'string') {
      deviceId = b.device.deviceId;
    }
  }
  return `${request.ip}:${deviceId || 'anon'}`;
}

export async function buildServer(options = {}) {
  const config = options.config ?? getConfig();
  fs.mkdirSync(config.dataRoot, { recursive: true });
  fs.mkdirSync(config.workspacesRoot, { recursive: true });

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, ip: req.ip };
        },
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.x-signature'],
        censor: '[REDACTED]',
      },
    },
    bodyLimit: config.bodyLimitBytes,
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Keep raw JSON body for optional HMAC validation.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    request.rawBody = body;
    try {
      done(null, JSON.parse(body || '{}'));
    } catch (err) {
      done(err, undefined);
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: makeRateLimitKey,
  });

  const store = new SyncStore({
    sqlitePath: config.sqlitePath,
    schemaSql: fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
    logger: app.log,
  });
  app.decorate('syncStore', store);
  app.decorate('syncConfig', config);

  app.addHook('onRequest', authPreHandler(config));

  app.addHook('onResponse', async (request, _reply) => {
    const durMs = Number(request.elapsedTime?.toFixed?.(1) ?? 0);
    request.log.info({ durMs }, 'request_complete');
  });

  app.addHook('onClose', async () => {
    store.close();
  });

  const schemas = jsonSchemas();

  app.get('/health', async (_request, _reply) => {
    return {
      ok: true,
      service: config.serviceName,
      version: config.version,
      time: new Date().toISOString(),
    };
  });

  app.post('/sync/manifest', { schema: { body: schemas.manifestBody } }, async (request, reply) => {
    const t = nowMs();
    const body = request.body;
    try {
      const { workspaceId, files, deletes } = parseAndSanitizeManifestInput(body);
      await ensureWorkspaceDir(config.workspacesRoot, workspaceId);
      const result = app.syncStore.computeManifestDecision({
        workspaceId,
        device: body.device,
        sync: body.sync,
        clientFiles: files,
        clientDeletes: deletes,
        cursor: body.cursor,
        nowMs: t,
      });
      return result;
    } catch (err) {
      const msg = redactError(err);
      const wid = typeof body?.workspaceId === 'string' ? body.workspaceId : 'unknown';
      const did = typeof body?.device?.deviceId === 'string' ? body.device.deviceId : 'unknown';
      try { app.syncStore.markDeviceError({ workspaceId: wid, deviceId: did, nowMs: t, message: msg }); } catch {}
      request.log.warn({ err: msg }, 'manifest_failed');
      return reply.code(400).send({ error: 'invalid_manifest', message: msg });
    }
  });

  app.post('/sync/push', { schema: { body: schemas.pushBody } }, async (request, reply) => {
    const t = nowMs();
    const body = request.body;
    let workspaceId;
    try {
      workspaceId = normalizeWorkspaceId(body.workspaceId);
      const deviceId = String(body.deviceId);
      await ensureWorkspaceDir(config.workspacesRoot, workspaceId);
      app.syncStore.ensureWorkspace(workspaceId, t);
      app.syncStore.upsertDeviceSeen({ workspaceId, device: { deviceId }, nowMs: t });

      const applied = [];
      const deleted = [];
      const rejected = [];
      const conflicts = [];

      for (const incoming of body.files) {
        let relPath;
        try {
          relPath = normalizeRelativePath(incoming.path);
          const buf = base64ToBuffer(incoming.contentBase64);
          const hash = sha256Hex(buf);
          if (hash !== String(incoming.sha256).toLowerCase()) {
            throw new Error('sha256 mismatch');
          }
          if (buf.length !== incoming.size) {
            throw new Error('size mismatch');
          }
          if (relPath.endsWith('.md')) {
            let text;
            try {
              text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
            } catch {
              throw new Error('invalid_note_frontmatter');
            }
            const validation = validateNoteFrontmatter(text);
            if (!validation.ok) {
              throw new Error('invalid_note_frontmatter');
            }
          }

          const existing = app.syncStore.getFile(workspaceId, relPath);
          if (existing && !existing.deleted && existing.sha256 !== hash && existing.mtime_ms > incoming.mtimeMs) {
            conflicts.push({ path: relPath, clientMtimeMs: incoming.mtimeMs, serverMtimeMs: existing.mtime_ms, resolution: 'server' });
            app.syncStore.logConflict({
              workspaceId,
              path: relPath,
              clientSha: hash,
              serverSha: existing.sha256,
              clientMtimeMs: incoming.mtimeMs,
              serverMtimeMs: existing.mtime_ms,
              resolution: 'server',
              actorDeviceId: deviceId,
              nowMs: t,
            });
            rejected.push({ path: relPath, reason: 'server_newer' });
            continue;
          }

          const fullPath = resolveWorkspaceFilePath(config.workspacesRoot, workspaceId, relPath);
          await fsp.mkdir(path.dirname(fullPath), { recursive: true });
          await fsp.writeFile(fullPath, buf);
          await setFileMtime(fullPath, incoming.mtimeMs);
          app.syncStore.applyUpsert({
            workspaceId,
            path: relPath,
            sha256: hash,
            size: buf.length,
            mtimeMs: incoming.mtimeMs,
            actorDeviceId: deviceId,
            nowMs: t,
          });
          applied.push(relPath);
        } catch (err) {
          rejected.push({ path: relPath ?? incoming.path, reason: redactError(err) });
        }
      }

      for (const d of body.deletes) {
        let relPath;
        try {
          relPath = normalizeRelativePath(d.path);
          const existing = app.syncStore.getFile(workspaceId, relPath);
          if (existing && !existing.deleted && existing.mtime_ms > d.deletedAtMs) {
            conflicts.push({ path: relPath, clientMtimeMs: d.deletedAtMs, serverMtimeMs: existing.mtime_ms, resolution: 'server' });
            app.syncStore.logConflict({
              workspaceId,
              path: relPath,
              clientSha: null,
              serverSha: existing.sha256,
              clientMtimeMs: d.deletedAtMs,
              serverMtimeMs: existing.mtime_ms,
              resolution: 'server',
              actorDeviceId: body.deviceId,
              nowMs: t,
            });
            rejected.push({ path: relPath, reason: 'server_newer' });
            continue;
          }

          const fullPath = resolveWorkspaceFilePath(config.workspacesRoot, workspaceId, relPath);
          await fsp.rm(fullPath, { force: true });
          app.syncStore.applyDelete({
            workspaceId,
            path: relPath,
            deletedAtMs: d.deletedAtMs,
            actorDeviceId: body.deviceId,
            nowMs: t,
          });
          deleted.push(relPath);
        } catch (err) {
          rejected.push({ path: relPath ?? d.path, reason: redactError(err) });
        }
      }

      const nextCursor = app.syncStore.getNextCursor(workspaceId);
      app.syncStore.markSyncSuccess({ workspaceId, deviceId: body.deviceId, nowMs: t, nextCursor });
      return { applied, deleted, rejected, conflicts, nextCursor };
    } catch (err) {
      const msg = redactError(err);
      if (workspaceId && typeof body?.deviceId === 'string') {
        try { app.syncStore.markDeviceError({ workspaceId, deviceId: body.deviceId, nowMs: t, message: msg }); } catch {}
      }
      request.log.warn({ err: msg }, 'push_failed');
      return reply.code(400).send({ error: 'invalid_push', message: msg });
    }
  });

  app.post('/sync/pull', { schema: { body: schemas.pullBody } }, async (request, reply) => {
    const t = nowMs();
    const body = request.body;
    try {
      const workspaceId = normalizeWorkspaceId(body.workspaceId);
      const deviceId = String(body.deviceId);
      app.syncStore.ensureWorkspace(workspaceId, t);
      app.syncStore.upsertDeviceSeen({ workspaceId, device: { deviceId }, nowMs: t });

      const files = [];
      const missing = [];
      for (const p of body.paths) {
        const relPath = normalizeRelativePath(p);
        const meta = app.syncStore.getFile(workspaceId, relPath);
        if (!meta || meta.deleted) {
          missing.push(relPath);
          continue;
        }
        const fullPath = resolveWorkspaceFilePath(config.workspacesRoot, workspaceId, relPath);
        try {
          const buf = await fsp.readFile(fullPath);
          files.push({
            path: relPath,
            sha256: sha256Hex(buf),
            size: buf.length,
            mtimeMs: meta.mtime_ms,
            encoding: 'base64',
            contentBase64: buf.toString('base64'),
          });
        } catch {
          missing.push(relPath);
        }
      }
      const nextCursor = app.syncStore.getNextCursor(workspaceId);
      app.syncStore.markSyncSuccess({ workspaceId, deviceId, nowMs: t, nextCursor });
      return { files, missing, nextCursor };
    } catch (err) {
      const msg = redactError(err);
      const wid = typeof body?.workspaceId === 'string' ? body.workspaceId : undefined;
      if (wid && typeof body?.deviceId === 'string') {
        try { app.syncStore.markDeviceError({ workspaceId: wid, deviceId: body.deviceId, nowMs: t, message: msg }); } catch {}
      }
      request.log.warn({ err: msg }, 'pull_failed');
      return reply.code(400).send({ error: 'invalid_pull', message: msg });
    }
  });

  app.get('/sync/state', { schema: { querystring: schemas.stateQuery } }, async (request, reply) => {
    try {
      const workspaceId = normalizeWorkspaceId(request.query.workspaceId);
      const deviceId = String(request.query.deviceId);
      const state = app.syncStore.getState({ workspaceId, deviceId });
      if (!state) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return {
        workspaceId: state.workspaceId,
        deviceId: state.deviceId,
        lastSeenAtMs: state.lastSeenAtMs,
        lastSyncAtMs: state.lastSyncAtMs,
        pendingServerChanges: state.pendingServerChanges,
        lastError: state.lastError,
      };
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_state_query', message: redactError(err) });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      request.log.warn({ validation: error.validation }, 'validation_failed');
      return reply.code(400).send({ error: 'validation_error', details: error.validation });
    }
    request.log.error({ err: error.message }, 'unhandled_error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  return app;
}
