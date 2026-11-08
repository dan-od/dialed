import ActivityKit
import SwiftUI
import WidgetKit

// The work block's Live Activity (Flow 08): lock-screen card and Dynamic Island. Content from ActivityModel;
// the countdown and the current segment's fill run on system timers, so no per-minute pushes are needed.

private let anton = "Anton-Regular"
private let orange = Color(hex: "#FF5A1F")
private let ink = Color(hex: "#140A05")
private let cream = Color(hex: "#FFF1E8")

private extension BlockActivityAttributes.ContentState {
  var model: [ActivityModel.Next] { next.map { .init(title: $0.title, startsAt: $0.startsAt, durationMin: $0.durationMin) } }
}

private func card(_ a: BlockActivityAttributes, _ s: BlockActivityAttributes.ContentState) -> ActivityModel.Card {
  ActivityModel.card(title: a.title, startsAt: a.startsAt, endsAt: s.endsAt, next: s.model, timeZone: .current)
}

/// The small-cut mark: an orange tile with a dial notch (stand-in for the brand mark in the widget target).
private struct Mark: View {
  var size: CGFloat = 22
  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.28).fill(orange)
      Circle().trim(from: 0.1, to: 0.9).stroke(ink, style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round))
        .rotationEffect(.degrees(90)).frame(width: size * 0.5, height: size * 0.5)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

private struct Countdown: View {
  let start: Date
  let end: Date
  var size: CGFloat
  var body: some View {
    Text(timerInterval: start...end, countsDown: true)
      .font(.custom(anton, size: size, relativeTo: .largeTitle))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.6)
  }
}

private struct SegmentBar: View {
  let m: ActivityModel.Card
  let start: Date
  let end: Date
  var body: some View {
    GeometryReader { g in
      HStack(alignment: .top, spacing: 4) {
        ForEach(Array(m.segments.enumerated()), id: \.offset) { _, s in
          VStack(alignment: .leading, spacing: 3) {
            if s.current {
              ProgressView(timerInterval: start...end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear).tint(orange)
            } else {
              Capsule().fill(cream.opacity(0.22)).frame(height: 4)
            }
            Text(s.label ?? " ").font(.system(size: 10, weight: .bold)).lineLimit(1).opacity(s.current ? 0.9 : 0.6)
          }
          .frame(width: max(8, (g.size.width - 8) * s.fraction))
        }
      }
    }
    .frame(height: 22)
  }
}

struct BlockActivityLockView: View {
  let context: ActivityViewContext<BlockActivityAttributes>
  var body: some View {
    let m = card(context.attributes, context.state)
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Mark()
        Circle().fill(Color(hex: context.attributes.categoryColorHex)).frame(width: 7, height: 7)
        Text(m.headline).font(.system(size: 13, weight: .semibold)).opacity(0.8)
        Spacer()
      }
      HStack(alignment: .lastTextBaseline) {
        Text(m.title).font(.system(size: 17, weight: .heavy)).lineLimit(1)
        Spacer(minLength: 8)
        Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 34)
          .frame(maxWidth: 130, alignment: .trailing)
        Text("left").font(.system(size: 13, weight: .bold)).opacity(0.7)
      }
      SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
    }
    .foregroundStyle(cream)
    .padding(16)
    .activityBackgroundTint(Color(hex: "#140A05").opacity(0.92))
    .activitySystemActionForegroundColor(cream)
    .widgetURL(URL(string: "dialed://day"))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(m.accessibility)
  }
}

struct BlockActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BlockActivityAttributes.self) { context in
      BlockActivityLockView(context: context)
    } dynamicIsland: { context in
      let m = card(context.attributes, context.state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Mark(size: 20)
            Text(m.title).font(.system(size: 15, weight: .heavy)).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 24)
            .foregroundStyle(orange).frame(maxWidth: 90, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
            Text(m.thenShort).font(.system(size: 12, weight: .semibold)).opacity(0.75).lineLimit(1)
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(m.accessibility)
        }
      } compactLeading: {
        Mark(size: 18)
      } compactTrailing: {
        Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 15)
          .foregroundStyle(orange).frame(maxWidth: 52)
      } minimal: {
        Mark(size: 18)
      }
      .widgetURL(URL(string: "dialed://day"))
    }
  }
}
