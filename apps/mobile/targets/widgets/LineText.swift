// The line under the date: Swift mirror of apps/mobile/src/glance/lineText.ts (D-82).
// Foundation only; scripts/swift_glance_test checks it against 1,000+ cases the TS side writes.
import Foundation

enum LineText {
  static let signIn = "Sign in to Dialed"
  static let setUp = "Set up your week in Dialed"
  static let refresh = "Open Dialed to refresh"
  /// After this minute a finished day names tomorrow's first work block.
  static let tomorrowFromMin = 22 * 60

  struct Brief: Equatable {
    let title: String
    let startMin: Int
  }

  enum State: Equatable {
    case work(title: String, left: Int, next: Brief?)
    case quiet(title: String, left: Int, next: Brief?)
    case gap(next: Brief)
    case done(tomorrow: Brief?, lateEvening: Bool)
  }

  private static func brief(_ b: SnapshotV1.Block?) -> Brief? {
    b.map { Brief(title: $0.title, startMin: $0.startMin) }
  }

  /// Prototype `nowNext`: current = earliest active work block, else any active block; next = next work block
  /// that starts after now, else the next block of any kind.
  static func state(today: [SnapshotV1.Block], tomorrow: [SnapshotV1.Block], minute: Int) -> State {
    let active = today.filter { $0.startMin <= minute && minute < $0.endMin }
    let later = today.filter { $0.startMin > minute }
    let next = brief(later.first { !$0.quiet } ?? later.first)
    if let cur = active.first(where: { !$0.quiet }) ?? active.first {
      return cur.quiet
        ? .quiet(title: cur.title, left: cur.endMin - minute, next: next)
        : .work(title: cur.title, left: cur.endMin - minute, next: next)
    }
    if let next { return .gap(next: next) }
    return .done(
      tomorrow: brief(tomorrow.first { !$0.quiet } ?? tomorrow.first),
      lateEvening: minute >= tomorrowFromMin)
  }

  /// "2:45" (no am/pm: the line is short).
  static func bareClock(_ min: Int) -> String {
    let h = (min / 60) % 24
    return "\(h % 12 == 0 ? 12 : h % 12):\(String(format: "%02d", min % 60))"
  }

  /// 110 → "1h 50m", 60 → "1h", 45 → "45m".
  static func duration(_ min: Int) -> String {
    let h = min / 60, m = min % 60
    if h == 0 { return "\(m)m" }
    return m == 0 ? "\(h)h" : "\(h)h \(m)m"
  }

  static func text(_ s: State, lockMode: String, lineOn: Bool) -> String {
    let live = lockMode == "live"
    if live && !lineOn { return "" }
    switch s {
    case .work(let title, let left, let next):
      if live { return next.map { "Then \($0.title) at \(bareClock($0.startMin))" } ?? "Last block today" }
      return "\(title) · \(duration(left)) left"
    case .quiet(let title, let left, let next):
      return "\(title) · \(duration(left)) left" + (next.map { ", then \($0.title)" } ?? "")
    case .gap(let next):
      return "Next: \(next.title) at \(bareClock(next.startMin))"
    case .done(let tomorrow, let late):
      if late, let t = tomorrow { return "Tomorrow: \(t.title) at \(bareClock(t.startMin))" }
      return "Day done"
    }
  }

  /// Local "yyyy-MM-dd" and minute of day in the snapshot's time zone.
  static func local(_ now: Date, timeZone: String) -> (date: String, minute: Int)? {
    guard let tz = TimeZone(identifier: timeZone) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let c = cal.dateComponents([.year, .month, .day, .hour, .minute], from: now)
    guard let y = c.year, let mo = c.month, let d = c.day, let h = c.hour, let mi = c.minute else { return nil }
    return (String(format: "%04d-%02d-%02d", y, mo, d), h * 60 + mi)
  }

  /// The inline widget's text at `now` (mirror of TS `lineAt`).
  static func at(_ s: SnapshotV1?, now: Date) -> String {
    guard let s else { return signIn }
    if s.setupNeeded { return setUp }
    guard let made = s.generatedDate, now.timeIntervalSince(made) <= SnapshotReader.staleAfter,
          let l = local(now, timeZone: s.timeZone),
          let i = s.days.firstIndex(where: { $0.date == l.date })
    else { return refresh }
    let today = s.days[i].blocks
    let tomorrow = i == 0 ? s.days[1].blocks : []
    return text(state(today: today, tomorrow: tomorrow, minute: l.minute),
                lockMode: s.settings.lockMode, lineOn: s.settings.lineOn)
  }

  /// Timeline entries for the next `hours`: one at `now`, then one at each minute where the text changes
  /// (block boundaries, and every minute while a "· Xm left" countdown shows). Entries cost no reload budget.
  static func timeline(_ s: SnapshotV1?, from now: Date, hours: Int = 6) -> [(date: Date, text: String)] {
    let start = Date(timeIntervalSince1970: (now.timeIntervalSince1970 / 60).rounded(.down) * 60)
    var out: [(date: Date, text: String)] = [(now, at(s, now: now))]
    for i in 1...(hours * 60) {
      let t = start.addingTimeInterval(TimeInterval(i * 60))
      let text = at(s, now: t)
      if text != out[out.count - 1].text { out.append((t, text)) }
    }
    return out
  }
}
