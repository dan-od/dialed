// Live Activity card content (Flow 08 step 8): the lock-screen card and Dynamic Island text and segment bar,
// from the activity's attributes and content state. Foundation only, so scripts/swift_glance_test checks it;
// BlockActivityWidget.swift only draws it. The countdown and the current segment's fill are system timers
// (`Text(timerInterval:)`, `ProgressView(timerInterval:)`): a Live Activity only redraws on a push or update.
import Foundation

enum ActivityModel {
  struct Next: Equatable {
    let title: String
    let startsAt: Date
    let durationMin: Int
  }

  struct Segment: Equatable {
    /// Share of the bar (current block + next two, by length).
    let fraction: Double
    /// The block's title, or nil when it is shorter than 30 minutes (Flow 08).
    let label: String?
    let current: Bool
  }

  struct Card: Equatable {
    /// "Now · until 2:30 pm".
    let headline: String
    let title: String
    let segments: [Segment]
    /// "Then Break at 2:30", or "Last block today".
    let then: String
    /// Dynamic Island expanded: "Then Break 2:30".
    let thenShort: String
    let accessibility: String
  }

  static let labelMinMin = 30

  static func card(title: String, startsAt: Date, endsAt: Date, next: [Next], timeZone: TimeZone) -> Card {
    let curMin = max(1, Int(endsAt.timeIntervalSince(startsAt) / 60))
    let blocks = [(title, curMin, true)] + next.prefix(2).map { ($0.title, max(1, $0.durationMin), false) }
    let total = Double(blocks.reduce(0) { $0 + $1.1 })
    let segments = blocks.map { b in
      Segment(fraction: Double(b.1) / total, label: b.1 >= labelMinMin ? b.0 : nil, current: b.2)
    }
    let until = clock(endsAt, timeZone)
    let n = next.first
    let then = n.map { "Then \($0.title) at \(bare($0.startsAt, timeZone))" } ?? "Last block today"
    let thenShort = n.map { "Then \($0.title) \(bare($0.startsAt, timeZone))" } ?? "Last block today"
    return Card(
      headline: "Now · until \(until)", title: title, segments: segments, then: then, thenShort: thenShort,
      accessibility: "\(title), until \(until). \(then)")
  }

  /// "2:30 pm" in `timeZone`.
  static func clock(_ d: Date, _ tz: TimeZone) -> String {
    let (h, m) = hm(d, tz)
    return "\(h % 12 == 0 ? 12 : h % 12):\(String(format: "%02d", m)) \(h < 12 ? "am" : "pm")"
  }

  /// "2:30".
  static func bare(_ d: Date, _ tz: TimeZone) -> String {
    let (h, m) = hm(d, tz)
    return "\(h % 12 == 0 ? 12 : h % 12):\(String(format: "%02d", m))"
  }

  private static func hm(_ d: Date, _ tz: TimeZone) -> (Int, Int) {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let c = cal.dateComponents([.hour, .minute], from: d)
    return (c.hour ?? 0, c.minute ?? 0)
  }
}
