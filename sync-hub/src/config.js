import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveDataRoot(rawValue) {
  const raw = (rawValue || './data').trim();
  if (!raw) return path.resolve(projectRoot, 'data');
  return path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
}

export function getConfig() {
  const dataRoot = resolveDataRoot(process.env.SYNC_DATA_ROOT);
  const bodyLimitMb = parsePositiveInt(process.env.SYNC_BODY_LIMIT_MB, 10);
  const token = process.env.SYNC_TOKEN || '';

  return {
    serviceName: 'freecast-sync-hub',
    version: '0.1.0',
    host: process.env.HOST || '0.0.0.0',
    port: parsePositiveInt(process.env.SYNC_PORT ?? process.env.PORT, 8787),
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
