PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT,
  app_version TEXT,
  platform TEXT,
  last_seen_at_ms INTEGER,
  last_sync_at_ms INTEGER,
  last_cursor TEXT,
  last_error TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_by_device_id TEXT,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, path),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  sha256 TEXT,
  size INTEGER,
  mtime_ms INTEGER NOT NULL,
  actor_device_id TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  client_sha256 TEXT,
  server_sha256 TEXT,
  client_mtime_ms INTEGER,
  server_mtime_ms INTEGER,
  resolution TEXT NOT NULL CHECK (resolution IN ('client','server')),
  created_at_ms INTEGER NOT NULL,
  actor_device_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_workspace_mtime ON files(workspace_id, mtime_ms DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_workspace_id ON change_log(workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_devices_workspace ON devices(workspace_id);
