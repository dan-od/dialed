import SwiftUI
import WidgetKit

/// Flow 08 widget bundle. Step 2 ships one scaffold widget that proves the App Group read end to end; the
/// line, lock and home widgets (steps 4–6) and the Live Activity UI (step 8) replace it.
@main
struct DialedWidgets: WidgetBundle {
  var body: some Widget {
    StatusWidget()
  }
}

struct StatusEntry: TimelineEntry {
  let date: Date
  let load: SnapshotLoad
}

struct StatusProvider: TimelineProvider {
  func placeholder(in context: Context) -> StatusEntry { StatusEntry(date: Date(), load: .signedOut) }

  func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
    completion(StatusEntry(date: Date(), load: SnapshotReader.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
    let now = Date()
    // Reloaded by the app after every snapshot write; hourly as a fallback.
    completion(Timeline(entries: [StatusEntry(date: now, load: SnapshotReader.load(now: now))],
                        policy: .after(now.addingTimeInterval(3600))))
  }
}

/// The fallback copy every Dialed widget uses (Flow 08 states).
func fallbackText(_ load: SnapshotLoad) -> String? {
  switch load {
  case .signedOut: return "Sign in to Dialed"
  case .noAppGroup, .unreadable: return "Open Dialed to see your day"
  case .ok(let s, _): return s.setupNeeded ? "Set up your week in Dialed" : nil
  }
}

struct StatusView: View {
  let entry: StatusEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("DIALED").font(.caption2.weight(.bold)).foregroundStyle(Color.accentColor)
      if let text = fallbackText(entry.load) {
        Text(text).font(.headline)
      } else if case .ok(let s, let stale) = entry.load {
        Text("\(s.days[0].blocks.count) blocks today")
          .font(.custom("Anton-Regular", size: 22, relativeTo: .title))
          .minimumScaleFactor(0.6)
        if stale { Text("Open Dialed to refresh").font(.caption) }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "dialed://day"))
    .containerBackgroundCompat()
  }
}

extension View {
  @ViewBuilder func containerBackgroundCompat() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(.fill.tertiary, for: .widget)
    } else {
      padding()
    }
  }
}

struct StatusWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.status", provider: StatusProvider()) { entry in
      StatusView(entry: entry)
    }
    .configurationDisplayName("Dialed")
    .description("Your day at a glance.")
    .supportedFamilies([.systemSmall])
  }
}
