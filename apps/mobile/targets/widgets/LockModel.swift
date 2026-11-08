// Lock-screen widget content (Flow 08 step 5): everything the five lock widgets show, computed from the
// snapshot. Foundation only, so scripts/swift_glance_test checks it at the flow's clock points; the SwiftUI
// views in LockWidgets.swift only draw these values. Rules follow the prototype `lockWidget`.
import Foundation

enum LockModel {
  /// Today in the snapshot at one minute, or nil when the snapshot can't answer (stale, past both days).
  struct Context: Equatable {
    let today: [SnapshotV1.Block]
    let tomorrow: [SnapshotV1.Block]
    let minute: Int
    /// Today's local date "yyyy-MM-dd" and the snapshot's time zone (home widgets turn minutes into instants).
    var date: String = ""
    var timeZone: String = ""
    var categories: [String: SnapshotV1.Category] = [:]
    let week: SnapshotV1.Week
    /// Today's position in `week.hoursByDay` (Monday = 0); nil after the week rolled over.
    let weekIndex: Int?
  }

  static func context(_ s: SnapshotV1, now: Date) -> Context? {
    guard !s.setupNeeded, let made = s.generatedDate, now.timeIntervalSince(made) <= SnapshotReader.staleAfter,
          let l = LineText.local(now, timeZone: s.timeZone),
          let i = s.days.firstIndex(where: { $0.date == l.date })
    else { return nil }
    let idx = daysBetween(s.week.start, l.date).flatMap { (0...6).contains($0) ? $0 : nil }
    return Context(today: s.days[i].blocks, tomorrow: i == 0 ? s.days[1].blocks : [], minute: l.minute,
                   date: l.date, timeZone: s.timeZone, categories: s.categories, week: s.week, weekIndex: idx)
  }

  /// The copy every widget shows instead of data (Flow 08 states), or nil when there is data.
  static func fallback(_ load: SnapshotLoad, now: Date) -> String? {
    switch load {
    case .signedOut: return LineText.signIn
    case .noAppGroup, .unreadable: return "Open Dialed to see your day"
    case .ok(let s, _):
      if s.setupNeeded { return LineText.setUp }
      return context(s, now: now) == nil ? LineText.refresh : nil
    }
  }

  // MARK: Countdown (circular)

  struct Countdown: Equatable {
    let live: Bool
    /// Share of the current work block gone, 0–1 (0 between blocks).
    let progress: Double
    /// "1:15" left, or the next block's start "8:30", or "–".
    let label: String
    let caption: String
    let accessibility: String
  }

  static func countdown(_ c: Context) -> Countdown {
    if let cur = current(c), !cur.quiet {
      let left = cur.endMin - c.minute
      return Countdown(
        live: true, progress: Double(c.minute - cur.startMin) / Double(cur.endMin - cur.startMin),
        label: clockCountdown(left), caption: "LEFT",
        accessibility: "\(cur.title), \(spoken(left)) left")
    }
    guard let n = next(c) else {
      return Countdown(live: false, progress: 0, label: "–", caption: "NEXT", accessibility: "Nothing else today")
    }
    return Countdown(live: false, progress: 0, label: LineText.bareClock(n.startMin), caption: "NEXT",
                     accessibility: "Next: \(n.title) at \(clock(n.startMin))")
  }

  // MARK: Day ring (circular)

  struct Segment: Equatable {
    /// Fractions of the day axis, 0–1.
    let start: Double
    let end: Double
    let past: Bool
  }

  struct DayRing: Equatable {
    let segments: [Segment]
    let now: Double
    let left: Int
    let accessibility: String
  }

  static func dayRing(_ c: Context) -> DayRing {
    let (a0, span) = axis(c)
    let frac = { (m: Int) in min(1, max(0, Double(m - a0) / Double(span))) }
    let work = c.today.filter { !$0.quiet }
    let left = work.filter { $0.endMin > c.minute }.count
    return DayRing(
      segments: work.map { Segment(start: frac($0.startMin), end: frac($0.endMin), past: $0.endMin <= c.minute) },
      now: frac(c.minute), left: left,
      accessibility: "\(left) work block\(left == 1 ? "" : "s") left today")
  }

  // MARK: Up next (rectangular)

  struct UpNext: Equatable {
    let kicker: String
    let title: String
    let detail: String
    let accessibility: String
  }

  static func upNext(_ c: Context) -> UpNext {
    if let n = next(c) {
      let until = n.startMin - c.minute
      let len = n.endMin - n.startMin
      return UpNext(
        kicker: "Next · " + (until >= 60 ? "in \(LineText.duration(until))" : "in \(until) min"),
        title: n.title,
        detail: "\(LineText.bareClock(n.startMin))–\(LineText.bareClock(n.endMin))"
          + (len > 0 ? " · \(LineText.duration(len))" : ""),
        accessibility: "Next: \(n.title), \(clock(n.startMin)) to \(clock(n.endMin)), in \(spoken(until))")
    }
    let t = c.tomorrow.first { !$0.quiet } ?? c.tomorrow.first
    let detail = t.map { "Tomorrow \(LineText.bareClock($0.startMin)) · \($0.title)" } ?? "Free day tomorrow"
    return UpNext(kicker: "Up next", title: "Nothing else today", detail: detail,
                  accessibility: "Nothing else today. " + detail)
  }

  // MARK: Today (rectangular)

  struct Today: Equatable {
    let kicker: String
    let bars: [Segment]
    let now: Double
    let startLabel: String
    let middle: String
    let endLabel: String
    let accessibility: String
  }

  static func today(_ c: Context) -> Today {
    let ring = dayRing(c)
    let leftMin = workLeft(c)
    let (a0, span) = axis(c)
    let blocks = "\(ring.left) block\(ring.left == 1 ? "" : "s") left"
    return Today(
      kicker: "Today · \(LineText.duration(leftMin)) of work left", bars: ring.segments, now: ring.now,
      startLabel: hourLabel(a0), middle: blocks, endLabel: hourLabel(a0 + span),
      accessibility: "\(spoken(leftMin)) of work left today, \(blocks)")
  }

  // MARK: This week (rectangular)

  struct Week: Equatable {
    let kicker: String
    /// Bar heights 0.12–1, Monday first.
    let bars: [Double]
    let todayIndex: Int
    let detail: String
    let accessibility: String
  }

  static func week(_ c: Context) -> Week? {
    guard let i = c.weekIndex, c.week.hoursByDay.count == 7 else { return nil }
    let h = c.week.hoursByDay
    let total = c.today.filter { !$0.quiet }.reduce(0) { $0 + $1.endMin - $1.startMin }
    let done = h[..<i].reduce(0, +) + Double(total - workLeft(c)) / 60
    let mx = max(h.max() ?? 0, 0.1)
    let planned = Int(c.week.plannedHours.rounded())
    return Week(
      kicker: "Week · \(tenths(done)) / \(planned)h", bars: h.map { max(0.12, min(1, $0 / mx)) }, todayIndex: i,
      detail: "Today: \(tenths(h[i]))h planned",
      accessibility: "This week: \(tenths(done)) of \(planned) hours done. Today: \(tenths(h[i])) hours planned")
  }

  // MARK: Timeline

  /// Entries for the next `hours`: one at `now`, then one at each minute where the model changes.
  static func timeline<M: Equatable>(_ s: SnapshotV1, from now: Date, hours: Int = 6,
                                     _ model: (Context) -> M) -> [(date: Date, model: M?)] {
    let start = Date(timeIntervalSince1970: (now.timeIntervalSince1970 / 60).rounded(.down) * 60)
    var out: [(date: Date, model: M?)] = [(now, context(s, now: now).map(model))]
    for i in 1...(hours * 60) {
      let t = start.addingTimeInterval(TimeInterval(i * 60))
      let m = context(s, now: t).map(model)
      if m != out[out.count - 1].model { out.append((t, m)) }
    }
    return out
  }

  // MARK: Helpers

  /// Earliest active work block, else any active block (prototype `nowNext`).
  static func current(_ c: Context) -> SnapshotV1.Block? {
    let active = c.today.filter { $0.startMin <= c.minute && c.minute < $0.endMin }
    return active.first { !$0.quiet } ?? active.first
  }

  /// Next work block that starts after now, else the next block of any kind.
  static func next(_ c: Context) -> SnapshotV1.Block? {
    let later = c.today.filter { $0.startMin > c.minute }
    return later.first { !$0.quiet } ?? later.first
  }

  static func workLeft(_ c: Context) -> Int {
    c.today.filter { !$0.quiet && $0.endMin > c.minute }.reduce(0) { $0 + $1.endMin - max($1.startMin, c.minute) }
  }

  /// The day axis: 9 am (or the hour of an earlier first block) to midnight, like the prototype's 9a–12a.
  static func axis(_ c: Context) -> (start: Int, span: Int) {
    let first = c.today.map(\.startMin).min() ?? 540
    let start = min(540, first / 60 * 60)
    return (start, 1440 - start)
  }

  /// 540 → "9a", 1440 → "12a", 780 → "1p".
  static func hourLabel(_ m: Int) -> String {
    let h = (m / 60) % 24
    return "\(h % 12 == 0 ? 12 : h % 12)\(h < 12 ? "a" : "p")"
  }

  /// "8:30 pm" (formatClock).
  static func clock(_ m: Int) -> String {
    let h = (m / 60) % 24
    return "\(LineText.bareClock(m)) \(h < 12 ? "am" : "pm")"
  }

  /// "1:15" (formatCountdown).
  static func clockCountdown(_ m: Int) -> String { "\(m / 60):\(String(format: "%02d", m % 60))" }

  /// VoiceOver duration: 75 → "1 hour 15 minutes" (spokenDuration).
  static func spoken(_ m: Int) -> String {
    let h = m / 60, mm = m % 60
    var parts: [String] = []
    if h > 0 { parts.append("\(h) hour\(h == 1 ? "" : "s")") }
    if mm > 0 || h == 0 { parts.append("\(mm) minute\(mm == 1 ? "" : "s")") }
    return parts.joined(separator: " ")
  }

  /// 2.916 → "2.9", 9.0 → "9" (prototype `f1`).
  static func tenths(_ x: Double) -> String {
    let r = (x * 10).rounded() / 10
    return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
  }

  static func daysBetween(_ a: String, _ b: String) -> Int? {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    guard let da = f.date(from: a), let db = f.date(from: b) else { return nil }
    return Int((db.timeIntervalSince(da) / 86400).rounded())
  }
}
