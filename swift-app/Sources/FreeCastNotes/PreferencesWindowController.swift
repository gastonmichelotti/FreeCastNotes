import AppKit
import ServiceManagement
import WebKit

class PreferencesWindowController: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private weak var shortcutManager: ShortcutManager?

    init(shortcutManager: ShortcutManager) {
        self.shortcutManager = shortcutManager
        super.init()
        setupWindow()
        setupWebView()
    }

    private func setupWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 660),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = ""
        window.titleVisibility = .hidden
        window.level = .floating
        window.hidesOnDeactivate = false
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.backgroundColor = NSColor(red: 44/255, green: 44/255, blue: 46/255, alpha: 1)
        window.isReleasedWhenClosed = false
        window.center()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        // Share the same data store so localStorage (Zustand store) is consistent
        config.websiteDataStore = WKWebsiteDataStore.default()

        let contentController = WKUserContentController()
        contentController.add(self, name: "swiftBridge")

        let bridgeScript = WKUserScript(
            source: WebViewController.bridgeJavaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)
        config.userContentController = contentController
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView?.addSubview(webView)

        loadApp()
    }

    private func loadApp() {
        if let url = URL(string: "http://localhost:1420/#preferences") {
            webView.load(URLRequest(url: url, timeoutInterval: 5))
        }
    }

    func show() {
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }

        let payload = body["payload"] as? [String: Any]
        let callId = payload?["_callId"] as? String

        switch type {
        case "hideWindow":
            DispatchQueue.main.async { [weak self] in
                self?.window.orderOut(nil)
            }

        case "getGlobalShortcut":
            let shortcut = shortcutManager?.currentShortcut ?? "Alt+N"
            respond(callId: callId, type: type, result: shortcut)

        case "setGlobalShortcut":
            if let shortcut = payload?["shortcut"] as? String {
                let success = shortcutManager?.register(shortcut: shortcut) ?? false
                respond(callId: callId, type: type, result: success)
            }

        case "vaultGetFolder":
            respond(callId: callId, type: type, result: vaultFolderURL.path)

        case "vaultSetFolder":
            handleVaultSetFolder(callId: callId)

        case "vaultLoadAll":
            handleVaultLoadAll(callId: callId)

        case "getLaunchAtLogin":
            let enabled = SMAppService.mainApp.status == .enabled
            respond(callId: callId, type: type, result: enabled)

        case "setLaunchAtLogin":
            if let enabled = payload?["enabled"] as? Bool {
                handleSetLaunchAtLogin(enabled: enabled, callId: callId)
            }

        case "syncGetSettings":
            Task { [weak self] in
                let result = await SyncEngine.shared.getSettings()
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncSetSettings":
            let settingsPayload = (payload?["settings"] as? [String: Any]) ?? payload ?? [:]
            Task { [weak self] in
                let result = await SyncEngine.shared.setSettings(settingsPayload)
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncGetStatus":
            Task { [weak self] in
                let result = await SyncEngine.shared.getStatus()
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncRunNow":
            Task { [weak self] in
                let result = await SyncEngine.shared.runNow()
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncGetLastErrors":
            Task { [weak self] in
                let result = await SyncEngine.shared.getLastErrors()
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncResetCursor":
            Task { [weak self] in
                let result = await SyncEngine.shared.resetCursor()
                self?.respond(callId: callId, type: type, result: result)
            }

        case "syncTestConnection":
            Task { [weak self] in
                let result = await SyncEngine.shared.testConnection()
                self?.respond(callId: callId, type: type, result: result)
            }

        default:
            break
        }
    }

    private func handleSetLaunchAtLogin(enabled: Bool, callId: String?) {
        DispatchQueue.main.async { [weak self] in
            do {
                if enabled {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
                self?.respond(callId: callId, type: "setLaunchAtLogin", result: true)
            } catch {
                print("[FreeCastNotes] setLaunchAtLogin failed: \(error)")
                self?.respond(callId: callId, type: "setLaunchAtLogin", result: false)
            }
        }
    }

    private func respond(callId: String?, type: String, result: Any) {
        guard let callId = callId else { return }
        let detail: [String: Any] = ["id": callId, "result": result]
        if let data = try? JSONSerialization.data(withJSONObject: detail),
           let json = String(data: data, encoding: .utf8) {
            let js = "window.dispatchEvent(new CustomEvent('swift-response-\(type)', {detail: \(json)}))"
            DispatchQueue.main.async { [weak self] in
                self?.webView.evaluateJavaScript(js)
            }
        }
    }

    private var vaultFolderURL: URL {
        if let p = UserDefaults.standard.string(forKey: "vaultFolderPath"), !p.isEmpty {
            return URL(fileURLWithPath: p)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/FreeCastNotes")
    }

    private func handleVaultSetFolder(callId: String?) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Vault Folder"
        panel.title = "Choose Vault Location"

        window.level = .normal

        panel.begin { [weak self] response in
            self?.window.level = .floating
            guard response == .OK, let newURL = panel.url, let self = self else {
                self?.respond(callId: callId, type: "vaultSetFolder", result: "")
                return
            }

            let fm = FileManager.default
            let oldURL = self.vaultFolderURL
            try? fm.createDirectory(at: newURL, withIntermediateDirectories: true)
            if let items = try? fm.contentsOfDirectory(at: oldURL, includingPropertiesForKeys: nil) {
                for item in items {
                    let dest = newURL.appendingPathComponent(item.lastPathComponent)
                    try? fm.copyItem(at: item, to: dest)
                }
            }
            UserDefaults.standard.set(newURL.path, forKey: "vaultFolderPath")
            self.respond(callId: callId, type: "vaultSetFolder", result: newURL.path)
        }
    }

    private func handleVaultLoadAll(callId: String?) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let fm = FileManager.default
            let vaultURL = self.vaultFolderURL
            let deletedURL = vaultURL.appendingPathComponent("_deleted")

            try? fm.createDirectory(at: vaultURL, withIntermediateDirectories: true)

            var notes: [[String: Any]] = []
            var deleted: [[String: Any]] = []
            let modKey = URLResourceKey.contentModificationDateKey

            if let items = try? fm.contentsOfDirectory(at: vaultURL,
                                                        includingPropertiesForKeys: [modKey]) {
                for item in items where item.pathExtension == "md" {
                    if let content = try? String(contentsOf: item, encoding: .utf8) {
                        let mtime = (try? item.resourceValues(forKeys: [modKey]))?
                            .contentModificationDate?.timeIntervalSince1970 ?? 0
                        notes.append(["filename": item.lastPathComponent,
                                      "content": content,
                                      "mtime": mtime])
                    }
                }
            }

            if let items = try? fm.contentsOfDirectory(at: deletedURL,
                                                        includingPropertiesForKeys: [modKey]) {
                for item in items where item.pathExtension == "md" {
                    if let content = try? String(contentsOf: item, encoding: .utf8) {
                        let mtime = (try? item.resourceValues(forKeys: [modKey]))?
                            .contentModificationDate?.timeIntervalSince1970 ?? 0
                        deleted.append(["filename": item.lastPathComponent,
                                        "content": content,
                                        "mtime": mtime])
                    }
                }
            }

            self.respond(callId: callId, type: "vaultLoadAll",
                         result: ["notes": notes, "deleted": deleted])
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        // Dev server unreachable → load bundled app
        let bundlePath = Bundle.main.resourcePath ?? ""
        let distPath = (bundlePath as NSString).appendingPathComponent("dist")
        let indexURL = URL(fileURLWithPath: (distPath as NSString).appendingPathComponent("index.html"))
        var comps = URLComponents(url: indexURL, resolvingAgainstBaseURL: false)
        comps?.fragment = "preferences"
        if let url = comps?.url {
            webView.loadFileURL(url, allowingReadAccessTo: URL(fileURLWithPath: distPath))
        }
    }
}
