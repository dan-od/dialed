// Widget snapshot v1 (contract C-x08), mirror of packages/contracts/src/snapshot.ts.
// Foundation only, so scripts/swift_glance_test can compile and run it on the Mac without a Simulator.
import Foundation

struct SnapshotV1: Codable, Equatable {
  struct Block: Codable, Equatable {
    var key: String
    var title: String
    var startMin: Int
    var endMin: Int
    var categoryId: String
    var quiet: Bool
  }

  struct Day: Codable, Equatable {
    var date: String
    var blocks: [Block]
  }

  struct Week: Codable, Equatable {
    struct CategoryHours: Codable, Equatable {
      var categoryId: String
      var hours: Double
    }
    var start: String
    var hoursByDay: [Double]
    var plannedHours: Double
    var topCategories: [CategoryHours]
  }

  struct Category: Codable, Equatable {
    var name: String
    var colorDark: String
    var colorLight: String
    var quiet: Bool
  }

  struct Settings: Codable, Equatable {
    var lockMode: String
    var lineOn: Bool
    var rundownDefault: String
    var widgetMeals: Bool
  }

  var version: Int
  var generatedAt: String
  var timeZone: String
  var setupNeeded: Bool
  var days: [Day]
  var week: Week
  var categories: [String: Category]
  var settings: Settings

  var generatedDate: Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: generatedAt)
  }
}

/// What a widget can show (Flow 08 states): data, or one of the fallbacks.
enum SnapshotLoad: Equatable {
  /// `stale`: older than 26 h → grey the data and say "Open Dialed to refresh".
  case ok(SnapshotV1, stale: Bool)
  /// No file: signed out or never opened → "Sign in to Dialed".
  case signedOut
  /// No App Group container (Personal Team refused it, D-77) → "Open Dialed to see your day".
  case noAppGroup
  /// A file we can't read (newer schema, damaged) → same as no App Group.
  case unreadable
}

enum SnapshotReader {
  static let fileName = "snapshot.json"
  static let staleAfter: TimeInterval = 26 * 3600

  static func decode(_ data: Data) throws -> SnapshotV1 {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    let s = try d.decode(SnapshotV1.self, from: data)
    guard s.version == 1, s.days.count == 2, s.week.hoursByDay.count == 7 else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: [], debugDescription: "Unsupported snapshot version \(s.version)"))
    }
    return s
  }

  static func load(from data: Data?, now: Date = Date()) -> SnapshotLoad {
    guard let data else { return .signedOut }
    guard let s = try? decode(data) else { return .unreadable }
    let age = s.generatedDate.map { now.timeIntervalSince($0) } ?? .infinity
    return .ok(s, stale: age > staleAfter)
  }

  /// Reads `snapshot.json` from the App Group named in Info.plist `DialedAppGroup`.
  static func load(now: Date = Date(), bundle: Bundle = .main) -> SnapshotLoad {
    guard
      let group = bundle.object(forInfoDictionaryKey: "DialedAppGroup") as? String,
      let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return .noAppGroup }
    return load(from: try? Data(contentsOf: dir.appendingPathComponent(fileName)), now: now)
  }
}
