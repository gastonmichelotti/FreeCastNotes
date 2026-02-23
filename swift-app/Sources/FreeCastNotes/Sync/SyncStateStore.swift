import Foundation

struct SyncTrackedFile: Codable {
    var sha256: String
    var size: Int
    var mtimeMs: Int64
}

struct SyncErrorLogEntry: Codable {
    var tsMs: Int64
    var message: String
}

private struct SyncPersistentState: Codable {
    var lastCursor: String?
    var lastSyncAtMs: Int64?
    var lastError: String?
    var trackedFiles: [String: SyncTrackedFile]
    var errorLog: [SyncErrorLogEntry]

    static let empty = SyncPersistentState(
        lastCursor: nil,
        lastSyncAtMs: nil,
        lastError: nil,
        trackedFiles: [:],
        errorLog: []
    )
}

final class SyncStateStore {
    static let shared = SyncStateStore()

    private let defaults = UserDefaults.standard
    private let stateKey = "sync.state.v1"
    private let queue = DispatchQueue(label: "freecast.sync.state")

    private init() {}

    private func loadStateLocked() -> SyncPersistentState {
        guard let data = defaults.data(forKey: stateKey) else { return .empty }
        return (try? JSONDecoder().decode(SyncPersistentState.self, from: data)) ?? .empty
    }

    private func saveStateLocked(_ state: SyncPersistentState) {
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: stateKey)
        }
    }

    func snapshot() -> (lastCursor: String?, lastSyncAtMs: Int64?, lastError: String?, trackedFiles: [String: SyncTrackedFile], errorLog: [SyncErrorLogEntry]) {
        queue.sync {
            let state = loadStateLocked()
            return (state.lastCursor, state.lastSyncAtMs, state.lastError, state.trackedFiles, state.errorLog)
        }
    }

    func getLastCursor() -> String? {
        queue.sync { loadStateLocked().lastCursor }
    }

    func getTrackedFiles() -> [String: SyncTrackedFile] {
        queue.sync { loadStateLocked().trackedFiles }
    }

    func getErrorLog() -> [SyncErrorLogEntry] {
        queue.sync { loadStateLocked().errorLog }
    }

    func saveSuccess(lastCursor: String?, lastSyncAtMs: Int64, trackedFiles: [String: SyncTrackedFile]) {
        queue.sync {
            var state = loadStateLocked()
            state.lastCursor = lastCursor
            state.lastSyncAtMs = lastSyncAtMs
            state.lastError = nil
            state.trackedFiles = trackedFiles
            saveStateLocked(state)
        }
    }

    func recordError(_ message: String) {
        let cleaned = String(message.prefix(500))
        let entry = SyncErrorLogEntry(tsMs: Int64(Date().timeIntervalSince1970 * 1000), message: cleaned)
        queue.sync {
            var state = loadStateLocked()
            state.lastError = cleaned
            state.errorLog.insert(entry, at: 0)
            if state.errorLog.count > 50 {
                state.errorLog = Array(state.errorLog.prefix(50))
            }
            saveStateLocked(state)
        }
    }

    func clearLastError() {
        queue.sync {
            var state = loadStateLocked()
            state.lastError = nil
            saveStateLocked(state)
        }
    }

    func resetCursor() {
        queue.sync {
            var state = loadStateLocked()
            state.lastCursor = nil
            saveStateLocked(state)
        }
    }
}
