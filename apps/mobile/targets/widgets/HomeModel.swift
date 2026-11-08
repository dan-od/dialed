// Home-screen widget content (Flow 08 step 6): Now and Up next (small), Rundown (medium), Today timeline
// (large). Foundation only, so scripts/swift_glance_test checks it; HomeWidgets.swift only draws these values.
// Rules follow the prototype `homeWidget`.
import Foundation

enum HomeModel {
  // MARK: Now (small)

  /// The current work block. nil between blocks and in meals and breaks: the widget then shows Up next.
  struct Now: Equatable {
    let title: String
    /// Instants for `Text(timerInterval:)` and `ProgressView(timerInterval:)`: the countdown runs on its own,
    /// so the model (and the timeline) only changes at block boundaries.
    let start: Date
    let end: Date
    let foot: String
    let accessibility: String

    /// "1:15" at `now` (the prototype's figure; the widget's timer shows the same with seconds).
    func left(at now: Date) -> String { LockModel.clockCountdown(max(0, Int(end.timeIntervalSince(now) / 60))) }
  }

  static func now(_ c: LockModel.Context) -> Now? {
    guard let cur = LockModel.current(c), !cur.quiet,
          let start = instant(c, cur.startMin), let end = instant(c, cur.endMin) else { return nil }
    let next = LockModel.next(c)
    return Now(
      title: cur.title, start: start, end: end, foot: next.map { "Then \($0.title)" } ?? "Last one today",
      accessibility: "Now: \(cur.title), until \(LockModel.clock(cur.endMin))"
        + (next.map { ". Then \($0.title) at \(LockModel.clock($0.startMin))" } ?? ""))
  }

  // MARK: Up next (small)

  struct Next: Equatable {
    let kicker: String
    /// "2:45" in orange, or "–".
    let time: String
    let title: String
    let foot: String
    let accessibility: String
  }

  static func next(_ c: LockModel.Context) -> Next {
    if let n = LockModel.next(c) {
      let until = n.startMin - c.minute
      let foot = inText(until) + " · " + LineText.duration(n.endMin - n.startMin)
      return Next(kicker: "Up next", time: LineText.bareClock(n.startMin), title: n.title, foot: foot,
                  accessibility: "Up next: \(n.title) at \(LockModel.clock(n.startMin)), in \(LockModel.spoken(until))")
    }
    // Day done: after 10 pm the widgets name tomorrow's first block (Flow 08 states).
    if c.minute >= LineText.tomorrowFromMin, let t = c.tomorrow.first(where: { !$0.quiet }) ?? c.tomorrow.first {
      return Next(kicker: "Tomorrow", time: LineText.bareClock(t.startMin), title: t.title,
                  foot: LineText.duration(t.endMin - t.startMin),
                  accessibility: "Tomorrow: \(t.title) at \(LockModel.clock(t.startMin))")
    }
    return Next(kicker: "Up next", time: "–", title: "Nothing else today", foot: "Day done",
                accessibility: "Nothing else today")
  }

  // MARK: Rundown (medium)

  struct Row: Equatable {
    let time: String
    let title: String
    /// "1:15 left" on the current row, else the block's length.
    let detail: String
    let current: Bool
    let colorDark: String
    let colorLight: String
  }

  struct RundownToday: Equatable {
    let kicker: String
    let rows: [Row]
    /// Shown when no rows are left.
    let empty: String?
    let accessibility: String
  }

  static func rundownToday(_ c: LockModel.Context, meals: Bool) -> RundownToday {
    let left = LockModel.workLeft(c)
    let rows = c.today.filter { $0.endMin > c.minute && (meals || !$0.quiet) }.prefix(4).map { b -> Row in
      let cur = b.startMin <= c.minute
      return Row(time: LineText.bareClock(b.startMin), title: b.title,
                 detail: cur ? LockModel.clockCountdown(b.endMin - c.minute) + " left" : LineText.duration(b.endMin - b.startMin),
                 current: cur, colorDark: color(c, b).dark, colorLight: color(c, b).light)
    }
    let empty: String? = rows.isEmpty ? doneLine(c) : nil
    let spokenRows = rows.map { "\($0.time) \($0.title)" + ($0.current ? ", \($0.detail)" : "") }
    return RundownToday(
      kicker: "Today · \(LineText.duration(left)) of work left", rows: Array(rows), empty: empty,
      accessibility: (["Today, \(LockModel.spoken(left)) of work left"] + spokenRows + (empty.map { [$0] } ?? []))
        .joined(separator: ". "))
  }

  struct CategoryRow: Equatable {
    let name: String
    let hours: String
    let colorDark: String
    let colorLight: String
  }

  struct RundownWeek: Equatable {
    let kicker: String
    /// Bar heights 0.08–1, Monday first.
    let bars: [Double]
    let letters: [String]
    /// nil after the week rolled over.
    let todayIndex: Int?
    let top: [CategoryRow]
    let accessibility: String
  }

  static func rundownWeek(_ c: LockModel.Context) -> RundownWeek {
    let h = c.week.hoursByDay
    let mx = max(h.max() ?? 0, 0.1)
    let planned = Int(c.week.plannedHours.rounded())
    let top = c.week.topCategories.prefix(3).map { t -> CategoryRow in
      let cat = c.categories[t.categoryId]
      return CategoryRow(name: cat?.name ?? "Other", hours: LockModel.tenths(t.hours) + "h",
                         colorDark: cat?.colorDark ?? "#8A7A70", colorLight: cat?.colorLight ?? "#8A7A70")
    }
    let week = isoWeek(c.week.start).map { "Week \($0) · " } ?? "Week · "
    return RundownWeek(
      kicker: week + "\(planned) hrs", bars: h.map { max(0.08, min(1, $0 / mx)) },
      letters: ["M", "T", "W", "T", "F", "S", "S"], todayIndex: c.weekIndex, top: Array(top),
      accessibility: "This week: \(planned) hours planned. "
        + top.map { "\($0.name) \($0.hours.dropLast()) hours" }.joined(separator: ", "))
  }

  // MARK: Today timeline (large)

  struct RailBlock: Equatable {
    /// Position and height as fractions of the rail.
    let top: Double
    let height: Double
    let time: String
    let title: String
    let current: Bool
    let past: Bool
    let colorDark: String
    let colorLight: String
  }

  struct Timeline: Equatable {
    let kicker: String
    let blocks: [RailBlock]
    /// The orange now line, 0–1, and its chip "1:15".
    let now: Double
    let nowLabel: String
    let empty: String?
    let accessibility: String
  }

  static func timeline(_ c: LockModel.Context, meals: Bool) -> Timeline {
    let all = Array(c.today.filter { $0.endMin > c.minute - 60 && (meals || !$0.quiet) }.prefix(7))
    let t0 = min(c.minute, all.first?.startMin ?? c.minute)
    let t1 = max(c.minute, all.last?.endMin ?? c.minute + 60)
    let span = Double(max(1, t1 - t0))
    let blocks = all.map { b in
      RailBlock(top: Double(b.startMin - t0) / span, height: Double(b.endMin - b.startMin) / span,
                time: LineText.bareClock(b.startMin), title: b.title,
                current: b.startMin <= c.minute && c.minute < b.endMin, past: b.endMin <= c.minute,
                colorDark: color(c, b).dark, colorLight: color(c, b).light)
    }
    let left = c.today.filter { !$0.quiet && $0.endMin > c.minute }.count
    let blocksLeft = "\(left) block\(left == 1 ? "" : "s") left"
    let empty: String? = blocks.allSatisfy(\.past) ? doneLine(c) : nil
    let cur = blocks.first(where: \.current)
    return Timeline(
      kicker: "\(dayLabel(c.date)) · \(blocksLeft)", blocks: blocks, now: Double(c.minute - t0) / span,
      nowLabel: LineText.bareClock(c.minute), empty: empty,
      accessibility: ["\(dayLabel(c.date)), \(blocksLeft)", cur.map { "Now: \($0.title)" }, empty]
        .compactMap { $0 }.joined(separator: ". "))
  }

  // MARK: Helpers

  /// "in 1h 30m", "in 10 min" (prototype `inTxt`).
  static func inText(_ m: Int) -> String { m >= 60 ? "in \(LineText.duration(m))" : "in \(m) min" }

  /// "Day done", or after 10 pm "Tomorrow 8:10 · Cryptography lecture".
  static func doneLine(_ c: LockModel.Context) -> String {
    guard c.minute >= LineText.tomorrowFromMin, let t = c.tomorrow.first(where: { !$0.quiet }) ?? c.tomorrow.first
    else { return "Day done" }
    return "Tomorrow \(LineText.bareClock(t.startMin)) · \(t.title)"
  }

  static func color(_ c: LockModel.Context, _ b: SnapshotV1.Block) -> (dark: String, light: String) {
    let cat = c.categories[b.categoryId]
    return (cat?.colorDark ?? "#8A7A70", cat?.colorLight ?? "#8A7A70")
  }

  /// The instant of `minute` on the context's day in its time zone.
  static func instant(_ c: LockModel.Context, _ minute: Int) -> Date? {
    guard let tz = TimeZone(identifier: c.timeZone), let day = parse(c.date, tz) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    return cal.date(byAdding: .minute, value: minute, to: cal.startOfDay(for: day))
  }

  /// ISO week of a "yyyy-MM-dd" Monday (2037-10-19 → 43).
  static func isoWeek(_ date: String) -> Int? {
    guard let utc = TimeZone(identifier: "UTC"), let d = parse(date, utc) else { return nil }
    var cal = Calendar(identifier: .iso8601)
    cal.timeZone = utc
    return cal.component(.weekOfYear, from: d)
  }

  /// "2037-10-19" → "Mon 19".
  static func dayLabel(_ date: String) -> String {
    guard let utc = TimeZone(identifier: "UTC"), let d = parse(date, utc) else { return "Today" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = utc
    f.dateFormat = "EEE d"
    return f.string(from: d)
  }

  private static func parse(_ date: String, _ tz: TimeZone) -> Date? {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = tz
    f.dateFormat = "yyyy-MM-dd"
    return f.date(from: date)
  }
}
