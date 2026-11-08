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

// Lock widgets (step 5): models at the flow's clock points on Monday 2037-10-19 (EDT = UTC-4).
let snap = try! SnapshotReader.decode(data)  // made Mon 1:15 pm
func ctx(_ isoString: String) -> LockModel.Context { LockModel.context(snap, now: iso.date(from: isoString)!)! }
let at1315 = ctx("2037-10-19T17:15:00.000Z"), at1730 = ctx("2037-10-19T21:30:00.000Z")
let at2020 = ctx("2037-10-20T00:20:00.000Z"), at2230 = ctx("2037-10-20T02:30:00.000Z")

let cd = LockModel.countdown(at1315)
check(cd.live && cd.label == "1:15" && cd.caption == "LEFT", "Countdown 1:15 pm: 1:15 LEFT (\(cd.label) \(cd.caption))")
check(abs(cd.progress - 35.0 / 110.0) < 0.001, "Countdown progress 32%")
check(cd.accessibility == "Sermon Sync, 1 hour 15 minutes left", "Countdown label: \(cd.accessibility)")
let cdGap = LockModel.countdown(at2020)
check(!cdGap.live && cdGap.label == "8:30" && cdGap.caption == "NEXT", "Countdown in a gap: 8:30 NEXT")
check(cdGap.accessibility == "Next: WellServices at 8:30 pm", "Countdown gap label: \(cdGap.accessibility)")
let cdQuiet = LockModel.countdown(at1730)
check(!cdQuiet.live && cdQuiet.label == "6:15", "Countdown in a quiet block shows the next work block")

let ring = LockModel.dayRing(at1315)
check(ring.left == 5, "Day ring: 5 LEFT (\(ring.left))")
check(ring.segments.count == 7 && ring.segments.filter(\.past).count == 2, "Day ring: 7 work segments, 2 past")
check(abs(ring.now - (795.0 - 540.0) / 900.0) < 0.001, "Day ring now dot on a 9 am–12 am axis")
check(ring.accessibility == "5 work blocks left today", "Day ring label")

let up = LockModel.upNext(at1315)
check(up.kicker == "Next · in 1h 30m", "Up next kicker: \(up.kicker)")
check(up.title == "Cryptography prep" && up.detail == "2:45–4:15 · 1h 30m", "Up next: \(up.title) / \(up.detail)")
check(LockModel.upNext(at2020).kicker == "Next · in 10 min", "Up next under an hour: in 10 min")
let none = LockModel.upNext(at2230)
check(none.kicker == "Up next" && none.title == "Nothing else today" && none.detail == "Tomorrow 8:10 · Cryptography lecture",
      "Up next after the last block: \(none.title) / \(none.detail)")

let today = LockModel.today(at1315)
check(today.kicker == "Today · 7h 30m of work left", "Today kicker: \(today.kicker)")
check(today.startLabel == "9a" && today.endLabel == "12a" && today.middle == "5 blocks left", "Today footer: \(today.startLabel) · \(today.middle) · \(today.endLabel)")
check(today.bars.count == 7, "Today: 7 work bars")
check(LockModel.today(at2230).middle == "0 blocks left", "Today after the last block")

let wk = LockModel.week(at1315)!
// Done this week by 1:15 pm Monday: 80 + 60 + 35 = 175 min → 2.9 h.
check(wk.kicker.hasPrefix("Week · 2.9 / ") && wk.kicker.hasSuffix("h"), "Week kicker: \(wk.kicker)")
check(wk.todayIndex == 0 && wk.bars.count == 7 && wk.bars.allSatisfy { $0 >= 0.12 && $0 <= 1 }, "Week bars")
check(wk.detail == "Today: 10.4h planned", "Week detail: \(wk.detail)")

// Fallbacks: past both days → no context (widgets say "Open Dialed to refresh").
check(LockModel.context(snap, now: iso.date(from: "2037-10-21T12:00:00.000Z")!) == nil, "no context past both days")
// Timeline: entries only when a model changes; at most one a minute.
let ctl = LockModel.timeline(snap, from: iso.date(from: "2037-10-19T17:15:30.000Z")!) { LockModel.upNext($0) }
check(ctl.count > 1 && ctl.count <= 361, "Up next timeline entries (\(ctl.count))")

// Home widgets (step 6).
let t1315 = iso.date(from: "2037-10-19T17:15:00.000Z")!
let hn = HomeModel.now(at1315)!
check(hn.title == "Sermon Sync" && hn.left(at: t1315) == "1:15" && hn.foot == "Then Cryptography prep",
      "Now 1:15 pm: \(hn.title) \(hn.left(at: t1315)) / \(hn.foot)")
check(hn.start == iso.date(from: "2037-10-19T16:40:00.000Z")! && hn.end == iso.date(from: "2037-10-19T18:30:00.000Z")!,
      "Now timer runs 12:40–2:30 pm local")
check(hn.accessibility == "Now: Sermon Sync, until 2:30 pm. Then Cryptography prep at 2:45 pm", "Now label: \(hn.accessibility)")
check(HomeModel.now(at1730) == nil && HomeModel.now(at2020) == nil, "Now falls back to Up next in a meal and in a gap")
let hx = HomeModel.next(at1315)
check(hx.time == "2:45" && hx.title == "Cryptography prep" && hx.foot == "in 1h 30m · 1h 30m", "Up next: \(hx.time) \(hx.title) / \(hx.foot)")
let hxGap = HomeModel.next(at2020)
check(hxGap.time == "8:30" && hxGap.foot == "in 10 min · 1h 30m", "Up next in a gap: \(hxGap.foot)")
let hxLate = HomeModel.next(at2230)
check(hxLate.kicker == "Tomorrow" && hxLate.time == "8:10" && hxLate.title == "Cryptography lecture", "Up next after 10 pm: tomorrow")
let rt = HomeModel.rundownToday(at1315, meals: true)
check(rt.kicker == "Today · 7h 30m of work left", "Rundown kicker: \(rt.kicker)")
check(rt.rows.count == 4 && rt.rows[0].current && rt.rows[0].detail == "1:15 left" && rt.rows[0].time == "12:40",
      "Rundown current row: \(rt.rows.first.map { "\($0.time) \($0.detail)" } ?? "none")")
check(rt.rows.filter(\.current).count == 1 && rt.rows[1].title == "Break", "Rundown with meals shows the break")
let rtWork = HomeModel.rundownToday(at1315, meals: false)
check(rtWork.rows.map(\.title) == ["Sermon Sync", "Cryptography prep", "Gym", "Sermon Sync"], "Rundown without meals: \(rtWork.rows.map(\.title))")
check(rtWork.rows[1].detail == "1h 30m", "Rundown later rows show length")
let rtDone = HomeModel.rundownToday(at2230, meals: true)
check(rtDone.rows.isEmpty && rtDone.empty == "Tomorrow 8:10 · Cryptography lecture", "Rundown after 10 pm: \(rtDone.empty ?? "nil")")
let rw = HomeModel.rundownWeek(at1315)
check(rw.kicker.hasPrefix("Week 43 · ") && rw.kicker.hasSuffix(" hrs"), "Rundown week kicker: \(rw.kicker)")
check(rw.bars.count == 7 && rw.todayIndex == 0 && rw.top.count <= 3 && !rw.top.isEmpty, "Rundown week bars and top categories")
check(rw.top.allSatisfy { $0.hours.hasSuffix("h") && $0.name != "Other" }, "Rundown week categories named: \(rw.top.map(\.name))")
let tl1315 = HomeModel.timeline(at1315, meals: true)
check(tl1315.kicker == "Mon 19 · 5 blocks left", "Timeline kicker: \(tl1315.kicker)")
check(tl1315.blocks.count == 7 && tl1315.blocks.filter(\.current).count == 1 && tl1315.blocks[0].past, "Timeline: 7 blocks, lunch past, one current")
check(tl1315.nowLabel == "1:15" && tl1315.now > 0 && tl1315.now < 1 && tl1315.empty == nil, "Timeline now line at 1:15")
check(tl1315.blocks.allSatisfy { $0.top >= 0 && $0.top + $0.height <= 1.0001 }, "Timeline blocks fit the rail")
let tlLate = HomeModel.timeline(at2230, meals: false)
check(tlLate.empty == "Tomorrow 8:10 · Cryptography lecture" && tlLate.kicker == "Mon 19 · 0 blocks left", "Timeline after 10 pm: \(tlLate.empty ?? "nil")")
check(HomeModel.isoWeek("2038-01-04") == 1 && HomeModel.dayLabel("2037-10-20") == "Tue 20", "ISO week and day label")
// Now changes only at boundaries (the timer runs itself): few entries over 6 h.
let ntl = LockModel.timeline(snap, from: t1315) { HomeModel.now($0) }
check(ntl.count < 20, "Now timeline only at boundaries (\(ntl.count))")

print(failures == 0 ? "PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
