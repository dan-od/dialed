import SwiftUI
import WidgetKit

// Lock-screen widgets (Flow 08 step 5): Countdown and Day ring (circular), Up next, Today and This week
// (rectangular). Content comes from LockModel; these views only draw it.

struct LockEntry<M: Equatable>: TimelineEntry {
  let date: Date
  let model: M?
  /// Shown instead of data: "Sign in to Dialed", "Set up your week in Dialed", "Open Dialed to refresh"…
  let fallback: String?
}

struct LockProvider<M: Equatable>: TimelineProvider {
  let make: (LockModel.Context) -> M

  func placeholder(in context: Context) -> LockEntry<M> { LockEntry(date: Date(), model: nil, fallback: "Dialed") }

  func getSnapshot(in context: Context, completion: @escaping (LockEntry<M>) -> Void) {
    completion(entry(SnapshotReader.load(), at: Date()))
  }

  /// An entry wherever the content changes over the next 6 h, then a reload; the app reloads after each
  /// snapshot write (C-x08).
  func getTimeline(in context: Context, completion: @escaping (Timeline<LockEntry<M>>) -> Void) {
    let now = Date()
    let load = SnapshotReader.load(now: now)
    guard case .ok(let s, _) = load, LockModel.fallback(load, now: now) == nil else {
      completion(Timeline(entries: [entry(load, at: now)], policy: .after(now.addingTimeInterval(3600))))
      return
    }
    let entries = LockModel.timeline(s, from: now, make).map {
      LockEntry(date: $0.date, model: $0.model, fallback: $0.model == nil ? LineText.refresh : nil)
    }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
  }

  private func entry(_ load: SnapshotLoad, at now: Date) -> LockEntry<M> {
    if let f = LockModel.fallback(load, now: now) { return LockEntry(date: now, model: nil, fallback: f) }
    guard case .ok(let s, _) = load, let c = LockModel.context(s, now: now) else {
      return LockEntry(date: now, model: nil, fallback: LineText.refresh)
    }
    return LockEntry(date: now, model: make(c), fallback: nil)
  }
}

private let anton = "Anton-Regular"

private struct Kicker: View {
  let text: String
  var body: some View {
    Text(text.uppercased()).font(.system(size: 10.5, weight: .heavy)).tracking(0.4).opacity(0.8).lineLimit(1)
  }
}

private struct RectFallback: View {
  let text: String
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Kicker(text: "Dialed")
      Text(text).font(.system(size: 15, weight: .heavy)).lineLimit(2).minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct CircleFallback: View {
  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      Text("–").font(.custom(anton, size: 20))
    }
  }
}

// MARK: Countdown

struct CountdownView: View {
  let entry: LockEntry<LockModel.Countdown>
  var body: some View {
    Group {
      if let m = entry.model {
        ZStack {
          AccessoryWidgetBackground()
          Circle().inset(by: 5).stroke(.primary.opacity(0.22), lineWidth: 6)
          if m.live {
            Circle().inset(by: 5).trim(from: 0, to: m.progress)
              .stroke(.primary, style: StrokeStyle(lineWidth: 6, lineCap: .round))
              .rotationEffect(.degrees(-90))
          }
          VStack(spacing: 0) {
            Text(m.label).font(.custom(anton, size: 17, relativeTo: .body)).minimumScaleFactor(0.6)
            Text(m.caption).font(.system(size: 7.5, weight: .bold)).tracking(0.5).opacity(0.75)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(m.accessibility)
      } else {
        CircleFallback().accessibilityLabel(entry.fallback ?? "")
      }
    }
    .widgetURL(URL(string: "dialed://day"))
    .containerBackgroundCompat()
  }
}

struct CountdownWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.lock.countdown", provider: LockProvider(make: LockModel.countdown)) {
      CountdownView(entry: $0)
    }
    .configurationDisplayName("Countdown")
    .description("Time left in the current block, or until the next one.")
    .supportedFamilies([.accessoryCircular])
  }
}

// MARK: Day ring

struct DayRingView: View {
  let entry: LockEntry<LockModel.DayRing>
  var body: some View {
    Group {
      if let m = entry.model {
        GeometryReader { g in
          let side = min(g.size.width, g.size.height)
          let r = side / 2 - 8
          ZStack {
            AccessoryWidgetBackground()
            Circle().inset(by: 5).stroke(.primary.opacity(0.12), lineWidth: 6)
            ForEach(Array(m.segments.enumerated()), id: \.offset) { _, s in
              // A small gap between blocks, like the prototype's arcs.
              Circle().inset(by: 5).trim(from: s.start + 0.004, to: max(s.start + 0.008, s.end - 0.004))
                .stroke(.primary.opacity(s.past ? 0.35 : 1), style: StrokeStyle(lineWidth: 6, lineCap: .butt))
                .rotationEffect(.degrees(-90))
            }
            Circle().fill(Color.accentColor).overlay(Circle().stroke(.primary, lineWidth: 1.5))
              .frame(width: 9, height: 9)
              .offset(x: r * sin(m.now * 2 * .pi), y: -r * cos(m.now * 2 * .pi))
            VStack(spacing: 0) {
              Text("\(m.left)").font(.custom(anton, size: 20, relativeTo: .body)).minimumScaleFactor(0.6)
              Text("LEFT").font(.system(size: 7.5, weight: .bold)).tracking(0.5).opacity(0.75)
            }
          }
          .frame(width: g.size.width, height: g.size.height)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(m.accessibility)
      } else {
        CircleFallback().accessibilityLabel(entry.fallback ?? "")
      }
    }
    .widgetURL(URL(string: "dialed://day"))
    .containerBackgroundCompat()
  }
}

struct DayRingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.lock.dayring", provider: LockProvider(make: LockModel.dayRing)) {
      DayRingView(entry: $0)
    }
    .configurationDisplayName("Day ring")
    .description("Every work block today as a ring, with blocks left in the middle.")
    .supportedFamilies([.accessoryCircular])
  }
}

// MARK: Up next

struct UpNextView: View {
  let entry: LockEntry<LockModel.UpNext>
  var body: some View {
    Group {
      if let m = entry.model {
        VStack(alignment: .leading, spacing: 1) {
          Kicker(text: m.kicker)
          Text(m.title).font(.system(size: 15, weight: .heavy)).lineLimit(1)
          Text(m.detail).font(.system(size: 11, weight: .semibold)).opacity(0.8).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(m.accessibility)
      } else {
        RectFallback(text: entry.fallback ?? "")
      }
    }
    .widgetURL(URL(string: "dialed://day"))
    .containerBackgroundCompat()
  }
}

struct UpNextWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.lock.next", provider: LockProvider(make: LockModel.upNext)) {
      UpNextView(entry: $0)
    }
    .configurationDisplayName("Up next")
    .description("The next block, when it starts and how long until then.")
    .supportedFamilies([.accessoryRectangular])
  }
}

// MARK: Today

struct TodayView: View {
  let entry: LockEntry<LockModel.Today>
  var body: some View {
    Group {
      if let m = entry.model {
        VStack(alignment: .leading, spacing: 2) {
          Kicker(text: m.kicker)
          GeometryReader { g in
            ZStack(alignment: .leading) {
              ForEach(Array(m.bars.enumerated()), id: \.offset) { _, b in
                RoundedRectangle(cornerRadius: 3)
                  .fill(.primary.opacity(b.past ? 0.4 : 1))
                  .frame(width: max(2, (b.end - b.start) * g.size.width - 1.5), height: 8)
                  .offset(x: b.start * g.size.width)
              }
              Capsule().fill(Color.accentColor).frame(width: 3, height: 14)
                .offset(x: m.now * g.size.width - 1.5)
            }
            .frame(height: 14)
          }
          .frame(height: 14)
          HStack {
            Text(m.startLabel)
            Spacer()
            Text(m.middle)
            Spacer()
            Text(m.endLabel)
          }
          .font(.system(size: 11, weight: .semibold)).opacity(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(m.accessibility)
      } else {
        RectFallback(text: entry.fallback ?? "")
      }
    }
    .widgetURL(URL(string: "dialed://day"))
    .containerBackgroundCompat()
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.lock.today", provider: LockProvider(make: LockModel.today)) {
      TodayView(entry: $0)
    }
    .configurationDisplayName("Today")
    .description("A timeline of today with a now marker and hours of work left.")
    .supportedFamilies([.accessoryRectangular])
  }
}

// MARK: This week

struct WeekView: View {
  let entry: LockEntry<LockModel.Week?>
  var body: some View {
    Group {
      if let wrapped = entry.model, let m = wrapped {
        VStack(alignment: .leading, spacing: 2) {
          Kicker(text: m.kicker)
          HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(m.bars.enumerated()), id: \.offset) { i, h in
              RoundedRectangle(cornerRadius: 2)
                .fill(.primary.opacity(i == m.todayIndex ? 1 : 0.45))
                .frame(height: 22 * h)
            }
          }
          .frame(height: 22, alignment: .bottom)
          Text(m.detail).font(.system(size: 11, weight: .semibold)).opacity(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(m.accessibility)
      } else {
        RectFallback(text: entry.fallback ?? LineText.refresh)
      }
    }
    .widgetURL(URL(string: "dialed://week"))
    .containerBackgroundCompat()
  }
}

struct WeekWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.lock.week", provider: LockProvider(make: { LockModel.week($0) })) {
      WeekView(entry: $0)
    }
    .configurationDisplayName("This week")
    .description("Hours done against hours planned, day by day.")
    .supportedFamilies([.accessoryRectangular])
  }
}
