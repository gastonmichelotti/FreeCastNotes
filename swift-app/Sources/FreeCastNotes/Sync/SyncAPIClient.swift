import Foundation

struct SyncHealthResponse: Codable {
    let ok: Bool
    let service: String?
    let version: String?
    let time: String?
}

struct SyncManifestRequest: Codable {
    struct Device: Codable {
        let deviceId: String
        let deviceName: String
        let appVersion: String
        let platform: String
    }
    struct SyncConfig: Codable {
        let direction: String
        let conflictPolicy: String
    }
    struct FileEntry: Codable {
        let path: String
        let sha256: String
        let size: Int
        let mtimeMs: Int64
    }
    struct DeleteEntry: Codable {
        let path: String
        let deletedAtMs: Int64
    }

    let workspaceId: String
    let device: Device
    let sync: SyncConfig
    let files: [FileEntry]
    let deletes: [DeleteEntry]
    let cursor: String?
}

struct SyncManifestResponse: Codable {
    struct Decision: Codable {
        struct Conflict: Codable {
            let path: String
            let clientMtimeMs: Int64?
            let serverMtimeMs: Int64?
            let resolution: String
        }
        let push: [String]
        let pull: [String]
        let conflicts: [Conflict]
        let acceptDeletes: [String]
    }

    let serverTimeMs: Int64
    let decision: Decision
    let nextCursor: String
}

struct SyncPushRequest: Codable {
    struct FileEntry: Codable {
        let path: String
        let sha256: String
        let size: Int
        let mtimeMs: Int64
        let encoding: String
        let contentBase64: String
    }
    struct DeleteEntry: Codable {
        let path: String
        let deletedAtMs: Int64
    }

    let workspaceId: String
    let deviceId: String
    let files: [FileEntry]
    let deletes: [DeleteEntry]
}

struct SyncPushResponse: Codable {
    struct RejectedEntry: Codable {
        let path: String
        let reason: String?
    }
    struct Conflict: Codable {
        let path: String
        let clientMtimeMs: Int64?
        let serverMtimeMs: Int64?
        let resolution: String?
    }

    let applied: [String]
    let deleted: [String]
    let rejected: [RejectedEntry]
    let conflicts: [Conflict]
    let nextCursor: String
}

struct SyncPullRequest: Codable {
    let workspaceId: String
    let deviceId: String
    let paths: [String]
}

struct SyncPullResponse: Codable {
    struct FileEntry: Codable {
        let path: String
        let sha256: String
        let size: Int
        let mtimeMs: Int64
        let encoding: String
        let contentBase64: String
    }
    let files: [FileEntry]
    let missing: [String]
    let nextCursor: String
}

struct SyncServerStateResponse: Codable {
    let workspaceId: String
    let deviceId: String
    let lastSeenAtMs: Int64?
    let lastSyncAtMs: Int64?
    let pendingServerChanges: Int
    let lastError: String?
}

enum SyncAPIClientError: LocalizedError {
    case invalidURL
    case insecureHTTPNotAllowed
    case missingToken
    case httpStatus(Int, String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .insecureHTTPNotAllowed:
            return "HTTP is only allowed for localhost during development. Use HTTPS for remote servers."
        case .missingToken:
            return "Missing sync API token"
        case let .httpStatus(code, body):
            return body.isEmpty ? "Server error (HTTP \(code))" : "Server error (HTTP \(code)): \(body)"
        case .invalidResponse:
            return "Invalid server response"
        }
    }
}

final class SyncAPIClient {
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let session: URLSession

    init() {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        self.encoder = encoder
        self.decoder = decoder

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
    }

    func health(serverURL: String) async throws -> SyncHealthResponse {
        let base = try normalizedBaseURL(serverURL)
        var req = URLRequest(url: base.appendingPathComponent("health"))
        req.httpMethod = "GET"
        return try await send(req, responseType: SyncHealthResponse.self)
    }

    func manifest(serverURL: String, token: String, requestBody: SyncManifestRequest) async throws -> SyncManifestResponse {
        let req = try makeJSONRequest(serverURL: serverURL, token: token, path: "/sync/manifest", body: requestBody)
        return try await send(req, responseType: SyncManifestResponse.self)
    }

    func push(serverURL: String, token: String, requestBody: SyncPushRequest) async throws -> SyncPushResponse {
        let req = try makeJSONRequest(serverURL: serverURL, token: token, path: "/sync/push", body: requestBody)
        return try await send(req, responseType: SyncPushResponse.self)
    }

    func pull(serverURL: String, token: String, requestBody: SyncPullRequest) async throws -> SyncPullResponse {
        let req = try makeJSONRequest(serverURL: serverURL, token: token, path: "/sync/pull", body: requestBody)
        return try await send(req, responseType: SyncPullResponse.self)
    }

    func state(serverURL: String, token: String, workspaceId: String, deviceId: String) async throws -> SyncServerStateResponse {
        let base = try normalizedBaseURL(serverURL)
        var comps = URLComponents(url: base.appendingPathComponent("sync/state"), resolvingAgainstBaseURL: false)
        comps?.queryItems = [
            URLQueryItem(name: "workspaceId", value: workspaceId),
            URLQueryItem(name: "deviceId", value: deviceId),
        ]
        guard let url = comps?.url else { throw SyncAPIClientError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(req, responseType: SyncServerStateResponse.self)
    }

    private func normalizedBaseURL(_ value: String) throws -> URL {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw SyncAPIClientError.invalidURL }
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        guard let url = URL(string: normalized), let scheme = url.scheme, ["http", "https"].contains(scheme.lowercased()) else {
            throw SyncAPIClientError.invalidURL
        }
        if scheme.lowercased() == "http" {
            let host = (url.host ?? "").lowercased()
            let isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "::1"
            if !isLocalhost {
                throw SyncAPIClientError.insecureHTTPNotAllowed
            }
        }
        return url
    }

    private func makeJSONRequest<T: Encodable>(serverURL: String, token: String, path: String, body: T) throws -> URLRequest {
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw SyncAPIClientError.missingToken
        }
        let base = try normalizedBaseURL(serverURL)
        let cleanPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let url = base.appendingPathComponent(cleanPath)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try encoder.encode(body)
        return req
    }

    private func send<T: Decodable>(_ request: URLRequest, responseType: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SyncAPIClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data))
                .flatMap { obj -> String? in
                    if let dict = obj as? [String: Any] {
                        if let msg = dict["message"] as? String { return msg }
                        if let err = dict["error"] as? String { return err }
                    }
                    return String(data: data, encoding: .utf8)
                } ?? ""
            throw SyncAPIClientError.httpStatus(http.statusCode, message)
        }
        return try decoder.decode(responseType, from: data)
    }
}
