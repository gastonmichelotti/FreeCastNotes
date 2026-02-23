import Foundation
import Security

enum SyncMode: String, Codable {
    case manual
    case auto
}

enum SyncDirection: String, Codable {
    case uploadOnly = "upload_only"
    case downloadOnly = "download_only"
    case bidirectional
}

enum SyncConflictPolicy: String, Codable {
    case latestModifiedWins = "latest_modified_wins"
}

struct SyncSettings: Codable {
    var enabled: Bool
    var serverURL: String
    var workspaceId: String
    var deviceName: String
    var deviceId: String
    var mode: SyncMode
    var intervalSeconds: Int
    var direction: SyncDirection
    var conflictPolicy: SyncConflictPolicy

    static func `default`() -> SyncSettings {
        SyncSettings(
            enabled: false,
            serverURL: "",
            workspaceId: "",
            deviceName: Host.current().localizedName ?? "Mac",
            deviceId: SyncSettingsStore.defaultDeviceId(),
            mode: .auto,
            intervalSeconds: 60,
            direction: .bidirectional,
            conflictPolicy: .latestModifiedWins
        )
    }
}

final class SyncSettingsStore {
    static let shared = SyncSettingsStore()

    private let defaults = UserDefaults.standard
    private let settingsKey = "sync.settings.v1"
    private let deviceIdKey = "sync.deviceId"
    private let keychainService = "com.freecastnotes.sync"
    private let keychainAccount = "api-token"

    private init() {}

    static func defaultDeviceId() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: "sync.deviceId"), !existing.isEmpty {
            return existing
        }
        let generated = "mac-\(UUID().uuidString.lowercased())"
        defaults.set(generated, forKey: "sync.deviceId")
        return generated
    }

    func load() -> SyncSettings {
        guard let data = defaults.data(forKey: settingsKey) else {
            let settings = SyncSettings.default()
            save(settings)
            return settings
        }
        do {
            var settings = try JSONDecoder().decode(SyncSettings.self, from: data)
            if settings.deviceId.isEmpty {
                settings.deviceId = Self.defaultDeviceId()
                save(settings)
            }
            if settings.intervalSeconds != 30 && settings.intervalSeconds != 60 && settings.intervalSeconds != 300 {
                settings.intervalSeconds = 60
            }
            return settings
        } catch {
            let settings = SyncSettings.default()
            save(settings)
            return settings
        }
    }

    func save(_ settings: SyncSettings) {
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: settingsKey)
        }
        defaults.set(settings.deviceId, forKey: deviceIdKey)
    }

    func loadToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty else {
            return nil
        }
        return token
    }

    func saveToken(_ token: String?) {
        if let token, !token.isEmpty {
            let data = Data(token.utf8)
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: keychainService,
                kSecAttrAccount as String: keychainAccount,
            ]
            let attrs: [String: Any] = [
                kSecValueData as String: data,
            ]
            let updateStatus = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
            if updateStatus == errSecItemNotFound {
                var insert = query
                insert[kSecValueData as String] = data
                SecItemAdd(insert as CFDictionary, nil)
            }
        } else {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: keychainService,
                kSecAttrAccount as String: keychainAccount,
            ]
            SecItemDelete(query as CFDictionary)
        }
    }

    func bridgeDictionary() -> [String: Any] {
        let settings = load()
        let hasToken = (loadToken()?.isEmpty == false)
        return [
            "enabled": settings.enabled,
            "serverURL": settings.serverURL,
            "workspaceId": settings.workspaceId,
            "deviceName": settings.deviceName,
            "deviceId": settings.deviceId,
            "mode": settings.mode.rawValue,
            "intervalSeconds": settings.intervalSeconds,
            "direction": settings.direction.rawValue,
            "conflictPolicy": settings.conflictPolicy.rawValue,
            "hasToken": hasToken,
            "apiTokenMasked": hasToken ? "••••••••" : "",
        ]
    }

    func updateFromBridgePayload(_ payload: [String: Any]) throws -> SyncSettings {
        var settings = load()

        if let enabled = payload["enabled"] as? Bool { settings.enabled = enabled }
        if let serverURL = payload["serverURL"] as? String { settings.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let workspaceId = payload["workspaceId"] as? String { settings.workspaceId = workspaceId.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let deviceName = payload["deviceName"] as? String { settings.deviceName = deviceName.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let deviceId = payload["deviceId"] as? String, !deviceId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            settings.deviceId = deviceId.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let mode = payload["mode"] as? String, let parsed = SyncMode(rawValue: mode) { settings.mode = parsed }
        if let interval = payload["intervalSeconds"] as? Int {
            settings.intervalSeconds = [30, 60, 300].contains(interval) ? interval : settings.intervalSeconds
        } else if let intervalNum = payload["intervalSeconds"] as? NSNumber {
            let interval = intervalNum.intValue
            settings.intervalSeconds = [30, 60, 300].contains(interval) ? interval : settings.intervalSeconds
        }
        if let direction = payload["direction"] as? String, let parsed = SyncDirection(rawValue: direction) {
            settings.direction = parsed
        }
        if let policy = payload["conflictPolicy"] as? String, let parsed = SyncConflictPolicy(rawValue: policy) {
            settings.conflictPolicy = parsed
        }
        if let token = payload["apiToken"] as? String {
            saveToken(token.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        if let token = payload["token"] as? String {
            saveToken(token.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        if settings.deviceId.isEmpty { settings.deviceId = Self.defaultDeviceId() }
        save(settings)
        return settings
    }
}
