import Foundation

enum NoteFrontmatterNormalizer {
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatterNoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func ensure(content: String) -> (content: String, changed: Bool) {
        let now = nowIso()
        let parsed = parseFrontmatter(content)

        var meta = parsed.meta ?? [:]
        var changed = parsed.hadMalformedFrontmatter || !parsed.hasFrontmatter

        if (meta["id"]?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
            meta["id"] = UUID().uuidString.lowercased()
            changed = true
        }
        if !isParseableIso(meta["created_at"]) {
            meta["created_at"] = now
            changed = true
        }
        if !isParseableIso(meta["updated_at"]) {
            meta["updated_at"] = now
            changed = true
        }
        if let tags = meta["tags"], !isInlineList(tags) {
            meta["tags"] = "[]"
            changed = true
        }

        let yaml = serialize(meta: meta)
        let body = parsed.body.replacingOccurrences(of: "\r\n", with: "\n")
        let normalized = "---\n\(yaml)\n---\n\n\(body.replacingOccurrences(of: #"^\n+"#, with: "", options: .regularExpression))"

        if !changed && normalized != content {
            changed = true
        }
        return (normalized, changed)
    }

    private struct ParsedFrontmatter {
        let hasFrontmatter: Bool
        let hadMalformedFrontmatter: Bool
        let meta: [String: String]?
        let body: String
    }

    private static func parseFrontmatter(_ content: String) -> ParsedFrontmatter {
        let normalized = content.replacingOccurrences(of: "\r\n", with: "\n")
        guard normalized.hasPrefix("---\n") else {
            return ParsedFrontmatter(hasFrontmatter: false, hadMalformedFrontmatter: false, meta: nil, body: content)
        }

        guard let closeRange = normalized.range(of: "\n---", range: normalized.index(normalized.startIndex, offsetBy: 4)..<normalized.endIndex) else {
            return ParsedFrontmatter(hasFrontmatter: true, hadMalformedFrontmatter: true, meta: nil, body: content)
        }

        let yamlStart = normalized.index(normalized.startIndex, offsetBy: 4)
        let yaml = String(normalized[yamlStart..<closeRange.lowerBound])
        var after = closeRange.upperBound
        if after < normalized.endIndex, normalized[after] == "\n" {
            after = normalized.index(after, offsetBy: 1)
        }
        let body = String(normalized[after...])

        var meta: [String: String] = [:]
        for rawLine in yaml.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
            guard let idx = line.firstIndex(of: ":") else {
                return ParsedFrontmatter(hasFrontmatter: true, hadMalformedFrontmatter: true, meta: nil, body: body)
            }
            let key = line[..<idx].trimmingCharacters(in: .whitespaces)
            let value = line[line.index(after: idx)...].trimmingCharacters(in: .whitespaces)
            if key.isEmpty {
                return ParsedFrontmatter(hasFrontmatter: true, hadMalformedFrontmatter: true, meta: nil, body: body)
            }
            meta[key] = String(value)
        }

        return ParsedFrontmatter(hasFrontmatter: true, hadMalformedFrontmatter: false, meta: meta, body: body)
    }

    private static func serialize(meta: [String: String]) -> String {
        var lines: [String] = []
        let preferred = ["id", "created_at", "updated_at", "last_opened_at", "tags", "pinned", "pin_order"]
        var used = Set<String>()
        for key in preferred {
            if let value = meta[key] {
                lines.append("\(key): \(value)")
                used.insert(key)
            }
        }
        for key in meta.keys.sorted() where !used.contains(key) {
            if let value = meta[key] {
                lines.append("\(key): \(value)")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func isParseableIso(_ value: String?) -> Bool {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return isoFormatter.date(from: value) != nil || isoFormatterNoFractional.date(from: value) != nil
    }

    private static func isInlineList(_ value: String) -> Bool {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return v.hasPrefix("[") && v.hasSuffix("]")
    }

    private static func nowIso() -> String {
        isoFormatter.string(from: Date())
    }
}
