import { useState, useEffect } from "react";
import { bridge } from "../../lib/bridge";

interface HubConfig {
  url: string;
  hasToken: boolean;
  connected: boolean;
}

export default function HubTab() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<HubConfig>({ url: "", hasToken: false, connected: false });
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bridge.hubGetConfig().then((cfg) => {
      setConfig(cfg);
      setUrl(cfg.url);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    await bridge.hubSetConfig({ url: url.trim(), token });
    setConfig((c) => ({ ...c, url: url.trim(), hasToken: token.length > 0 || c.hasToken }));
    setToken("");
    setSaving(false);
  }

  async function handleTest() {
    setStatus("testing");
    setErrorMsg("");
    const result = await bridge.hubTestConnection();
    if (result.ok) {
      setStatus("ok");
      setLatency(result.latencyMs);
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Connection failed");
    }
  }

  return (
    <div className="space-y-5 px-1">
      <div>
        <p className="text-xs text-white/50 mb-3">
          Connect to a self-hosted FreeCast Hub to publish notes publicly and sync
          across devices.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-white/60 mb-1">Hub URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://notes.yourserver.com"
            className="w-full rounded bg-white/8 border border-white/12 px-3 py-1.5 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>

        <div>
          <label className="block text-xs text-white/60 mb-1">
            API Token {config.hasToken && <span className="text-green-400/80">(saved)</span>}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={config.hasToken ? "••••••••  (leave blank to keep)" : "Enter token"}
            className="w-full rounded bg-white/8 border border-white/12 px-3 py-1.5 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-xs text-white/80 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={status === "testing" || !config.url}
          className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-xs text-white/80 transition-colors disabled:opacity-50"
        >
          {status === "testing" ? "Testing…" : "Test Connection"}
        </button>

        {status === "ok" && (
          <span className="text-xs text-green-400">
            ✓ Connected {latency !== null && `(${latency}ms)`}
          </span>
        )}
        {status === "error" && (
          <span className="text-xs text-red-400">✗ {errorMsg}</span>
        )}
      </div>

      {config.url && (
        <div className="text-xs text-white/40 border-t border-white/8 pt-3">
          Hub: <span className="text-white/60">{config.url}</span>
        </div>
      )}
    </div>
  );
}
