/**
 * Unified bridge for React ↔ Swift communication.
 * Uses WKWebView's postMessage / CustomEvent pattern.
 */

declare global {
  interface Window {
    swiftBridge?: {
      postMessage: (type: string, payload?: Record<string, unknown>) => void;
      call: (
        type: string,
        payload?: Record<string, unknown>,
        timeout?: number,
      ) => Promise<unknown>;
    };
  }
}

function isSwiftAvailable(): boolean {
  return typeof window.swiftBridge !== "undefined";
}

export const bridge = {
  // Window management
  hideWindow: () => {
    if (isSwiftAvailable()) {
      window.swiftBridge!.postMessage("hideWindow");
    }
  },

  getWindowSize: (): Promise<{ width: number; height: number }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("getWindowSize") as Promise<{
        width: number;
        height: number;
      }>;
    }
    return Promise.resolve({ width: 650, height: 600 });
  },

  setWindowSize: (width: number, height: number): Promise<void> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("setWindowSize", {
        width,
        height,
      }) as Promise<void>;
    }
    return Promise.resolve();
  },

  getWindowPosition: (): Promise<{ x: number; y: number }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("getWindowPosition") as Promise<{
        x: number;
        y: number;
      }>;
    }
    return Promise.resolve({ x: 0, y: 0 });
  },

  setWindowPosition: (x: number, y: number): Promise<void> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("setWindowPosition", {
        x,
        y,
      }) as Promise<void>;
    }
    return Promise.resolve();
  },

  // Global shortcuts
  getGlobalShortcut: (): Promise<string> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("getGlobalShortcut") as Promise<string>;
    }
    return Promise.resolve("Alt+N");
  },

  setGlobalShortcut: (shortcut: string): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("setGlobalShortcut", {
        shortcut,
      }) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  // Launch at login
  getLaunchAtLogin: (): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("getLaunchAtLogin") as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  setLaunchAtLogin: (enabled: boolean): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("setLaunchAtLogin", {
        enabled,
      }) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  // File export (native save dialog)
  exportFile: (
    content: string,
    extension: string,
    filterName: string,
  ): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("exportFile", {
        content,
        extension: extension,
        filterName,
      }, 120000) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  // Open the Preferences window (separate NSWindow)
  openPreferences: (): void => {
    if (isSwiftAvailable()) {
      window.swiftBridge!.postMessage("openPreferences");
    }
  },

  // Image import (native open dialog → base64 data URL)
  importImage: (): Promise<string | null> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("importImage", {}, 120000).then((result) =>
        typeof result === "string" ? result : null,
      );
    }
    return Promise.resolve(null);
  },

  // File import (native open dialog)
  importFile: (): Promise<string | null> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("importFile", {}, 120000).then((result) =>
        typeof result === "string" ? result : null,
      );
    }
    return Promise.resolve(null);
  },

  // Notify Swift of layout mode change (for tray menu checkmarks)
  notifyLayoutMode: (mode: string): void => {
    if (isSwiftAvailable()) {
      window.swiftBridge!.postMessage("notifyLayoutMode", { mode });
    }
  },

  // --- Vault commands ---

  vaultGetFolder: (): Promise<string> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultGetFolder") as Promise<string>;
    }
    return Promise.resolve("~/Documents/FreeCastNotes");
  },

  vaultSetFolder: (): Promise<string> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultSetFolder", {}, 120000).then(
        (r) => (typeof r === "string" ? r : ""),
      );
    }
    return Promise.resolve("");
  },

  vaultLoadAll: (): Promise<{
    notes: Array<{ filename: string; content: string; mtime: number }>;
    deleted: Array<{ filename: string; content: string; mtime: number }>;
  }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultLoadAll", {}, 60000).then((r) => {
        if (r && typeof r === "object" && !Array.isArray(r)) {
          return r as {
            notes: Array<{ filename: string; content: string; mtime: number }>;
            deleted: Array<{ filename: string; content: string; mtime: number }>;
          };
        }
        return { notes: [], deleted: [] };
      });
    }
    return Promise.resolve({ notes: [], deleted: [] });
  },

  vaultWriteNote: (
    filename: string,
    content: string,
    attachments: Array<{ path: string; base64: string }>,
    subfolder?: string,
  ): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call(
        "vaultWriteNote",
        { filename, content, attachments, subfolder },
        30000,
      ) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  vaultReadNote: (filename: string): Promise<string> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultReadNote", { filename }, 60000).then(
        (r) => (typeof r === "string" ? r : ""),
      );
    }
    return Promise.resolve("");
  },

  vaultDeleteNote: (filename: string): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call(
        "vaultDeleteNote",
        { filename },
        30000,
      ) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  vaultRestoreNote: (filename: string): Promise<boolean> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call(
        "vaultRestoreNote",
        { filename },
        30000,
      ) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },

  vaultPurgeDeleted: (): Promise<void> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultPurgeDeleted", {}, 30000) as Promise<void>;
    }
    return Promise.resolve();
  },

  vaultGetChanges: (
    since: number,
  ): Promise<Array<{ filename: string; content: string }>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("vaultGetChanges", { since }, 30000).then(
        (r) =>
          Array.isArray(r)
            ? (r as Array<{ filename: string; content: string }>)
            : [],
      );
    }
    return Promise.resolve([]);
  },

  // --- Sync (Beta) ---

  syncGetSettings: (): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncGetSettings") as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({
      enabled: false,
      serverURL: "",
      workspaceId: "",
      deviceName: "Mac",
      deviceId: "dev-local",
      mode: "auto",
      intervalSeconds: 60,
      direction: "bidirectional",
      conflictPolicy: "latest_modified_wins",
      hasToken: false,
      apiTokenMasked: "",
    });
  },

  syncSetSettings: (settings: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncSetSettings", { settings }, 15000) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({ ok: true, settings });
  },

  syncGetStatus: (): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncGetStatus", {}, 15000) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({
      enabled: false,
      configured: false,
      isRunning: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      health: "gray",
      lastError: null,
      lastSyncAtMs: null,
    });
  },

  syncRunNow: (): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncRunNow", {}, 120000) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({ ok: false, error: "Swift bridge unavailable" });
  },

  syncGetLastErrors: (): Promise<Array<Record<string, unknown>>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncGetLastErrors", {}, 15000) as Promise<
        Array<Record<string, unknown>>
      >;
    }
    return Promise.resolve([]);
  },

  syncResetCursor: (): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncResetCursor", {}, 15000) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({ ok: true });
  },

  syncTestConnection: (): Promise<Record<string, unknown>> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("syncTestConnection", {}, 30000) as Promise<Record<string, unknown>>;
    }
    return Promise.resolve({ ok: false, error: "Swift bridge unavailable" });
  },

  // --- Hub Publishing ---

  hubGetConfig: (): Promise<{ url: string; hasToken: boolean; connected: boolean }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("hubGetConfig") as Promise<{ url: string; hasToken: boolean; connected: boolean }>;
    }
    return Promise.resolve({ url: "", hasToken: false, connected: false });
  },

  hubSetConfig: (config: { url: string; token: string }): Promise<{ ok: boolean; error?: string }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("hubSetConfig", config, 15000) as Promise<{ ok: boolean; error?: string }>;
    }
    return Promise.resolve({ ok: true });
  },

  hubTestConnection: (): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
    if (isSwiftAvailable()) {
      return window.swiftBridge!.call("hubTestConnection", {}, 30000) as Promise<{ ok: boolean; latencyMs: number; error?: string }>;
    }
    return Promise.resolve({ ok: false, latencyMs: 0, error: "Swift bridge unavailable" });
  },

  // Event listeners (Swift → React via CustomEvent)
  on: (event: string, callback: () => void): (() => void) => {
    const handler = () => callback();
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  },
};
