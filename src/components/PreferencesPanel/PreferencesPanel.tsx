import { useEffect, useMemo, useState } from "react";
import type { SortOrder } from "../../types/index";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../lib/bridge";

interface PreferencesPanelProps {
  open: boolean;
  currentShortcut: string;
  onClose: () => void;
  onSaveShortcut: (shortcut: string) => Promise<void>;
  /** When true, rendered in the standalone Preferences window (no overlay, close = hide window) */
  standalone?: boolean;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

type SyncSettingsDraft = {
  enabled: boolean;
  serverURL: string;
  workspaceId: string;
  deviceName: string;
  deviceId: string;
  mode: "manual" | "auto";
  intervalSeconds: 30 | 60 | 300;
  direction: "upload_only" | "download_only" | "bidirectional";
  conflictPolicy: "latest_modified_wins";
  hasToken: boolean;
  apiTokenMasked: string;
};

type SyncStatus = {
  enabled: boolean;
  configured: boolean;
  isRunning: boolean;
  mode: string;
  intervalSeconds: number;
  direction: string;
  conflictPolicy: string;
  lastSyncAtMs: number | null;
  lastError: string | null;
  pendingUploads: number;
  pendingDownloads: number;
  health: "green" | "yellow" | "red" | "gray";
  serverReachable: boolean | null;
};

type SyncLogEntry = { tsMs: number; message: string };

const DEFAULT_SYNC_SETTINGS: SyncSettingsDraft = {
  enabled: false,
  serverURL: "",
  workspaceId: "",
  deviceName: "Mac",
  deviceId: "mac-local",
  mode: "auto",
  intervalSeconds: 60,
  direction: "bidirectional",
  conflictPolicy: "latest_modified_wins",
  hasToken: false,
  apiTokenMasked: "",
};

const DEFAULT_SYNC_STATUS: SyncStatus = {
  enabled: false,
  configured: false,
  isRunning: false,
  mode: "auto",
  intervalSeconds: 60,
  direction: "bidirectional",
  conflictPolicy: "latest_modified_wins",
  lastSyncAtMs: null,
  lastError: null,
  pendingUploads: 0,
  pendingDownloads: 0,
  health: "gray",
  serverReachable: null,
};

export default function PreferencesPanel({
  open,
  currentShortcut,
  onClose,
  onSaveShortcut,
  standalone = false,
}: PreferencesPanelProps) {
  const { layoutMode, setLayoutMode, sortOrder, setSortOrder, notes, loadNotes } = useAppStore();
  const [shortcutValue, setShortcutValue] = useState(currentShortcut);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultFolder, setVaultFolder] = useState("~/Documents/FreeCastNotes");
  const [movingVault, setMovingVault] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettingsDraft>(DEFAULT_SYNC_SETTINGS);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);
  const [syncActionBusy, setSyncActionBusy] = useState<null | "test" | "sync" | "logs">(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncTokenInput, setSyncTokenInput] = useState("");
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);

  const refreshSyncState = async () => {
    try {
      setSyncLoading(true);
      const [rawSettings, rawStatus] = await Promise.all([
        bridge.syncGetSettings(),
        bridge.syncGetStatus(),
      ]);
      setSyncSettings(parseSyncSettings(rawSettings));
      setSyncStatus(parseSyncStatus(rawStatus));
    } catch {
      setSyncFeedback("Could not load sync settings/status.");
    } finally {
      setSyncLoading(false);
    }
  };

  const saveSyncSettingsPatch = async (patch: Partial<SyncSettingsDraft>) => {
    const next = { ...syncSettings, ...patch };
    setSyncSettings(next);
    setSyncSaving(true);
    setSyncFeedback(null);
    try {
      const result = await bridge.syncSetSettings(patch as Record<string, unknown>);
      const ok = Boolean((result as { ok?: unknown }).ok);
      if (!ok) {
        const message = getString((result as Record<string, unknown>).error) ?? "Failed to save sync settings";
        setSyncFeedback(message);
      } else {
        const saved = (result as Record<string, unknown>).settings;
        if (saved && typeof saved === "object") {
          setSyncSettings(parseSyncSettings(saved as Record<string, unknown>));
        }
        const statusRaw = await bridge.syncGetStatus();
        setSyncStatus(parseSyncStatus(statusRaw));
      }
    } catch (e) {
      setSyncFeedback(e instanceof Error ? e.message : "Failed to save sync settings");
    } finally {
      setSyncSaving(false);
    }
  };

  const handleSyncTestConnection = async () => {
    setSyncActionBusy("test");
    setSyncFeedback(null);
    try {
      const result = await bridge.syncTestConnection();
      const ok = Boolean((result as { ok?: unknown }).ok);
      if (ok) {
        setSyncFeedback("Connection OK");
      } else {
        setSyncFeedback(getString((result as Record<string, unknown>).error) ?? "Connection test failed");
      }
      const statusRaw = await bridge.syncGetStatus();
      setSyncStatus(parseSyncStatus(statusRaw));
    } catch (e) {
      setSyncFeedback(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setSyncActionBusy(null);
    }
  };

  const handleSyncRunNow = async () => {
    setSyncActionBusy("sync");
    setSyncFeedback(null);
    try {
      const result = await bridge.syncRunNow();
      const ok = Boolean((result as { ok?: unknown }).ok);
      setSyncFeedback(
        ok
          ? "Sync completed"
          : (getString((result as Record<string, unknown>).error) ?? "Sync failed"),
      );
      const statusValue = (result as Record<string, unknown>).status;
      if (statusValue && typeof statusValue === "object") {
        setSyncStatus(parseSyncStatus(statusValue as Record<string, unknown>));
      } else {
        const statusRaw = await bridge.syncGetStatus();
        setSyncStatus(parseSyncStatus(statusRaw));
      }
    } catch (e) {
      setSyncFeedback(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncActionBusy(null);
    }
  };

  const handleSyncLogsToggle = async () => {
    const nextOpen = !syncLogsOpen;
    setSyncLogsOpen(nextOpen);
    if (!nextOpen) return;
    setSyncActionBusy("logs");
    try {
      const logsRaw = await bridge.syncGetLastErrors();
      setSyncLogs(Array.isArray(logsRaw) ? logsRaw.map(parseSyncLog).filter(Boolean) as SyncLogEntry[] : []);
    } catch {
      setSyncFeedback("Could not load sync logs.");
    } finally {
      setSyncActionBusy(null);
    }
  };

  const handleSyncTokenUpdate = async () => {
    const token = syncTokenInput.trim();
    if (token.length > 0 && token.length < 8) {
      setSyncFeedback("API token must be at least 8 characters.");
      return;
    }
    setSyncSaving(true);
    try {
      const result = await bridge.syncSetSettings({ apiToken: token });
      const ok = Boolean((result as { ok?: unknown }).ok);
      if (!ok) {
        setSyncFeedback(getString((result as Record<string, unknown>).error) ?? "Failed to update token");
        return;
      }
      const saved = (result as Record<string, unknown>).settings;
      if (saved && typeof saved === "object") {
        setSyncSettings(parseSyncSettings(saved as Record<string, unknown>));
      }
      setSyncTokenInput("");
      setSyncFeedback(token ? "API token updated" : "API token cleared");
      const statusRaw = await bridge.syncGetStatus();
      setSyncStatus(parseSyncStatus(statusRaw));
    } catch (e) {
      setSyncFeedback(e instanceof Error ? e.message : "Failed to update token");
    } finally {
      setSyncSaving(false);
    }
  };

  useEffect(() => {
    if (!open && !standalone) return;
    setShortcutValue(currentShortcut);
    setRecording(false);
    setSaving(false);
    setError(null);
    bridge.vaultGetFolder().then(setVaultFolder).catch(() => {});
    bridge.getLaunchAtLogin().then(setLaunchAtLogin).catch(() => {});
    void refreshSyncState();
    // In standalone window the store never ran loadNotes(); load from vault so note count is correct
    if (standalone) {
      loadNotes().catch(() => {});
    }
  }, [open, currentShortcut, standalone, loadNotes]);

  useEffect(() => {
    if (!open && !standalone) return;
    const timer = window.setInterval(() => {
      bridge.syncGetStatus()
        .then((raw) => setSyncStatus(parseSyncStatus(raw)))
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, standalone]);

  useEffect(() => {
    if ((!open && !standalone) || !recording) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRecording(false);
        return;
      }
      if (MODIFIER_KEYS.has(e.key)) {
        e.preventDefault();
        return;
      }
      const captured = toShortcutString(e);
      if (!captured) return;
      e.preventDefault();
      setShortcutValue(captured);
      setRecording(false);
      setError(null);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, standalone, recording]);

  const prettyShortcut = useMemo(
    () => formatShortcut(shortcutValue),
    [shortcutValue],
  );

  const handleChangeVaultFolder = async () => {
    try {
      setMovingVault(true);
      const newPath = await bridge.vaultSetFolder();
      if (newPath) {
        setVaultFolder(newPath);
        await loadNotes();
      }
    } finally {
      setMovingVault(false);
    }
  };

  const handleToggleLaunchAtLogin = async () => {
    const next = !launchAtLogin;
    const success = await bridge.setLaunchAtLogin(next);
    if (success) setLaunchAtLogin(next);
  };

  if (!open && !standalone) return null;

  // Standalone: Escape closes the Preferences window
  useEffect(() => {
    if (!standalone) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [standalone, onClose]);

  const handleSaveShortcut = async () => {
    if (!hasModifier(shortcutValue)) {
      setError("Use at least one modifier key (Cmd/Ctrl, Shift or Alt).");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSaveShortcut(shortcutValue);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update global shortcut",
      );
    } finally {
      setSaving(false);
    }
  };

  const syncServerURLValid =
    !syncSettings.serverURL.trim() || isHttpUrl(syncSettings.serverURL.trim());
  const syncWorkspaceIdValid = syncSettings.workspaceId.trim().length > 0;
  const syncCanRunActions =
    syncSettings.serverURL.trim().length > 0 &&
    syncServerURLValid &&
    syncWorkspaceIdValid &&
    syncSettings.hasToken &&
    !syncStatus.isRunning;
  const syncHealthDotClass =
    syncStatus.health === "green"
      ? "bg-emerald-400"
      : syncStatus.health === "yellow"
        ? "bg-amber-400"
        : syncStatus.health === "red"
          ? "bg-rose-400"
          : "bg-white/25";

  const panelContent = (
    <div
      className={
        standalone
          ? "w-[400px] overflow-y-auto rounded-xl border border-white/12 bg-[#2C2C2E] shadow-2xl"
          : "animate-panel-in w-[400px] overflow-hidden rounded-xl border border-white/12 bg-[#2C2C2E] shadow-2xl"
      }
      onClick={standalone ? undefined : (e) => e.stopPropagation()}
    >
        {/* Header */}
        <div className="border-b border-white/8 px-4 py-3">
          <h3 className="text-sm font-semibold text-[#E5E5E7]">Preferences</h3>
        </div>

        <div className="divide-y divide-white/8">
          {/* Vault Folder section */}
          <div className="space-y-2 px-4 py-4">
            <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
              Vault Folder
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] text-[#E5E5E7]/75">
                  {vaultFolder.replace(/^\/Users\/[^/]+/, "~")}
                </p>
                <p className="text-[11px] text-[#E5E5E7]/35">
                  {notes.length} {notes.length === 1 ? "note" : "notes"}
                </p>
              </div>
              <button
                onClick={handleChangeVaultFolder}
                disabled={movingVault}
                className="shrink-0 rounded-md px-2.5 py-1 text-[11px] text-[#E5E5E7]/65 transition-colors hover:bg-white/8 hover:text-[#E5E5E7] disabled:opacity-50"
              >
                {movingVault ? "Moving…" : "Change Location…"}
              </button>
            </div>
          </div>

          {/* Launch at Login */}
          <div className="space-y-2 px-4 py-4">
            <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
              Launch at Login
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-xs text-[#E5E5E7]/80">
                Start FreeCast Notes when you log in
              </p>
              <button
                type="button"
                onClick={handleToggleLaunchAtLogin}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  launchAtLogin
                    ? "bg-[#FF5F5A]/22 text-[#E5E5E7]"
                    : "bg-white/10 text-[#E5E5E7]/70 hover:bg-white/15"
                }`}
              >
                {launchAtLogin ? "On" : "Off"}
              </button>
            </div>
          </div>

          {/* Layout section */}
          <div className="space-y-2 px-4 py-4">
            <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
              Layout
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setLayoutMode("single")}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  layoutMode === "single"
                    ? "border-[#FF5F5A]/60 bg-[#FF5F5A]/12 text-[#E5E5E7]"
                    : "border-white/10 bg-white/5 text-[#E5E5E7]/70 hover:bg-white/8"
                }`}
              >
                <span className="block text-xs font-medium">Single</span>
                <span className="block text-[11px] text-[#E5E5E7]/40">
                  Editor only
                </span>
              </button>
              <button
                onClick={() => setLayoutMode("split")}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  layoutMode === "split"
                    ? "border-[#FF5F5A]/60 bg-[#FF5F5A]/12 text-[#E5E5E7]"
                    : "border-white/10 bg-white/5 text-[#E5E5E7]/70 hover:bg-white/8"
                }`}
              >
                <span className="block text-xs font-medium">Split</span>
                <span className="block text-[11px] text-[#E5E5E7]/40">
                  List + Editor
                </span>
              </button>
            </div>
          </div>

          {/* Sort section */}
          <div className="space-y-2 px-4 py-4">
            <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
              Sort Notes By
            </p>
            <div className="flex flex-col gap-1">
              {(
                [
                  { value: "modified", label: "Last Modified", desc: "Most recently edited first" },
                  { value: "opened",   label: "Last Opened",   desc: "Most recently viewed first" },
                  { value: "title",    label: "Title",         desc: "Alphabetical A → Z" },
                ] as { value: SortOrder; label: string; desc: string }[]
              ).map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setSortOrder(value)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    sortOrder === value
                      ? "border-[#FF5F5A]/60 bg-[#FF5F5A]/12 text-[#E5E5E7]"
                      : "border-white/10 bg-white/5 text-[#E5E5E7]/70 hover:bg-white/8"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      sortOrder === value
                        ? "border-[#FF5F5A] bg-[#FF5F5A]"
                        : "border-white/30"
                    }`}
                  />
                  <span>
                    <span className="block text-xs font-medium">{label}</span>
                    <span className="block text-[11px] text-[#E5E5E7]/40">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Sync section */}
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
                  Sync (Beta)
                </p>
                <p className="mt-1 text-xs text-[#E5E5E7]/45">
                  Optional secure sync with a remote workspace hub.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveSyncSettingsPatch({ enabled: !syncSettings.enabled })}
                disabled={syncSaving}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  syncSettings.enabled
                    ? "bg-[#FF5F5A]/22 text-[#E5E5E7]"
                    : "bg-white/10 text-[#E5E5E7]/70 hover:bg-white/15"
                }`}
              >
                {syncSettings.enabled ? "On" : "Off"}
              </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#E5E5E7]/80">Status</span>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${syncHealthDotClass}`} />
                  <span className="text-[11px] capitalize text-[#E5E5E7]/65">
                    {syncStatus.isRunning ? "syncing" : syncStatus.health}
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#E5E5E7]/55">
                <span>Last sync</span>
                <span className="text-right text-[#E5E5E7]/80">
                  {formatTimestamp(syncStatus.lastSyncAtMs)}
                </span>
                <span>Pending uploads</span>
                <span className="text-right text-[#E5E5E7]/80">{syncStatus.pendingUploads}</span>
                <span>Pending downloads</span>
                <span className="text-right text-[#E5E5E7]/80">{syncStatus.pendingDownloads}</span>
                <span>Configured</span>
                <span className="text-right text-[#E5E5E7]/80">{syncStatus.configured ? "Yes" : "No"}</span>
              </div>
              {syncStatus.lastError && (
                <p className="mt-2 truncate text-[11px] text-rose-200" title={syncStatus.lastError}>
                  {syncStatus.lastError}
                </p>
              )}
              {syncFeedback && (
                <p className="mt-2 text-[11px] text-[#E5E5E7]/70">{syncFeedback}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                Server URL
              </label>
              <input
                value={syncSettings.serverURL}
                onChange={(e) => setSyncSettings((s) => ({ ...s, serverURL: e.target.value }))}
                onBlur={() => {
                  const next = syncSettings.serverURL.trim();
                  if (next && !isHttpUrl(next)) {
                    setSyncFeedback("Enter a valid http(s) URL.");
                    return;
                  }
                  void saveSyncSettingsPatch({ serverURL: next });
                }}
                placeholder="https://sync.tudominio.com"
                className={`w-full rounded-lg border bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none ${
                  syncServerURLValid ? "border-white/10 focus:border-white/25" : "border-rose-300/40"
                }`}
              />
              {!syncServerURLValid && (
                <p className="text-[11px] text-rose-200">Enter a valid http(s) URL.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Workspace ID
                </label>
                <input
                  value={syncSettings.workspaceId}
                  onChange={(e) => setSyncSettings((s) => ({ ...s, workspaceId: e.target.value }))}
                  onBlur={() => void saveSyncSettingsPatch({ workspaceId: syncSettings.workspaceId.trim() })}
                  placeholder="gato-main"
                  className={`w-full rounded-lg border bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none ${
                    syncWorkspaceIdValid ? "border-white/10 focus:border-white/25" : "border-rose-300/40"
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Device ID
                </label>
                <input
                  value={syncSettings.deviceId}
                  onChange={(e) => setSyncSettings((s) => ({ ...s, deviceId: e.target.value }))}
                  onBlur={() => void saveSyncSettingsPatch({ deviceId: syncSettings.deviceId.trim() })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none focus:border-white/25"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                Device Name
              </label>
              <input
                value={syncSettings.deviceName}
                onChange={(e) => setSyncSettings((s) => ({ ...s, deviceName: e.target.value }))}
                onBlur={() => void saveSyncSettingsPatch({ deviceName: syncSettings.deviceName.trim() })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none focus:border-white/25"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                API Token
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={syncTokenInput}
                  onChange={(e) => setSyncTokenInput(e.target.value)}
                  type="password"
                  placeholder={syncSettings.apiTokenMasked || "Set API token"}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none focus:border-white/25"
                />
                <button
                  type="button"
                  onClick={() => void handleSyncTokenUpdate()}
                  disabled={syncSaving}
                  className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] text-[#E5E5E7]/85 transition-colors hover:bg-white/15 disabled:opacity-50"
                >
                  Update
                </button>
              </div>
              <p className="text-[11px] text-[#E5E5E7]/40">
                {syncSettings.hasToken ? "Token saved in Keychain." : "No token saved."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Mode
                </label>
                <select
                  value={syncSettings.mode}
                  onChange={(e) => void saveSyncSettingsPatch({ mode: e.target.value as SyncSettingsDraft["mode"] })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none"
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Interval
                </label>
                <select
                  value={String(syncSettings.intervalSeconds)}
                  onChange={(e) => void saveSyncSettingsPatch({ intervalSeconds: Number(e.target.value) as 30 | 60 | 300 })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none"
                >
                  <option value="30">30s</option>
                  <option value="60">60s</option>
                  <option value="300">5m</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Direction
                </label>
                <select
                  value={syncSettings.direction}
                  onChange={(e) => void saveSyncSettingsPatch({ direction: e.target.value as SyncSettingsDraft["direction"] })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none"
                >
                  <option value="upload_only">Upload only</option>
                  <option value="download_only">Download only</option>
                  <option value="bidirectional">Bidirectional</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                  Conflict Policy
                </label>
                <select
                  value={syncSettings.conflictPolicy}
                  onChange={(e) => void saveSyncSettingsPatch({ conflictPolicy: e.target.value as SyncSettingsDraft["conflictPolicy"] })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#E5E5E7] outline-none"
                >
                  <option value="latest_modified_wins">Latest modified wins</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleSyncTestConnection()}
                disabled={syncActionBusy !== null || !syncServerURLValid || !syncSettings.serverURL.trim()}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-[#E5E5E7]/80 transition-colors hover:bg-white/8 disabled:opacity-50"
              >
                {syncActionBusy === "test" ? "Testing…" : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={() => void handleSyncRunNow()}
                disabled={syncActionBusy !== null || !syncCanRunActions}
                className="rounded-md bg-[#FF5F5A]/18 px-2.5 py-2 text-[11px] text-[#E5E5E7] transition-colors hover:bg-[#FF5F5A]/28 disabled:opacity-50"
              >
                {syncActionBusy === "sync" ? "Syncing…" : "Sync Now"}
              </button>
              <button
                type="button"
                onClick={() => void handleSyncLogsToggle()}
                disabled={syncActionBusy === "logs"}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-[#E5E5E7]/80 transition-colors hover:bg-white/8 disabled:opacity-50"
              >
                {syncLogsOpen ? "Hide Sync Logs" : "Open Sync Logs"}
              </button>
            </div>

            {syncLogsOpen && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                {syncLogs.length === 0 ? (
                  <p className="text-[11px] text-[#E5E5E7]/45">No sync logs yet.</p>
                ) : (
                  <div className="space-y-1">
                    {syncLogs.slice(0, 15).map((entry, idx) => (
                      <div key={`${entry.tsMs}-${idx}`} className="rounded border border-white/6 bg-white/3 px-2 py-1">
                        <p className="text-[10px] text-[#E5E5E7]/45">{formatTimestamp(entry.tsMs)}</p>
                        <p className="truncate text-[11px] text-[#E5E5E7]/75" title={entry.message}>
                          {entry.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(syncLoading || syncSaving) && (
              <p className="text-[11px] text-[#E5E5E7]/45">
                {syncLoading ? "Loading sync settings…" : "Saving sync settings…"}
              </p>
            )}
          </div>

          {/* Global Shortcut section */}
          <div className="space-y-3 px-4 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/40">
                Global Shortcut
              </p>
              <p className="mt-1 text-xs text-[#E5E5E7]/45">
                Toggles the notes window from anywhere.
              </p>
            </div>
            <button
              onClick={() => setRecording((v) => !v)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                recording
                  ? "border-[#FF5F5A] bg-[#FF5F5A]/12 text-[#E5E5E7]"
                  : "border-white/10 bg-white/5 text-[#E5E5E7]/80 hover:bg-white/8"
              }`}
            >
              {recording
                ? "Recording... press your shortcut"
                : "Record shortcut"}
            </button>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#E5E5E7]/35">
                Current
              </p>
              <p className="mt-1 font-mono text-sm text-[#E5E5E7]">
                {prettyShortcut}
              </p>
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-[#E5E5E7]/65 transition-colors hover:bg-white/8 hover:text-[#E5E5E7]"
          >
            Done
          </button>
          <button
            onClick={handleSaveShortcut}
            disabled={saving}
            className="rounded-md bg-[#FF5F5A]/22 px-3 py-1.5 text-xs text-[#E5E5E7] transition-colors hover:bg-[#FF5F5A]/32 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Shortcut"}
          </button>
        </div>
      </div>
  );

  if (standalone) {
    return panelContent;
  }

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-16"
      onClick={onClose}
    >
      {panelContent}
    </div>
  );
}

function hasModifier(shortcut: string): boolean {
  const parts = shortcut.split("+");
  return parts.some((p) =>
    ["CMDORCTRL", "CMD", "COMMAND", "CTRL", "SHIFT", "ALT", "OPTION"].includes(
      p.toUpperCase(),
    ),
  );
}

function toShortcutString(e: KeyboardEvent): string | null {
  const key = keyTokenFromEvent(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}

function keyTokenFromEvent(e: KeyboardEvent): string | null {
  const code = e.code;
  if (!code) return null;
  if (code.startsWith("Key")) return code;
  if (code.startsWith("Digit")) return code;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code.startsWith("Numpad")) return code;
  const accepted = new Set([
    "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma",
    "Equal", "Minus", "Period", "Quote", "Semicolon", "Slash", "Space",
    "Tab", "Enter", "Escape", "Backspace", "Delete", "Home", "End",
    "PageUp", "PageDown", "Insert", "ArrowUp", "ArrowDown", "ArrowLeft",
    "ArrowRight",
  ]);
  return accepted.has(code) ? code : null;
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((token) => {
      const t = token.trim();
      const u = t.toUpperCase();
      if (u === "CMDORCTRL" || u === "CMD" || u === "COMMAND") return "⌘";
      if (u === "SHIFT") return "⇧";
      if (u === "ALT" || u === "OPTION") return "⌥";
      if (u.startsWith("KEY") && t.length === 4) return t.slice(3).toUpperCase();
      if (u.startsWith("DIGIT") && t.length === 6) return t.slice(5);
      if (u === "ARROWUP") return "↑";
      if (u === "ARROWDOWN") return "↓";
      if (u === "ARROWLEFT") return "←";
      if (u === "ARROWRIGHT") return "→";
      return t;
    })
    .join(" ");
}

function parseSyncSettings(raw: Record<string, unknown>): SyncSettingsDraft {
  return {
    enabled: getBoolean(raw.enabled, DEFAULT_SYNC_SETTINGS.enabled),
    serverURL: getString(raw.serverURL) ?? DEFAULT_SYNC_SETTINGS.serverURL,
    workspaceId: getString(raw.workspaceId) ?? DEFAULT_SYNC_SETTINGS.workspaceId,
    deviceName: getString(raw.deviceName) ?? DEFAULT_SYNC_SETTINGS.deviceName,
    deviceId: getString(raw.deviceId) ?? DEFAULT_SYNC_SETTINGS.deviceId,
    mode: (getString(raw.mode) === "manual" ? "manual" : "auto"),
    intervalSeconds: parseInterval(raw.intervalSeconds),
    direction: parseDirection(raw.direction),
    conflictPolicy: "latest_modified_wins",
    hasToken: getBoolean(raw.hasToken, false),
    apiTokenMasked: getString(raw.apiTokenMasked) ?? "",
  };
}

function parseSyncStatus(raw: Record<string, unknown>): SyncStatus {
  const health = getString(raw.health);
  return {
    enabled: getBoolean(raw.enabled, false),
    configured: getBoolean(raw.configured, false),
    isRunning: getBoolean(raw.isRunning, false),
    mode: getString(raw.mode) ?? "auto",
    intervalSeconds: getNumber(raw.intervalSeconds, 60),
    direction: getString(raw.direction) ?? "bidirectional",
    conflictPolicy: getString(raw.conflictPolicy) ?? "latest_modified_wins",
    lastSyncAtMs: getNullableNumber(raw.lastSyncAtMs),
    lastError: getNullableString(raw.lastError),
    pendingUploads: getNumber(raw.pendingUploads, 0),
    pendingDownloads: getNumber(raw.pendingDownloads, 0),
    health: health === "green" || health === "yellow" || health === "red" || health === "gray" ? health : "gray",
    serverReachable: getNullableBoolean(raw.serverReachable),
  };
}

function parseSyncLog(raw: Record<string, unknown>): SyncLogEntry | null {
  const tsMs = getNumber(raw.tsMs, 0);
  const message = getString(raw.message) ?? "";
  if (!message) return null;
  return { tsMs, message };
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function getNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function getNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function getNullableBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  return typeof value === "boolean" ? value : null;
}

function parseInterval(value: unknown): 30 | 60 | 300 {
  const n = getNumber(value, 60);
  if (n === 30 || n === 60 || n === 300) return n;
  return 60;
}

function parseDirection(value: unknown): SyncSettingsDraft["direction"] {
  const s = getString(value);
  if (s === "upload_only" || s === "download_only" || s === "bidirectional") return s;
  return "bidirectional";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatTimestamp(tsMs: number | null): string {
  if (!tsMs) return "Never";
  try {
    return new Date(tsMs).toLocaleString();
  } catch {
    return "Unknown";
  }
}
