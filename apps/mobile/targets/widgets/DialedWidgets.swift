import SwiftUI
import WidgetKit

/// Flow 08 widget bundle: the line under the date (step 4), the lock widgets (step 5) and the home widgets
/// (step 6) and the work block's Live Activity (step 8).
@main
struct DialedWidgets: WidgetBundle {
  var body: some Widget {
    LineWidget()
    CountdownWidget()
    DayRingWidget()
    UpNextWidget()
    TodayWidget()
    WeekWidget()
    NowWidget()
    UpNextHomeWidget()
    RundownWidget()
    TimelineWidget()
    BlockActivityWidget()
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
