import AppIntents
import SwiftUI
import WidgetKit

// Home-screen widgets (Flow 08 step 6): Now and Up next (small), Rundown (medium), Today timeline (large).
// Content comes from HomeModel; these views only draw it. Rundown and Today timeline are configured in the
// iOS widget editor (D-14): RundownIntent (Show: Today | This week, Meals and breaks) and TimelineIntent.

// MARK: Entries and providers

struct HomeEntry<M: Equatable>: TimelineEntry {
  let date: Date
  let model: M?
  /// "Sign in to Dialed", "Set up your week in Dialed", "Open Dialed to refresh"…
  let fallback: String?
}

/// Entries wherever the content changes over the next 6 h (block boundaries; every minute only while a
/// minute figure shows), then a reload. The app reloads after each snapshot write (C-x08).
func homeTimeline<M: Equatable>(_ make: (LockModel.Context) -> M) -> Timeline<HomeEntry<M>> {
  let now = Date()
  let load = SnapshotReader.load(now: now)
  guard case .ok(let s, _) = load, LockModel.fallback(load, now: now) == nil else {
    return Timeline(entries: [homeEntry(load, at: now, make)], policy: .after(now.addingTimeInterval(3600)))
  }
  let entries = LockModel.timeline(s, from: now, make).map {
    HomeEntry(date: $0.date, model: $0.model, fallback: $0.model == nil ? LineText.refresh : nil)
  }
  return Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600)))
}

func homeEntry<M: Equatable>(_ load: SnapshotLoad, at now: Date, _ make: (LockModel.Context) -> M) -> HomeEntry<M> {
  if let f = LockModel.fallback(load, now: now) { return HomeEntry(date: now, model: nil, fallback: f) }
  guard case .ok(let s, _) = load, let c = LockModel.context(s, now: now) else {
    return HomeEntry(date: now, model: nil, fallback: LineText.refresh)
  }
  return HomeEntry(date: now, model: make(c), fallback: nil)
}

struct HomeProvider<M: Equatable>: TimelineProvider {
  let make: (LockModel.Context) -> M
  func placeholder(in context: Context) -> HomeEntry<M> { HomeEntry(date: Date(), model: nil, fallback: "Dialed") }
  func getSnapshot(in context: Context, completion: @escaping (HomeEntry<M>) -> Void) {
    completion(homeEntry(SnapshotReader.load(), at: Date(), make))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<HomeEntry<M>>) -> Void) {
    completion(homeTimeline(make))
  }
}

// MARK: Configuration (iOS 17+; iOS 16.4 gets the defaults: Today, meals and breaks on)

@available(iOS 17.0, *)
enum RundownShow: String, AppEnum {
  case today, week
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [RundownShow: DisplayRepresentation] = [
    .today: "Today", .week: "This week",
  ]
}

@available(iOS 17.0, *)
struct RundownIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Rundown"
  static var description = IntentDescription("Choose what the Rundown shows.")
  @Parameter(title: "Show", default: .today) var show: RundownShow
  @Parameter(title: "Meals and breaks", default: true) var meals: Bool
}

@available(iOS 17.0, *)
struct TimelineIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Today timeline"
  static var description = IntentDescription("Choose what the timeline shows.")
  @Parameter(title: "Meals and breaks", default: true) var meals: Bool
}

@available(iOS 17.0, *)
struct RundownIntentProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> HomeEntry<Rundown> { HomeEntry(date: Date(), model: nil, fallback: "Dialed") }
  func snapshot(for c: RundownIntent, in context: Context) async -> HomeEntry<Rundown> {
    homeEntry(SnapshotReader.load(), at: Date(), Rundown.make(c.show == .week, meals: c.meals))
  }
  func timeline(for c: RundownIntent, in context: Context) async -> Timeline<HomeEntry<Rundown>> {
    homeTimeline(Rundown.make(c.show == .week, meals: c.meals))
  }
}

@available(iOS 17.0, *)
struct TimelineIntentProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> HomeEntry<HomeModel.Timeline> {
    HomeEntry(date: Date(), model: nil, fallback: "Dialed")
  }
  func snapshot(for c: TimelineIntent, in context: Context) async -> HomeEntry<HomeModel.Timeline> {
    homeEntry(SnapshotReader.load(), at: Date()) { HomeModel.timeline($0, meals: c.meals) }
  }
  func timeline(for c: TimelineIntent, in context: Context) async -> Timeline<HomeEntry<HomeModel.Timeline>> {
    homeTimeline { HomeModel.timeline($0, meals: c.meals) }
  }
}

// MARK: Look

private let anton = "Anton-Regular"
private let ink = Color(hex: "#140A05")
private let orange = Color(hex: "#FF5A1F")

enum HomeStyle { case hot, glass }

extension Color {
  /// "#RRGGBB".
  init(hex: String) {
    let v = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
  }
}

private struct HomeBackground: ViewModifier {
  let style: HomeStyle
  @Environment(\.colorScheme) private var scheme

  private var fill: LinearGradient {
    switch style {
    case .hot:
      return LinearGradient(colors: [Color(hex: "#FF8A4C"), orange, Color(hex: "#E2440E")],
                            startPoint: .topLeading, endPoint: .bottomTrailing)
    case .glass:
      return scheme == .dark
        ? LinearGradient(colors: [Color(hex: "#301C12"), Color(hex: "#120905")], startPoint: .topLeading, endPoint: .bottomTrailing)
        : LinearGradient(colors: [.white, Color(hex: "#FBF0E8")], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
  }

  private var text: Color { style == .hot || scheme == .light ? ink : Color(hex: "#FFF1E8") }

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.foregroundStyle(text).containerBackground(for: .widget) { fill }
    } else {
      content.foregroundStyle(text).padding(14).background(fill)
    }
  }
}

extension View {
  fileprivate func homeBackground(_ style: HomeStyle) -> some View { modifier(HomeBackground(style: style)) }
}

/// "NOW" / "UP NEXT" with the small mark on the right, like the prototype's kicker row.
private struct HomeKicker: View {
  let text: String
  var mark: Color = orange
  var body: some View {
    HStack {
      Text(text.uppercased()).font(.system(size: 11, weight: .heavy)).tracking(0.6).lineLimit(1)
      Spacer(minLength: 4)
      Circle().fill(mark).frame(width: 9, height: 9).accessibilityHidden(true)
    }
  }
}

private struct HomeFallback: View {
  let text: String
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HomeKicker(text: "Dialed")
      Spacer(minLength: 0)
      Text(text).font(.system(size: 15, weight: .heavy)).lineLimit(3).minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// Category colour for the light or dark appearance.
private struct Swatch: View {
  let dark: String
  let light: String
  var width: CGFloat = 9
  var height: CGFloat = 9
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    RoundedRectangle(cornerRadius: 3).fill(Color(hex: scheme == .dark ? dark : light)).frame(width: width, height: height)
  }
}

/// Numeric transitions for changing figures; none with Reduce Motion (Flow 08).
private struct Numeric: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduce
  func body(content: Content) -> some View {
    content.contentTransition(reduce ? .identity : .numericText())
  }
}

// MARK: Now (small)

enum NowOrNext: Equatable {
  case now(HomeModel.Now)
  case next(HomeModel.Next)

  static func make(_ c: LockModel.Context) -> NowOrNext {
    HomeModel.now(c).map(NowOrNext.now) ?? .next(HomeModel.next(c))
  }
}

private struct NowCard: View {
  let m: HomeModel.Now
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HomeKicker(text: "Now", mark: ink)
      Text(m.title).font(.system(size: 14, weight: .heavy)).lineLimit(2).padding(.top, 6)
      Spacer(minLength: 0)
      Text(timerInterval: m.start...m.end, countsDown: true)
        .font(.custom(anton, size: 34, relativeTo: .largeTitle)).minimumScaleFactor(0.6).lineLimit(1)
        .monospacedDigit()
      ProgressView(timerInterval: m.start...m.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
        .progressViewStyle(.linear).tint(ink).padding(.top, 4)
      Text(m.foot).font(.system(size: 11, weight: .bold)).lineLimit(1).padding(.top, 5)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

private struct NextCard: View {
  let m: HomeModel.Next
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HomeKicker(text: m.kicker)
      Spacer(minLength: 0)
      Text(m.time).font(.custom(anton, size: 42, relativeTo: .largeTitle)).foregroundStyle(orange)
        .minimumScaleFactor(0.6).lineLimit(1)
      Text(m.title).font(.system(size: 14, weight: .heavy)).lineLimit(2).padding(.top, 2)
      Text(m.foot).font(.system(size: 11, weight: .bold)).opacity(0.7).lineLimit(1).padding(.top, 5)
        .modifier(Numeric())
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

struct NowWidgetView: View {
  let entry: HomeEntry<NowOrNext>
  var body: some View {
    switch entry.model {
    case .now(let m): NowCard(m: m).homeBackground(.hot).widgetURL(URL(string: "dialed://day"))
    case .next(let m): NextCard(m: m).homeBackground(.glass).widgetURL(URL(string: "dialed://day"))
    case nil: HomeFallback(text: entry.fallback ?? "").homeBackground(.glass).widgetURL(URL(string: "dialed://day"))
    }
  }
}

struct NowWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.home.now", provider: HomeProvider(make: NowOrNext.make)) { NowWidgetView(entry: $0) }
      .configurationDisplayName("Now")
      .description("The current block with a live countdown. Between blocks, what's next.")
      .supportedFamilies([.systemSmall])
  }
}

struct UpNextHomeView: View {
  let entry: HomeEntry<HomeModel.Next>
  var body: some View {
    Group {
      if let m = entry.model { NextCard(m: m) } else { HomeFallback(text: entry.fallback ?? "") }
    }
    .homeBackground(.glass)
    .widgetURL(URL(string: "dialed://day"))
  }
}

struct UpNextHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "dialed.home.next", provider: HomeProvider(make: HomeModel.next)) { UpNextHomeView(entry: $0) }
      .configurationDisplayName("Up next")
      .description("The next block, when it starts and how long it runs.")
      .supportedFamilies([.systemSmall])
  }
}

// MARK: Rundown (medium)

enum Rundown: Equatable {
  case today(HomeModel.RundownToday)
  case week(HomeModel.RundownWeek)

  static func make(_ week: Bool, meals: Bool) -> (LockModel.Context) -> Rundown {
    { c in week ? .week(HomeModel.rundownWeek(c)) : .today(HomeModel.rundownToday(c, meals: meals)) }
  }
}

private struct RundownTodayView: View {
  let m: HomeModel.RundownToday
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HomeKicker(text: m.kicker)
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(m.rows.enumerated()), id: \.offset) { _, r in
          HStack(spacing: 8) {
            Text(r.time).font(.custom(anton, size: 15)).foregroundStyle(orange).frame(width: 42, alignment: .leading)
            Swatch(dark: r.colorDark, light: r.colorLight)
            Text(r.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 4)
            Text(r.detail).font(.system(size: 12, weight: .semibold)).opacity(0.7).modifier(Numeric())
          }
          .padding(.vertical, 3).padding(.horizontal, r.current ? 6 : 0)
          .background(r.current ? orange.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 8))
          .padding(.horizontal, r.current ? -6 : 0)
        }
        if let e = m.empty {
          Text(e).font(.system(size: 15, weight: .heavy)).padding(.top, 8)
        }
      }
      .padding(.top, 4)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

private struct RundownWeekView: View {
  let m: HomeModel.RundownWeek
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HomeKicker(text: m.kicker)
      HStack(alignment: .bottom, spacing: 16) {
        HStack(alignment: .bottom, spacing: 6) {
          ForEach(0..<m.bars.count, id: \.self) { i in
            VStack(spacing: 4) {
              GeometryReader { g in
                VStack { Spacer(minLength: 0)
                  RoundedRectangle(cornerRadius: 4)
                    .fill(i == m.todayIndex ? orange : Color(hex: scheme == .dark ? "#3A2014" : "#EED8CA"))
                    .frame(height: g.size.height * m.bars[i])
                }
              }
              Text(m.letters[i]).font(.system(size: 10, weight: .bold)).opacity(0.7)
            }
          }
        }
        .frame(maxWidth: .infinity)
        VStack(alignment: .leading, spacing: 2) {
          ForEach(Array(m.top.enumerated()), id: \.offset) { _, t in
            HStack(spacing: 8) {
              Swatch(dark: t.colorDark, light: t.colorLight)
              Text(t.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
              Spacer(minLength: 4)
              Text(t.hours).font(.system(size: 12, weight: .semibold)).opacity(0.7)
            }
            .padding(.vertical, 3)
          }
        }
        .frame(maxWidth: .infinity).padding(.bottom, 14)
      }
      .padding(.top, 8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

struct RundownView: View {
  let entry: HomeEntry<Rundown>
  var body: some View {
    switch entry.model {
    case .today(let m): RundownTodayView(m: m).homeBackground(.glass).widgetURL(URL(string: "dialed://day"))
    case .week(let m): RundownWeekView(m: m).homeBackground(.glass).widgetURL(URL(string: "dialed://week"))
    case nil: HomeFallback(text: entry.fallback ?? "").homeBackground(.glass).widgetURL(URL(string: "dialed://day"))
    }
  }
}

/// Configured in the widget editor on iOS 17+ (AppIntent); iOS 16.4 shows Today with meals and breaks.
struct RundownWidget: Widget {
  var body: some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return AppIntentConfiguration(kind: "dialed.home.rundown", intent: RundownIntent.self, provider: RundownIntentProvider()) {
        RundownView(entry: $0)
      }
      .configurationDisplayName("Rundown")
      .description("The rest of today, or your week by day and category.")
      .supportedFamilies([.systemMedium])
    } else {
      return StaticConfiguration(kind: "dialed.home.rundown", provider: HomeProvider(make: Rundown.make(false, meals: true))) {
        RundownView(entry: $0)
      }
      .configurationDisplayName("Rundown")
      .description("The rest of today.")
      .supportedFamilies([.systemMedium])
    }
  }
}

// MARK: Today timeline (large)

private struct TimelineCard: View {
  let m: HomeModel.Timeline
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HomeKicker(text: m.kicker)
      if let e = m.empty {
        Text(e).font(.system(size: 15, weight: .heavy)).padding(.top, 10)
      }
      GeometryReader { g in
        let h = g.size.height
        ZStack(alignment: .topLeading) {
          ForEach(Array(m.blocks.enumerated()), id: \.offset) { _, b in
            // A block's row never grows past its slot: a short one (a 15-minute break) keeps only its colour bar,
            // so its label can't sit on the next block's (step 10 contact sheet).
            let slot = max(3, b.height * h - 3)
            HStack(alignment: .top, spacing: 8) {
              Swatch(dark: b.colorDark, light: b.colorLight, width: 4, height: slot)
              if slot >= 16 {
                Text(b.time).font(.custom(anton, size: 14)).foregroundStyle(orange).frame(width: 40, alignment: .leading)
                Text(b.title).font(.system(size: 13, weight: .bold)).lineLimit(1)
              }
              Spacer(minLength: 0)
            }
            .frame(height: slot, alignment: .top)
            .clipped()
            .background(b.current ? orange.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 8))
            .opacity(b.past ? 0.45 : 1)
            .offset(y: b.top * h)
          }
          ZStack(alignment: .trailing) {
            Capsule().fill(orange).frame(height: 2)
            Text(m.nowLabel).font(.system(size: 10, weight: .heavy)).foregroundStyle(ink)
              .padding(.horizontal, 5).padding(.vertical, 1)
              .background(orange, in: RoundedRectangle(cornerRadius: 6))
          }
          .padding(.leading, -4)
          .offset(y: m.now * h - 1)
        }
      }
      .padding(.top, 10)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

struct TimelineHomeView: View {
  let entry: HomeEntry<HomeModel.Timeline>
  var body: some View {
    Group {
      if let m = entry.model { TimelineCard(m: m) } else { HomeFallback(text: entry.fallback ?? "") }
    }
    .homeBackground(.glass)
    .widgetURL(URL(string: "dialed://day"))
  }
}

/// Configured in the widget editor on iOS 17+ (Meals and breaks); iOS 16.4 includes them.
struct TimelineWidget: Widget {
  var body: some WidgetConfiguration {
    if #available(iOS 17.0, *) {
      return AppIntentConfiguration(kind: "dialed.home.timeline", intent: TimelineIntent.self, provider: TimelineIntentProvider()) {
        TimelineHomeView(entry: $0)
      }
      .configurationDisplayName("Today timeline")
      .description("The rest of today on a rail, with a now line.")
      .supportedFamilies([.systemLarge])
    } else {
      return StaticConfiguration(kind: "dialed.home.timeline", provider: HomeProvider { HomeModel.timeline($0, meals: true) }) {
        TimelineHomeView(entry: $0)
      }
      .configurationDisplayName("Today timeline")
      .description("The rest of today on a rail, with a now line.")
      .supportedFamilies([.systemLarge])
    }
  }
}
