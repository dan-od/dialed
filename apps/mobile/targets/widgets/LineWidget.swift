import SwiftUI
import WidgetKit

/// The line under the date (Flow 08, accessoryInline). Text from LineText (mirror of TS lineText).
struct LineEntry: TimelineEntry {
  let date: Date
  let text: String
}

struct LineProvider: TimelineProvider {
  func placeholder(in context: Context) -> LineEntry {
    LineEntry(date: Date(), text: "Then Cryptography prep at 2:45")
  }

  func getSnapshot(in context: Context, completion: @escaping (LineEntry) -> Void) {
    let now = Date()
    completion(LineEntry(date: now, text: Self.text(SnapshotReader.load(now: now), now: now)))
  }

  /// Entries where the text changes over the next 6 h, then a reload. The app also reloads after every
  /// snapshot write (C-x08), so edits show at once.
  func getTimeline(in context: Context, completion: @escaping (Timeline<LineEntry>) -> Void) {
    let now = Date()
    let load = SnapshotReader.load(now: now)
    guard case .ok(let s, _) = load else {
      completion(Timeline(entries: [LineEntry(date: now, text: Self.text(load, now: now))],
                          policy: .after(now.addingTimeInterval(3600))))
      return
    }
    let entries = LineText.timeline(s, from: now).map { LineEntry(date: $0.date, text: $0.text) }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
  }

  static func text(_ load: SnapshotLoad, now: Date) -> String {
    switch load {
    case .ok(let s, _): return LineText.at(s, now: now)
    case .signedOut: return LineText.signIn
    case .noAppGroup, .unreadable: return "Open Dialed to see your day"
    }
  }
}

struct LineView: View {
  let entry: LineEntry

  var body: some View {
    Text(entry.text)
      .widgetURL(URL(string: "dialed://day"))
      .containerBackgroundCompat()
  }
}

struct LineWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.line", provider: LineProvider()) { entry in
      LineView(entry: entry)
    }
    .configurationDisplayName("Line under the date")
    .description("What's now and next, above the time on your Lock Screen.")
    .supportedFamilies([.accessoryInline])
  }
}
