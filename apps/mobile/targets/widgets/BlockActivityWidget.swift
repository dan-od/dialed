import ActivityKit
import SwiftUI
import WidgetKit

// The work block's Live Activity (Flow 08): lock-screen card and Dynamic Island. Content from ActivityModel;
// the countdown and the current segment's fill run on system timers, so no per-minute pushes are needed.

private let anton = "Anton-Regular"
private let orange = Color(hex: "#FF5A1F")
private let ink = Color(hex: "#140A05")
private let cream = Color(hex: "#FFF1E8")
private let muted = Color(hex: "#C9AE9F")
private let track = Color(hex: "#3A2014")

private extension BlockActivityAttributes.ContentState {
  var model: [ActivityModel.Next] { next.map { .init(title: $0.title, startsAt: $0.startsAt, durationMin: $0.durationMin) } }
}

private func card(_ a: BlockActivityAttributes, _ s: BlockActivityAttributes.ContentState) -> ActivityModel.Card {
  ActivityModel.card(title: a.title, startsAt: a.startsAt, endsAt: s.endsAt, next: s.model, timeZone: .current)
}

/// The dark "d" (assets/brand/dialed-symbol.svg, exported to the DialedSymbol imageset) on the orange tile.
private struct BrandTile: View {
  var size: CGFloat = 40
  var body: some View {
    RoundedRectangle(cornerRadius: size * 11 / 40, style: .continuous)
      .fill(orange)
      .frame(width: size, height: size)
      .overlay(Image("DialedSymbol").resizable().interpolation(.high).scaledToFit().frame(width: size * 0.7, height: size * 0.7))
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
      .multilineTextAlignment(.trailing)
      .lineLimit(1)
      .minimumScaleFactor(0.6)
  }
}

private struct SegmentBar: View {
  let m: ActivityModel.Card
  let start: Date
  let end: Date
  private let gap: CGFloat = 5
  private let height: CGFloat = 7
  var body: some View {
    GeometryReader { g in
      let usable = g.size.width - gap * CGFloat(max(0, m.segments.count - 1))
      HStack(spacing: gap) {
        ForEach(Array(m.segments.enumerated()), id: \.offset) { _, s in
          Group {
            if s.current {
              ProgressView(timerInterval: start...end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear)
                .tint(orange)
                .scaleEffect(x: 1, y: height / 4, anchor: .center)
                .background(orange.opacity(0.25))
            } else {
              track
            }
          }
          .frame(width: max(0, usable * s.fraction), height: height)
          .clipShape(Capsule())
        }
      }
    }
    .frame(height: height)
  }
}

private struct BottomRow: View {
  let m: ActivityModel.Card
  var body: some View {
    HStack(spacing: 8) {
      Text(m.title).lineLimit(1).layoutPriority(1)
      Spacer(minLength: 0)
      if let next = m.nextShort {
        Text(next).lineLimit(1).truncationMode(.tail)
      }
    }
    .font(.system(size: 11, weight: .bold))
    .foregroundStyle(muted)
  }
}

struct BlockActivityLockView: View {
  let context: ActivityViewContext<BlockActivityAttributes>
  var body: some View {
    let m = card(context.attributes, context.state)
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 10) {
        BrandTile(size: 40)
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Circle().fill(Color(hex: context.attributes.categoryColorHex)).frame(width: 8, height: 8)
            Text(m.headline).font(.system(size: 13, weight: .semibold)).foregroundStyle(muted).lineLimit(1)
          }
          Text(m.title).font(.system(size: 16, weight: .bold)).foregroundStyle(cream).lineLimit(1)
        }
        .layoutPriority(1)
        Spacer(minLength: 4)
        VStack(alignment: .trailing, spacing: 0) {
          Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 34)
            .foregroundStyle(orange)
            .frame(width: 92, alignment: .trailing)
          Text("left").font(.system(size: 11, weight: .bold)).foregroundStyle(muted)
        }
      }
      SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
        .padding(.top, 12)
      BottomRow(m: m)
        .padding(.top, 5)
    }
    .padding(14)
    .activityBackgroundTint(ink.opacity(0.9))
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
          HStack(spacing: 8) {
            BrandTile(size: 28)
            Text(m.title).font(.system(size: 15, weight: .bold)).foregroundStyle(cream).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 26)
            .foregroundStyle(orange).frame(width: 76, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 5) {
            SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
            BottomRow(m: m)
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(m.accessibility)
        }
      } compactLeading: {
        BrandTile(size: 20)
      } compactTrailing: {
        Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 15)
          .foregroundStyle(orange).frame(maxWidth: 52)
      } minimal: {
        BrandTile(size: 20)
      }
      .widgetURL(URL(string: "dialed://day"))
    }
  }
}
