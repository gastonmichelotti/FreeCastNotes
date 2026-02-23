import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const CURSOR_PREFIX = 'srv-';

function cursorFromId(id) {
  return `${CURSOR_PREFIX}${String(id).padStart(9, '0')}`;
}

function parseCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return 0;
  const m = /^srv-(\d+)$/.exec(cursor.trim());
  return m ? Number.parseInt(m[1], 10) || 0 : 0;
}

export class SyncStore {
  constructor({ sqlitePath, schemaSql, logger }) {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
    this.db = new Database(sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(schemaSql);
    this.log = logger;

    this.stmts = {
      ensureWorkspace: this.db.prepare(`
        INSERT INTO workspaces (id, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at_ms = excluded.updated_at_ms
      `),
      upsertDevice: this.db.prepare(`
        INSERT INTO devices (id, workspace_id, name, app_version, platform, last_seen_at_ms, last_sync_at_ms, last_cursor, last_error)
        VALUES (@id, @workspace_id, @name, @app_version, @platform, @last_seen_at_ms, @last_sync_at_ms, @last_cursor, @last_error)
        ON CONFLICT(id) DO UPDATE SET
          workspace_id=excluded.workspace_id,
          name=excluded.name,
          app_version=excluded.app_version,
          platform=excluded.platform,
          last_seen_at_ms=excluded.last_seen_at_ms,
          last_sync_at_ms=COALESCE(excluded.last_sync_at_ms, devices.last_sync_at_ms),
          last_cursor=COALESCE(excluded.last_cursor, devices.last_cursor),
          last_error=excluded.last_error
      `),
      getAllFiles: this.db.prepare(`
        SELECT path, sha256, size, mtime_ms, deleted, updated_by_device_id, updated_at_ms
        FROM files WHERE workspace_id = ?
      `),
      getFile: this.db.prepare(`
        SELECT workspace_id, path, sha256, size, mtime_ms, deleted, updated_by_device_id, updated_at_ms
        FROM files WHERE workspace_id = ? AND path = ?
      `),
      upsertFile: this.db.prepare(`
        INSERT INTO files (workspace_id, path, sha256, size, mtime_ms, deleted, updated_by_device_id, updated_at_ms)
        VALUES (@workspace_id, @path, @sha256, @size, @mtime_ms, @deleted, @updated_by_device_id, @updated_at_ms)
        ON CONFLICT(workspace_id, path) DO UPDATE SET
          sha256=excluded.sha256,
          size=excluded.size,
          mtime_ms=excluded.mtime_ms,
          deleted=excluded.deleted,
          updated_by_device_id=excluded.updated_by_device_id,
          updated_at_ms=excluded.updated_at_ms
      `),
      insertChange: this.db.prepare(`
        INSERT INTO change_log (workspace_id, path, op, sha256, size, mtime_ms, actor_device_id, created_at_ms)
        VALUES (@workspace_id, @path, @op, @sha256, @size, @mtime_ms, @actor_device_id, @created_at_ms)
      `),
      insertConflict: this.db.prepare(`
        INSERT INTO conflicts (workspace_id, path, client_sha256, server_sha256, client_mtime_ms, server_mtime_ms, resolution, created_at_ms, actor_device_id)
        VALUES (@workspace_id, @path, @client_sha256, @server_sha256, @client_mtime_ms, @server_mtime_ms, @resolution, @created_at_ms, @actor_device_id)
      `),
      getDevice: this.db.prepare(`
        SELECT id, workspace_id, name, app_version, platform, last_seen_at_ms, last_sync_at_ms, last_cursor, last_error
        FROM devices WHERE id = ? AND workspace_id = ?
      `),
      countChangesSince: this.db.prepare(`
        SELECT COUNT(*) AS c FROM change_log WHERE workspace_id = ? AND id > ?
      `),
      getMaxChangeId: this.db.prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM change_log WHERE workspace_id = ?`),
      touchDeviceSyncSuccess: this.db.prepare(`
        UPDATE devices SET last_seen_at_ms = ?, last_sync_at_ms = ?, last_cursor = ?, last_error = NULL WHERE id = ? AND workspace_id = ?
      `),
      touchDeviceSeen: this.db.prepare(`
        UPDATE devices SET last_seen_at_ms = ?, last_error = ? WHERE id = ? AND workspace_id = ?
      `),
    };
  }

  close() {
    this.db.close();
  }

  ensureWorkspace(workspaceId, nowMs) {
    this.stmts.ensureWorkspace.run(workspaceId, nowMs, nowMs);
  }

  upsertDeviceSeen({ workspaceId, device, nowMs, lastCursor = null, lastSyncAtMs = null, lastError = null }) {
    this.stmts.upsertDevice.run({
      id: device.deviceId,
      workspace_id: workspaceId,
      name: device.deviceName ?? null,
      app_version: device.appVersion ?? null,
      platform: device.platform ?? null,
      last_seen_at_ms: nowMs,
      last_sync_at_ms: lastSyncAtMs,
      last_cursor: lastCursor,
      last_error: lastError,
    });
  }

  getWorkspaceFileMap(workspaceId) {
    const rows = this.stmts.getAllFiles.all(workspaceId);
    return new Map(rows.map((r) => [r.path, r]));
  }

  getFile(workspaceId, filePath) {
    return this.stmts.getFile.get(workspaceId, filePath);
  }

  logConflict({ workspaceId, path, clientSha, serverSha, clientMtimeMs, serverMtimeMs, resolution, actorDeviceId, nowMs }) {
    this.stmts.insertConflict.run({
      workspace_id: workspaceId,
      path,
      client_sha256: clientSha ?? null,
      server_sha256: serverSha ?? null,
      client_mtime_ms: clientMtimeMs ?? null,
      server_mtime_ms: serverMtimeMs ?? null,
      resolution,
      created_at_ms: nowMs,
      actor_device_id: actorDeviceId ?? null,
    });
  }

  applyUpsert({ workspaceId, path, sha256, size, mtimeMs, actorDeviceId, nowMs }) {
    this.stmts.upsertFile.run({
      workspace_id: workspaceId,
      path,
      sha256,
      size,
      mtime_ms: mtimeMs,
      deleted: 0,
      updated_by_device_id: actorDeviceId ?? null,
      updated_at_ms: nowMs,
    });
    const info = this.stmts.insertChange.run({
      workspace_id: workspaceId,
      path,
      op: 'upsert',
      sha256,
      size,
      mtime_ms: mtimeMs,
      actor_device_id: actorDeviceId ?? null,
      created_at_ms: nowMs,
    });
    return info.lastInsertRowid;
  }

  applyDelete({ workspaceId, path, deletedAtMs, actorDeviceId, nowMs }) {
    this.stmts.upsertFile.run({
      workspace_id: workspaceId,
      path,
      sha256: '',
      size: 0,
      mtime_ms: deletedAtMs,
      deleted: 1,
      updated_by_device_id: actorDeviceId ?? null,
      updated_at_ms: nowMs,
    });
    const info = this.stmts.insertChange.run({
      workspace_id: workspaceId,
      path,
      op: 'delete',
      sha256: null,
      size: 0,
      mtime_ms: deletedAtMs,
      actor_device_id: actorDeviceId ?? null,
      created_at_ms: nowMs,
    });
    return info.lastInsertRowid;
  }

  getNextCursor(workspaceId) {
    const row = this.stmts.getMaxChangeId.get(workspaceId);
    return cursorFromId(row?.id ?? 0);
  }

  markSyncSuccess({ workspaceId, deviceId, nowMs, nextCursor }) {
    this.stmts.touchDeviceSyncSuccess.run(nowMs, nowMs, nextCursor, deviceId, workspaceId);
  }

  markDeviceError({ workspaceId, deviceId, nowMs, message }) {
    this.stmts.touchDeviceSeen.run(nowMs, message, deviceId, workspaceId);
  }

  getState({ workspaceId, deviceId }) {
    const device = this.stmts.getDevice.get(deviceId, workspaceId);
    if (!device) return null;
    const pending = this.stmts.countChangesSince.get(workspaceId, parseCursor(device.last_cursor));
    return {
      workspaceId,
      deviceId,
      lastSeenAtMs: device.last_seen_at_ms ?? null,
      lastSyncAtMs: device.last_sync_at_ms ?? null,
      pendingServerChanges: pending?.c ?? 0,
      lastError: device.last_error ?? null,
      lastCursor: device.last_cursor ?? null,
    };
  }

  computeManifestDecision({ workspaceId, device, sync, clientFiles, clientDeletes, cursor, nowMs }) {
    const direction = sync.direction || 'bidirectional';
    const conflictPolicy = sync.conflictPolicy || 'latest_modified_wins';
    const canUpload = direction === 'bidirectional' || direction === 'upload_only';
    const canDownload = direction === 'bidirectional' || direction === 'download_only';

    this.ensureWorkspace(workspaceId, nowMs);
    this.upsertDeviceSeen({ workspaceId, device, nowMs, lastCursor: cursor ?? null });

    const serverMap = this.getWorkspaceFileMap(workspaceId);
    const clientMap = new Map(clientFiles.map((f) => [f.path, f]));
    const deleteMap = new Map(clientDeletes.map((d) => [d.path, d]));

    const push = [];
    const pull = [];
    const conflicts = [];
    const acceptDeletes = [];

    for (const [p, clientFile] of clientMap) {
      const server = serverMap.get(p);
      if (!server || server.deleted) {
        if (canUpload) push.push(p);
        continue;
      }
      if (server.sha256 === clientFile.sha256) continue;

      const clientNewer = clientFile.mtimeMs > server.mtime_ms;
      const serverNewer = server.mtime_ms > clientFile.mtimeMs;
      if (!clientNewer && !serverNewer) {
        // Same mtime different content: deterministic tie-breaker to server
        if (canDownload) {
          pull.push(p);
        } else {
          conflicts.push({
            path: p,
            clientMtimeMs: clientFile.mtimeMs,
            serverMtimeMs: server.mtime_ms,
            resolution: 'server',
          });
        }
        this.logConflict({
          workspaceId,
          path: p,
          clientSha: clientFile.sha256,
          serverSha: server.sha256,
          clientMtimeMs: clientFile.mtimeMs,
          serverMtimeMs: server.mtime_ms,
          resolution: 'server',
          actorDeviceId: device.deviceId,
          nowMs,
        });
        continue;
      }

      const winner = clientNewer ? 'client' : 'server';
      if (winner === 'client') {
        if (canUpload) {
          push.push(p);
        } else {
          conflicts.push({ path: p, clientMtimeMs: clientFile.mtimeMs, serverMtimeMs: server.mtime_ms, resolution: 'server' });
        }
      } else if (canDownload) {
        pull.push(p);
      } else {
        conflicts.push({ path: p, clientMtimeMs: clientFile.mtimeMs, serverMtimeMs: server.mtime_ms, resolution: 'client' });
      }

      if (winner === 'client' || winner === 'server') {
        this.logConflict({
          workspaceId,
          path: p,
          clientSha: clientFile.sha256,
          serverSha: server.sha256,
          clientMtimeMs: clientFile.mtimeMs,
          serverMtimeMs: server.mtime_ms,
          resolution: (winner === 'client' ? 'client' : 'server'),
          actorDeviceId: device.deviceId,
          nowMs,
        });
      }
      void conflictPolicy;
    }

    for (const [p, server] of serverMap) {
      if (clientMap.has(p)) continue;
      if (deleteMap.has(p)) continue;
      if (server.deleted) continue;
      if (canDownload) pull.push(p);
    }

    for (const [p, del] of deleteMap) {
      const server = serverMap.get(p);
      if (!canUpload) continue;
      if (!server || server.deleted) {
        acceptDeletes.push(p);
        continue;
      }
      if (del.deletedAtMs >= server.mtime_ms) {
        acceptDeletes.push(p);
      } else {
        conflicts.push({
          path: p,
          clientMtimeMs: del.deletedAtMs,
          serverMtimeMs: server.mtime_ms,
          resolution: 'server',
        });
        this.logConflict({
          workspaceId,
          path: p,
          clientSha: null,
          serverSha: server.sha256,
          clientMtimeMs: del.deletedAtMs,
          serverMtimeMs: server.mtime_ms,
          resolution: 'server',
          actorDeviceId: device.deviceId,
          nowMs,
        });
      }
    }

    return {
      serverTimeMs: nowMs,
      decision: {
        push: [...new Set(push)].sort(),
        pull: [...new Set(pull)].sort(),
        conflicts,
        acceptDeletes: [...new Set(acceptDeletes)].sort(),
      },
      nextCursor: this.getNextCursor(workspaceId),
    };
  }
}

export { cursorFromId, parseCursor };
