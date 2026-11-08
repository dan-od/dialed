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

print(failures == 0 ? "PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
