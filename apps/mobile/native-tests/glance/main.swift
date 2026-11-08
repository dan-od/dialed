// Decodes the TS-built fixture with the widget's own SnapshotReader (Flow 08 step 2). main.swift: the entry point.
// Run: scripts/swift_glance_test (compiles with targets/widgets/Snapshot.swift on the Mac; no Simulator).
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
  if !ok { failures += 1; print("FAIL (line \(line)): \(what)") } else { print("ok: \(what)") }
}

let dir = URL(fileURLWithPath: CommandLine.arguments[1])
let data = try! Data(contentsOf: dir.appendingPathComponent("snapshot-v1.json"))

do {
  let s = try SnapshotReader.decode(data)
  check(s.version == 1, "version 1")
  check(s.timeZone == "America/Toronto", "time zone")
  check(s.days.map(\.date) == ["2037-10-19", "2037-10-20"], "today and tomorrow")
  check(s.days[0].blocks.count == 11, "11 blocks on Monday")
  let sermon = s.days[0].blocks[4]
  check(sermon.title == "Sermon Sync" && sermon.startMin == 760 && sermon.endMin == 870, "Sermon Sync 12:40–2:30")
  check(s.days[0].blocks[0].quiet, "Breakfast is quiet")
  check(s.week.hoursByDay.count == 7 && s.week.hoursByDay[0] == 10.4, "Monday 10.4h")
  check(s.week.topCategories.count == 3, "top 3 categories")
  check(s.categories.values.contains { $0.name == "Meal" && $0.quiet }, "Meal category is quiet")
  check(s.settings.lockMode == "live" && s.settings.lineOn, "settings")
  check(!s.setupNeeded, "not setup")
  check(s.generatedDate != nil, "generated_at parses")
} catch {
  check(false, "decode threw \(error)")
}

let made = ISO8601DateFormatter().date(from: "2037-10-19T17:15:00Z")!
if case .ok(_, let stale) = SnapshotReader.load(from: data, now: made.addingTimeInterval(3600)) {
  check(!stale, "fresh after 1 h")
} else { check(false, "loads") }
if case .ok(_, let stale) = SnapshotReader.load(from: data, now: made.addingTimeInterval(27 * 3600)) {
  check(stale, "stale after 27 h")
} else { check(false, "loads when stale") }
check(SnapshotReader.load(from: nil) == .signedOut, "no file → signed out")
check(SnapshotReader.load(from: Data("{}".utf8)) == .unreadable, "damaged file → unreadable")
var v2 = String(decoding: data, as: UTF8.self)
v2 = v2.replacingOccurrences(of: "\"version\":1", with: "\"version\":2")
check(SnapshotReader.load(from: Data(v2.utf8)) == .unreadable, "newer schema → unreadable")

// LineText parity: the TS side's answers (lineAt) for every case in line-cases.json.
struct LineCases: Decodable {
  struct Case: Decodable { let snapshot: String; let now: String; let expected: String }
  let snapshots: [String: SnapshotV1]
  let cases: [Case]
}
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
let lineDecoder = JSONDecoder()
lineDecoder.keyDecodingStrategy = .convertFromSnakeCase
let lc = try! lineDecoder.decode(
  LineCases.self, from: Data(contentsOf: dir.appendingPathComponent("line-cases.json")))
var mismatches = 0
for c in lc.cases {
  let got = LineText.at(c.snapshot == "none" ? nil : lc.snapshots[c.snapshot], now: iso.date(from: c.now)!)
  if got != c.expected {
    mismatches += 1
    if mismatches <= 10 { print("  \(c.snapshot) \(c.now): Swift \"\(got)\" vs TS \"\(c.expected)\"") }
  }
}
check(mismatches == 0, "LineText matches lineAt in all \(lc.cases.count) cases (\(mismatches) differ)")

// Timeline: an entry at now, then only where the text changes; the 5:30 pm Dinner line is an entry.
let live = lc.snapshots["live"]!
let from = iso.date(from: "2037-10-19T21:28:30.000Z")!  // Mon 5:28:30 pm EDT
let tl = LineText.timeline(live, from: from)
check(tl.first?.date == from, "first entry at now")
check(tl.count <= 361, "at most one entry a minute (\(tl.count))")
check(zip(tl, tl.dropFirst()).allSatisfy { $0.text != $1.text && $0.date < $1.date }, "entries change text, in order")
check(tl.contains { $0.date == iso.date(from: "2037-10-19T21:30:00.000Z")! && $0.text == "Dinner · 45m left, then Sermon Sync" },
      "5:30 pm entry: Dinner · 45m left, then Sermon Sync")
check(tl.contains { $0.date == iso.date(from: "2037-10-19T22:15:00.000Z")! && $0.text == "Then WellServices at 8:30" },
      "6:15 pm entry: Then WellServices at 8:30")

print(failures == 0 ? "PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
