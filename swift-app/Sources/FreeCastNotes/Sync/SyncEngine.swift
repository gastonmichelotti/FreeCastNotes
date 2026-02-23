import Foundation

private struct LocalSyncFile {
    let path: String
    let url: URL
    let sha256: String
    let size: Int
    let mtimeMs: Int64
}

private struct LocalDeleteEntry {
    let path: String
    let deletedAtMs: Int64
}

private enum SyncEngineError: LocalizedError {
    case syncDisabled
    case missingServerURL
    case missingWorkspaceId
    case missingToken

    var errorDescription: String? {
        switch self {
        case .syncDisabled: return "Sync is disabled"
        case .missingServerURL: return "Server URL is required"
        case .missingWorkspaceId: return "Workspace ID is required"
        case .missingToken: return "API token is required"
        }
    }
}

actor SyncEngine {
    static let shared = SyncEngine()

    private let settingsStore = SyncSettingsStore.shared
    private let stateStore = SyncStateStore.shared
    private let apiClient = SyncAPIClient()

    private var isRunning = false
    private var pendingUploads = 0
    private var pendingDownloads = 0
    private var lastRunStartedAtMs: Int64?
    private var lastRunFinishedAtMs: Int64?
    private var serverReachable: Bool?
    private var autoSyncTask: Task<Void, Never>?
    private var autoSyncBackoffSeconds: Int?

    private init() {}

    func getSettings() -> [String: Any] {
        settingsStore.bridgeDictionary()
    }

    func setSettings(_ payload: [String: Any]) -> [String: Any] {
        do {
            let settings = try settingsStore.updateFromBridgePayload(payload)
            configureAutoSyncLoop()
            return [
                "ok": true,
                "settings": settingsStore.bridgeDictionary(),
                "mode": settings.mode.rawValue,
            ]
        } catch {
            stateStore.recordError(error.localizedDescription)
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    func getStatus() -> [String: Any] {
        let snapshot = stateStore.snapshot()
        let settings = settingsStore.load()
        let hasToken = settingsStore.loadToken()?.isEmpty == false
        let health: String
        if !settings.enabled {
            health = "gray"
        } else if isRunning {
            health = "yellow"
        } else if serverReachable == false || snapshot.lastError != nil {
            health = "red"
        } else {
            health = "green"
        }

        return [
            "enabled": settings.enabled,
            "configured": !settings.serverURL.isEmpty && !settings.workspaceId.isEmpty && hasToken,
            "isRunning": isRunning,
            "mode": settings.mode.rawValue,
            "intervalSeconds": settings.intervalSeconds,
            "direction": settings.direction.rawValue,
            "conflictPolicy": settings.conflictPolicy.rawValue,
            "lastSyncAtMs": json(snapshot.lastSyncAtMs),
            "lastError": json(snapshot.lastError),
            "lastCursor": json(snapshot.lastCursor),
            "pendingUploads": pendingUploads,
            "pendingDownloads": pendingDownloads,
            "health": health,
            "serverReachable": json(serverReachable),
            "lastRunStartedAtMs": json(lastRunStartedAtMs),
            "lastRunFinishedAtMs": json(lastRunFinishedAtMs),
        ]
    }

    func getLastErrors() -> [[String: Any]] {
        stateStore.getErrorLog().map { ["tsMs": $0.tsMs, "message": $0.message] }
    }

    func resetCursor() -> [String: Any] {
        stateStore.resetCursor()
        return ["ok": true]
    }

    func startAutoSyncIfNeeded() {
        configureAutoSyncLoop()
    }

    func testConnection() async -> [String: Any] {
        let settings = settingsStore.load()
        guard !settings.serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return ["ok": false, "error": "Server URL is required"]
        }
        guard let token = settingsStore.loadToken(), !token.isEmpty else {
            return ["ok": false, "error": "API token is required"]
        }

        do {
            let health = try await apiClient.health(serverURL: settings.serverURL)
            serverReachable = health.ok
            return [
                "ok": health.ok,
                "service": json(health.service),
                "version": json(health.version),
                "time": json(health.time),
            ]
        } catch {
            serverReachable = false
            stateStore.recordError("Sync test connection failed: \(error.localizedDescription)")
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    func runNow() async -> [String: Any] {
        if isRunning {
            return ["ok": false, "error": "Sync already running", "status": getStatus()]
        }
        isRunning = true
        lastRunStartedAtMs = Self.nowMs()
        pendingUploads = 0
        pendingDownloads = 0

        do {
            let summary = try await runOnceInternal()
            autoSyncBackoffSeconds = nil
            lastRunFinishedAtMs = Self.nowMs()
            isRunning = false
            return ["ok": true, "summary": summary, "status": getStatus()]
        } catch {
            let message = error.localizedDescription
            stateStore.recordError("Sync failed: \(message)")
            serverReachable = false
            let current = autoSyncBackoffSeconds ?? 0
            autoSyncBackoffSeconds = min(max(current == 0 ? 15 : current * 2, 15), 600)
            lastRunFinishedAtMs = Self.nowMs()
            isRunning = false
            return ["ok": false, "error": message, "status": getStatus()]
        }
    }

    private func runOnceInternal() async throws -> [String: Any] {
        let settings = settingsStore.load()
        try validate(settings: settings)
        guard let token = settingsStore.loadToken(), !token.isEmpty else {
            throw SyncEngineError.missingToken
        }

        let vaultURL = currentVaultFolderURL()
        let localFiles = try scanLocalFiles(vaultURL: vaultURL)
        let previousTracked = stateStore.getTrackedFiles()
        let deletes = computeDeletes(previousTracked: previousTracked, currentFiles: localFiles)

        let manifestReq = SyncManifestRequest(
            workspaceId: settings.workspaceId,
            device: .init(
                deviceId: settings.deviceId,
                deviceName: settings.deviceName,
                appVersion: appVersion(),
                platform: "macOS"
            ),
            sync: .init(
                direction: settings.direction.rawValue,
                conflictPolicy: settings.conflictPolicy.rawValue
            ),
            files: localFiles.values.map {
                SyncManifestRequest.FileEntry(path: $0.path, sha256: $0.sha256, size: $0.size, mtimeMs: $0.mtimeMs)
            }.sorted(by: { $0.path < $1.path }),
            deletes: deletes.map { SyncManifestRequest.DeleteEntry(path: $0.path, deletedAtMs: $0.deletedAtMs) },
            cursor: stateStore.getLastCursor()
        )

        let manifest = try await apiClient.manifest(serverURL: settings.serverURL, token: token, requestBody: manifestReq)
        serverReachable = true

        var pullPaths = Set(manifest.decision.pull)
        for conflict in manifest.decision.conflicts where conflict.resolution == "server" {
            pullPaths.insert(conflict.path)
        }
        let pushPaths = Set(manifest.decision.push)
        let acceptedDeletes = Set(manifest.decision.acceptDeletes)

        pendingUploads = pushPaths.count + acceptedDeletes.count
        pendingDownloads = pullPaths.count

        var pushResponse: SyncPushResponse?
        if !pushPaths.isEmpty || !acceptedDeletes.isEmpty {
            var pushFiles: [SyncPushRequest.FileEntry] = []
            for path in pushPaths.sorted() {
                guard let local = localFiles[path] else { continue }
                let data = try Data(contentsOf: local.url)
                pushFiles.append(
                    .init(
                        path: local.path,
                        sha256: local.sha256,
                        size: local.size,
                        mtimeMs: local.mtimeMs,
                        encoding: "base64",
                        contentBase64: data.base64EncodedString()
                    )
                )
            }
            let pushDeletes = deletes.filter { acceptedDeletes.contains($0.path) }
                .map { SyncPushRequest.DeleteEntry(path: $0.path, deletedAtMs: $0.deletedAtMs) }

            pushResponse = try await apiClient.push(
                serverURL: settings.serverURL,
                token: token,
                requestBody: SyncPushRequest(
                    workspaceId: settings.workspaceId,
                    deviceId: settings.deviceId,
                    files: pushFiles,
                    deletes: pushDeletes
                )
            )
        }

        var pullResponse: SyncPullResponse?
        if !pullPaths.isEmpty {
            pullResponse = try await apiClient.pull(
                serverURL: settings.serverURL,
                token: token,
                requestBody: SyncPullRequest(
                    workspaceId: settings.workspaceId,
                    deviceId: settings.deviceId,
                    paths: Array(pullPaths).sorted()
                )
            )
            if let pullResponse {
                try applyPulledFiles(pullResponse.files, toVault: vaultURL)
            }
        }

        let refreshedFiles = try scanLocalFiles(vaultURL: vaultURL)
        let trackedFiles = Dictionary(uniqueKeysWithValues: refreshedFiles.map { entry in
            (entry.key, SyncTrackedFile(sha256: entry.value.sha256, size: entry.value.size, mtimeMs: entry.value.mtimeMs))
        })

        let finalCursor = pullResponse?.nextCursor ?? pushResponse?.nextCursor ?? manifest.nextCursor
        let finishedAtMs = Self.nowMs()
        stateStore.saveSuccess(lastCursor: finalCursor, lastSyncAtMs: finishedAtMs, trackedFiles: trackedFiles)
        pendingUploads = 0
        pendingDownloads = 0

        return [
            "serverTimeMs": manifest.serverTimeMs,
            "nextCursor": finalCursor,
            "manifest": [
                "pushCount": manifest.decision.push.count,
                "pullCount": manifest.decision.pull.count,
                "conflictCount": manifest.decision.conflicts.count,
                "acceptDeleteCount": manifest.decision.acceptDeletes.count,
            ],
            "push": [
                "applied": pushResponse?.applied.count ?? 0,
                "deleted": pushResponse?.deleted.count ?? 0,
                "rejected": pushResponse?.rejected.count ?? 0,
                "conflicts": pushResponse?.conflicts.count ?? 0,
            ],
            "pull": [
                "files": pullResponse?.files.count ?? 0,
                "missing": pullResponse?.missing.count ?? 0,
            ],
            "local": [
                "scannedFiles": localFiles.count,
                "detectedDeletes": deletes.count,
            ],
        ]
    }

    private func validate(settings: SyncSettings) throws {
        guard settings.enabled else { throw SyncEngineError.syncDisabled }
        if settings.serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw SyncEngineError.missingServerURL
        }
        if settings.workspaceId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw SyncEngineError.missingWorkspaceId
        }
    }

    private func currentVaultFolderURL() -> URL {
        if let p = UserDefaults.standard.string(forKey: "vaultFolderPath"), !p.isEmpty {
            return URL(fileURLWithPath: p)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/FreeCastNotes")
    }

    private func appVersion() -> String {
        if let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String, !v.isEmpty {
            return v
        }
        return "dev"
    }

    private func scanLocalFiles(vaultURL: URL) throws -> [String: LocalSyncFile] {
        let fm = FileManager.default
        try fm.createDirectory(at: vaultURL, withIntermediateDirectories: true)
        let resourceKeys: Set<URLResourceKey> = [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey]
        guard let enumerator = fm.enumerator(at: vaultURL, includingPropertiesForKeys: Array(resourceKeys), options: [.skipsHiddenFiles]) else {
            return [:]
        }

        var files: [String: LocalSyncFile] = [:]
        for case let url as URL in enumerator {
            let relPath = relativePath(from: vaultURL, to: url)
            if relPath == "_deleted" || relPath.hasPrefix("_deleted/") {
                enumerator.skipDescendants()
                continue
            }
            let values = try? url.resourceValues(forKeys: resourceKeys)
            if values?.isDirectory == true {
                continue
            }
            guard shouldSync(path: relPath) else { continue }

            let data = try Data(contentsOf: url)
            let hash = FileHasher.sha256Hex(data: data)
            let mtime = Int64((values?.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000)
            let size = values?.fileSize ?? data.count
            files[relPath] = LocalSyncFile(path: relPath, url: url, sha256: hash, size: size, mtimeMs: mtime)
        }
        return files
    }

    private func computeDeletes(previousTracked: [String: SyncTrackedFile], currentFiles: [String: LocalSyncFile]) -> [LocalDeleteEntry] {
        let now = Self.nowMs()
        let currentPaths = Set(currentFiles.keys)
        return previousTracked.keys
            .filter { !currentPaths.contains($0) }
            .filter { shouldSync(path: $0) }
            .sorted()
            .map { LocalDeleteEntry(path: $0, deletedAtMs: now) }
    }

    private func applyPulledFiles(_ files: [SyncPullResponse.FileEntry], toVault vaultURL: URL) throws {
        let fm = FileManager.default
        for file in files {
            guard shouldSync(path: file.path) else { continue }
            guard file.encoding == "base64" else { continue }
            guard let data = Data(base64Encoded: file.contentBase64, options: .ignoreUnknownCharacters) else {
                throw NSError(domain: "SyncEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 in pull response for \(file.path)"])
            }
            let hash = FileHasher.sha256Hex(data: data)
            guard hash == file.sha256.lowercased() else {
                throw NSError(domain: "SyncEngine", code: 2, userInfo: [NSLocalizedDescriptionKey: "SHA mismatch in pull response for \(file.path)"])
            }
            let dest = try resolvedVaultPath(vaultURL: vaultURL, relativePath: file.path)
            try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: dest, options: .atomic)
            let date = Date(timeIntervalSince1970: TimeInterval(file.mtimeMs) / 1000.0)
            try? fm.setAttributes([.modificationDate: date], ofItemAtPath: dest.path)
        }
    }

    private func shouldSync(path: String) -> Bool {
        if path.hasPrefix("_deleted/") || path == "_deleted" { return false }
        if path.hasPrefix("attachments/") { return true }
        return path.hasSuffix(".md")
    }

    private func relativePath(from root: URL, to file: URL) -> String {
        let rootPath = root.standardizedFileURL.path
        var filePath = file.standardizedFileURL.path
        if filePath.hasPrefix(rootPath + "/") {
            filePath.removeFirst(rootPath.count + 1)
        }
        return filePath.replacingOccurrences(of: "\\", with: "/")
    }

    private func resolvedVaultPath(vaultURL: URL, relativePath: String) throws -> URL {
        let clean = relativePath.replacingOccurrences(of: "\\", with: "/")
        if clean.hasPrefix("/") || clean.contains("\0") {
            throw NSError(domain: "SyncEngine", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid sync path"])
        }
        let parts = clean.split(separator: "/", omittingEmptySubsequences: true)
        if parts.contains(where: { $0 == "." || $0 == ".." }) {
            throw NSError(domain: "SyncEngine", code: 4, userInfo: [NSLocalizedDescriptionKey: "Path traversal blocked"])
        }
        let url = parts.reduce(vaultURL) { $0.appendingPathComponent(String($1)) }
        let root = vaultURL.standardizedFileURL.path
        let dest = url.standardizedFileURL.path
        guard dest == root || dest.hasPrefix(root + "/") else {
            throw NSError(domain: "SyncEngine", code: 5, userInfo: [NSLocalizedDescriptionKey: "Path escapes vault"])
        }
        return url
    }

    private static func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }

    private func json<T>(_ value: T?) -> Any {
        if let value { return value }
        return NSNull()
    }

    private func configureAutoSyncLoop() {
        let settings = settingsStore.load()
        let shouldRun = settings.enabled && settings.mode == .auto
        if !shouldRun {
            autoSyncTask?.cancel()
            autoSyncTask = nil
            autoSyncBackoffSeconds = nil
            return
        }
        guard autoSyncTask == nil else { return }
        autoSyncTask = Task { [weak self] in
            await self?.autoSyncLoop()
        }
    }

    private func autoSyncLoop() async {
        while !Task.isCancelled {
            let settings = settingsStore.load()
            if !settings.enabled || settings.mode != .auto {
                break
            }

            let waitSeconds = max(autoSyncBackoffSeconds ?? settings.intervalSeconds, 5)
            do {
                try await Task.sleep(nanoseconds: UInt64(waitSeconds) * 1_000_000_000)
            } catch {
                break
            }
            if Task.isCancelled { break }

            let currentSettings = settingsStore.load()
            if !currentSettings.enabled || currentSettings.mode != .auto { continue }
            _ = await runNow()
        }
        autoSyncTask = nil
    }
}
