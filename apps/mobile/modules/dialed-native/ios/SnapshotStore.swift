import Foundation

/// The widget snapshot (`snapshot.json`, contract C-x08) in the App Group container. No tokens ever go here.
enum SnapshotStore {
  static let fileName = "snapshot.json"

  enum Failure: Error {
    case noAppGroup
    case notUTF8
  }

  /// The App Group comes from Info.plist `DialedAppGroup` (set in app.config.ts), shared with the widget.
  static func url() throws -> URL {
    guard
      let group = Bundle.main.object(forInfoDictionaryKey: "DialedAppGroup") as? String,
      let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { throw Failure.noAppGroup }
    return dir.appendingPathComponent(fileName)
  }

  /// Atomic write: the widget never reads a half-written file.
  static func write(_ json: String) throws {
    guard let data = json.data(using: .utf8) else { throw Failure.notUTF8 }
    try data.write(to: try url(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  static func clear() throws {
    let file = try url()
    if FileManager.default.fileExists(atPath: file.path) {
      try FileManager.default.removeItem(at: file)
    }
  }
}
