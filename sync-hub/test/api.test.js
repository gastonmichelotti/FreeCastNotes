import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildServer } from '../src/server.js';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function authHeaders() {
  return { authorization: 'Bearer test-token', 'content-type': 'application/json' };
}

test('sync hub MVP flow', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'freecast-sync-hub-'));
  const app = await buildServer({
    config: {
      serviceName: 'freecast-sync-hub',
      version: '0.1.0',
      host: '127.0.0.1',
      port: 0,
      token: 'test-token',
      hmacSecret: '',
      dataRoot: temp,
      workspacesRoot: path.join(temp, 'workspaces'),
      sqlitePath: path.join(temp, 'state.sqlite'),
      bodyLimitBytes: 10 * 1024 * 1024,
    },
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().ok, true);

  const unauthorized = await app.inject({
    method: 'POST',
    url: '/sync/state?workspaceId=gato-main&deviceId=x',
  });
  assert.equal(unauthorized.statusCode, 401);

  const notePath = 'projects/freecast-landing/brief.md';
  const noteBody = Buffer.from('# hola\n');
  const noteHash = sha256Hex(noteBody);
  const mtime = Date.now();

  const manifest1 = await app.inject({
    method: 'POST',
    url: '/sync/manifest',
    headers: authHeaders(),
    payload: {
      workspaceId: 'gato-main',
      device: { deviceId: 'macbook-gato-001', deviceName: 'MacBook Gato', appVersion: '1.2.0', platform: 'macOS' },
      sync: { direction: 'bidirectional', conflictPolicy: 'latest_modified_wins' },
      files: [{ path: notePath, sha256: noteHash, size: noteBody.length, mtimeMs: mtime }],
      deletes: [],
      cursor: null,
    },
  });
  assert.equal(manifest1.statusCode, 200);
  assert.deepEqual(manifest1.json().decision.push, [notePath]);

  const push = await app.inject({
    method: 'POST',
    url: '/sync/push',
    headers: authHeaders(),
    payload: {
      workspaceId: 'gato-main',
      deviceId: 'macbook-gato-001',
      files: [{ path: notePath, sha256: noteHash, size: noteBody.length, mtimeMs: mtime, encoding: 'base64', contentBase64: noteBody.toString('base64') }],
      deletes: [],
    },
  });
  assert.equal(push.statusCode, 200);
  assert.deepEqual(push.json().applied, [notePath]);

  const manifest2 = await app.inject({
    method: 'POST',
    url: '/sync/manifest',
    headers: authHeaders(),
    payload: {
      workspaceId: 'gato-main',
      device: { deviceId: 'iphone-gato-001', deviceName: 'iPhone Gato', appVersion: '1.2.0', platform: 'iOS' },
      sync: { direction: 'bidirectional', conflictPolicy: 'latest_modified_wins' },
      files: [],
      deletes: [],
      cursor: null,
    },
  });
  assert.equal(manifest2.statusCode, 200);
  assert.deepEqual(manifest2.json().decision.pull, [notePath]);

  const pull = await app.inject({
    method: 'POST',
    url: '/sync/pull',
    headers: authHeaders(),
    payload: { workspaceId: 'gato-main', deviceId: 'iphone-gato-001', paths: [notePath] },
  });
  assert.equal(pull.statusCode, 200);
  assert.equal(pull.json().files.length, 1);
  assert.equal(pull.json().files[0].path, notePath);
  assert.equal(Buffer.from(pull.json().files[0].contentBase64, 'base64').toString('utf8'), noteBody.toString('utf8'));

  const state = await app.inject({
    method: 'GET',
    url: '/sync/state?workspaceId=gato-main&deviceId=iphone-gato-001',
    headers: { authorization: 'Bearer test-token' },
  });
  assert.equal(state.statusCode, 200);
  assert.equal(state.json().workspaceId, 'gato-main');
  assert.equal(typeof state.json().pendingServerChanges, 'number');

  const traversal = await app.inject({
    method: 'POST',
    url: '/sync/push',
    headers: authHeaders(),
    payload: {
      workspaceId: 'gato-main',
      deviceId: 'macbook-gato-001',
      files: [{
        path: '../escape.md',
        sha256: noteHash,
        size: noteBody.length,
        mtimeMs: mtime + 1,
        encoding: 'base64',
        contentBase64: noteBody.toString('base64'),
      }],
      deletes: [],
    },
  });
  assert.equal(traversal.statusCode, 200);
  assert.equal(traversal.json().rejected.length, 1);
});
