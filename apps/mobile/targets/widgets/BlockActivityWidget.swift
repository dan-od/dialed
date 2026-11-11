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

/// The Dialed "d" brand mark — the real symbol drawn from the SVG path, cream on an orange tile.
private struct BrandMark: View {
  var size: CGFloat = 40
  private let viewBox: CGFloat = 256
  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.22, style: .continuous).fill(orange)
      // Path from dialed-symbol-reversed.svg (viewBox 0 0 256 256), scaled to fit.
      DialedDPath()
        .fill(cream)
        .frame(width: size * 0.72, height: size * 0.72)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// The "d" glyph from assets/brand/dialed-symbol-reversed.svg (even-odd fill, viewBox 256×256).
private struct DialedDPath: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 256
    var p = Path()
    // Outer: vertical bar + arc
    p.move(to: CGPoint(x: 161 * s, y: 30 * s))
    p.addLine(to: CGPoint(x: 197 * s, y: 30 * s))
    p.addLine(to: CGPoint(x: 197 * s, y: 216 * s))
    p.addLine(to: CGPoint(x: 161 * s, y: 216 * s))
    p.addLine(to: CGPoint(x: 161 * s, y: 205.24 * s))
    // Arc: 69-radius circle centered roughly at (161, 147)
    let cx: CGFloat = 124; let cy: CGFloat = 147; let r: CGFloat = 69
    p.addArc(center: CGPoint(x: cx * s, y: cy * s), radius: r * s,
             startAngle: .degrees(-30), endAngle: .degrees(-330), clockwise: true)
    p.addLine(to: CGPoint(x: 161 * s, y: 88.76 * s))
    p.closeSubpath()
    // Inner diamond/notch
    p.move(to: CGPoint(x: 133.9 * s, y: 159.73 * s))
    p.addLine(to: CGPoint(x: 159.36 * s, y: 134.27 * s))
    let nr: CGFloat = 16 * 0.707
    p.addArc(center: CGPoint(x: 148.045 * s, y: 122.955 * s), radius: nr * s,
             startAngle: .degrees(45), endAngle: .degrees(225), clockwise: true)
    p.addLine(to: CGPoint(x: 111.27 * s, y: 137.10 * s))
    p.addArc(center: CGPoint(x: 122.585 * s, y: 148.415 * s), radius: nr * s,
             startAngle: .degrees(225), endAngle: .degrees(45), clockwise: true)
    p.closeSubpath()
    return p.offsetBy(dx: rect.minX, dy: rect.minY)
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
  var body: some View {
    VStack(spacing: 4) {
      GeometryReader { g in
        HStack(spacing: 3) {
          ForEach(Array(m.segments.enumerated()), id: \.offset) { _, s in
            if s.current {
              ProgressView(timerInterval: start...end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear).tint(orange)
            } else {
              Capsule().fill(cream.opacity(0.22)).frame(height: 4)
            }
          }
        }
      }
      .frame(height: 4)
      HStack {
        // Next block info on the right; no percent (LA can't tick text without a push).
        Spacer()
        Text(m.nextShort ?? "").font(.system(size: 11, weight: .semibold)).opacity(0.65).lineLimit(1)
      }
    }
  }
}

struct BlockActivityLockView: View {
  let context: ActivityViewContext<BlockActivityAttributes>
  var body: some View {
    let m = card(context.attributes, context.state)
    HStack(alignment: .top, spacing: 10) {
      BrandMark(size: 40)
        .padding(.top, 2)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) {
          Circle().fill(Color(hex: context.attributes.categoryColorHex)).frame(width: 7, height: 7)
          Text(m.headline).font(.system(size: 13, weight: .semibold)).opacity(0.8)
        }
        Text(m.title).font(.system(size: 17, weight: .heavy)).lineLimit(1)
      }
      Spacer(minLength: 4)
      VStack(alignment: .trailing, spacing: 0) {
        Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 32)
          .foregroundStyle(orange)
          .frame(width: 80, alignment: .trailing)
        Text("left").font(.system(size: 12, weight: .bold)).opacity(0.7)
      }
    }
    .overlay(alignment: .bottom) {
      SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
        .padding(.top, 4)
    }
    .padding(.bottom, 26)
    .foregroundStyle(cream)
    .padding(16)
    .activityBackgroundTint(ink.opacity(0.92))
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
            BrandMark(size: 22)
            Text(m.title).font(.system(size: 15, weight: .heavy)).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 22)
            .foregroundStyle(orange).frame(width: 72, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          SegmentBar(m: m, start: context.attributes.startsAt, end: context.state.endsAt)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(m.accessibility)
        }
      } compactLeading: {
        BrandMark(size: 18)
      } compactTrailing: {
        Countdown(start: context.attributes.startsAt, end: context.state.endsAt, size: 14)
          .foregroundStyle(orange).frame(maxWidth: 52)
      } minimal: {
        BrandMark(size: 18)
      }
      .widgetURL(URL(string: "dialed://day"))
    }
  }
}
