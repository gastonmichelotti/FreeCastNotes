import path from 'node:path';

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig() {
  const dataRoot = process.env.SYNC_DATA_ROOT || '/home/opc/documents/freecast-sync';
  const bodyLimitMb = parsePositiveInt(process.env.SYNC_BODY_LIMIT_MB, 10);
  const token = process.env.SYNC_TOKEN || '';

  return {
    serviceName: 'freecast-sync-hub',
    version: '0.1.0',
    host: process.env.HOST || '0.0.0.0',
    port: parsePositiveInt(process.env.PORT, 8787),
    token,
    hmacSecret: process.env.SYNC_HMAC_SECRET || '',
    dataRoot,
    workspacesRoot: path.join(dataRoot, 'workspaces'),
    sqlitePath: process.env.SYNC_SQLITE_PATH || path.join(dataRoot, 'state.sqlite'),
    bodyLimitBytes: bodyLimitMb * 1024 * 1024,
    defaultDirection: 'bidirectional',
    defaultConflictPolicy: 'latest_modified_wins',
  };
}
