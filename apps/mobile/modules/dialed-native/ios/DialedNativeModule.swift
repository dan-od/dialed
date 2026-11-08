import ActivityKit
import ExpoModulesCore
import WidgetKit

struct NextBlockRecord: Record {
  @Field var title: String = ""
  @Field var startsAt: String = ""
  @Field var durationMin: Int = 0
}

struct ActivityAttributesRecord: Record {
  @Field var blockKey: String = ""
  @Field var title: String = ""
  @Field var categoryColorHex: String = ""
  @Field var startsAt: String = ""
}

struct ActivityStateRecord: Record {
  @Field var endsAt: String = ""
  @Field var next: [NextBlockRecord] = []
}

enum DialedNativeError: Error, CustomStringConvertible {
  case badDate(String)
  case activitiesOff
  var description: String {
    switch self {
    case .badDate(let s): return "Not an ISO date: \(s)"
    case .activitiesOff: return "Live Activities are off for this app"
    }
  }
}

private func isoDate(_ s: String) throws -> Date {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let d = f.date(from: s) { return d }
  f.formatOptions = [.withInternetDateTime]
  if let d = f.date(from: s) { return d }
  throw DialedNativeError.badDate(s)
}

private func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

private func contentState(_ r: ActivityStateRecord) throws -> BlockActivityAttributes.ContentState {
  BlockActivityAttributes.ContentState(
    endsAt: try isoDate(r.endsAt),
    next: try r.next.prefix(2).map {
      BlockActivityAttributes.NextBlock(
        title: $0.title, startsAt: try isoDate($0.startsAt), durationMin: $0.durationMin)
    })
}

private func activity(_ blockKey: String) -> Activity<BlockActivityAttributes>? {
  Activity<BlockActivityAttributes>.activities.first { $0.attributes.blockKey == blockKey }
}

private func stateName(_ s: ActivityState) -> String {
  switch s {
  case .active: return "active"
  case .ended: return "ended"
  case .dismissed: return "dismissed"
  case .stale: return "stale"
  default: return "unknown"  // .pending (newer SDKs) and future states
  }
}

private func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }

/// Flow 08 bridge (BACKEND_SETUP §1): widget snapshot, timeline reloads and Live Activities. Nothing here
/// writes schedule data (D-06); the App Group only ever holds `snapshot.json`.
public class DialedNativeModule: Module {
  /// Observation tasks (token and state streams) while JS listens; cancelled when it stops.
  private var tasks: [Task<Void, Never>] = []
  private var watched = Set<String>()

  /// Per-activity token and state streams: JS reports tokens to the server (step 7) and remembers dismissals.
  private func watch(_ a: Activity<BlockActivityAttributes>) {
    guard !watched.contains(a.id) else { return }
    watched.insert(a.id)
    let key = a.attributes.blockKey
    tasks.append(Task { [weak self] in
      for await t in a.pushTokenUpdates {
        self?.sendEvent("onActivityToken", ["blockKey": key, "token": hex(t)])
      }
    })
    tasks.append(Task { [weak self] in
      for await st in a.activityStateUpdates {
        self?.sendEvent("onActivityState", ["blockKey": key, "state": stateName(st)])
      }
    })
  }

  private func startObserving() {
    if #available(iOS 17.2, *) {
      tasks.append(Task { [weak self] in
        for await t in Activity<BlockActivityAttributes>.pushToStartTokenUpdates {
          self?.sendEvent("onPushToStartToken", ["token": hex(t)])
        }
      })
    }
    // Activities started by a push-to-start arrive here too.
    tasks.append(Task { [weak self] in
      for await a in Activity<BlockActivityAttributes>.activityUpdates { self?.watch(a) }
    })
    Activity<BlockActivityAttributes>.activities.forEach(watch)
  }

  private func stopObserving() {
    tasks.forEach { $0.cancel() }
    tasks = []
    watched = []
  }

  public func definition() -> ModuleDefinition {
    Name("DialedNative")

    Events("onPushToStartToken", "onActivityToken", "onActivityState")
    OnStartObserving { self.startObserving() }
    OnStopObserving { self.stopObserving() }

    /// Activities iOS still holds for this app: block key, state and end (ISO).
    Function("runningActivities") { () -> [[String: String]] in
      Activity<BlockActivityAttributes>.activities.map {
        ["blockKey": $0.attributes.blockKey, "state": stateName($0.activityState), "endsAt": iso($0.content.state.endsAt)]
      }
    }

    AsyncFunction("writeSnapshot") { (json: String) in
      try SnapshotStore.write(json)
    }

    AsyncFunction("clearSnapshot") {
      try SnapshotStore.clear()
    }

    AsyncFunction("reloadTimelines") {
      WidgetCenter.shared.reloadAllTimelines()
    }

    /// "Live Activities are off in iPhone Settings" (Customize page state).
    Function("activitiesEnabled") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Starts a Live Activity for a work block; returns its id. `localOnly` (free account, D-80): no push token,
    /// and the activity is ended at once with a dismissal at block end so it leaves on time without a push.
    AsyncFunction("startActivity") {
      (attrs: ActivityAttributesRecord, state: ActivityStateRecord, localOnly: Bool) -> String in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw DialedNativeError.activitiesOff }
      if let existing = activity(attrs.blockKey) { return existing.id }
      let attributes = BlockActivityAttributes(
        blockKey: attrs.blockKey, title: attrs.title, categoryColorHex: attrs.categoryColorHex,
        startsAt: try isoDate(attrs.startsAt))
      let s = try contentState(state)
      let a = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: s, staleDate: s.endsAt),
        pushType: localOnly ? nil : .token)
      if localOnly {
        await a.end(ActivityContent(state: s, staleDate: s.endsAt), dismissalPolicy: .after(s.endsAt))
      } else if !self.tasks.isEmpty {
        self.watch(a)
      }
      return a.id
    }

    AsyncFunction("updateActivity") { (blockKey: String, state: ActivityStateRecord) in
      guard let a = activity(blockKey) else { return }
      let s = try contentState(state)
      await a.update(ActivityContent(state: s, staleDate: s.endsAt))
    }

    /// Ends the block's activity: at `dismissalDate` (ISO) if given, else at once.
    AsyncFunction("endActivity") { (blockKey: String, dismissalDate: String?) in
      guard let a = activity(blockKey) else { return }
      let policy: ActivityUIDismissalPolicy =
        try dismissalDate.map { .after(try isoDate($0)) } ?? .immediate
      await a.end(nil, dismissalPolicy: policy)
    }

    /// Sign-out and Line only: end every activity now.
    AsyncFunction("endAllActivities") {
      for a in Activity<BlockActivityAttributes>.activities {
        await a.end(nil, dismissalPolicy: .immediate)
      }
    }

    /// Push-to-start token (iOS 17.2+, D-12), hex; nil before iOS sends one or on older iOS.
    AsyncFunction("getPushToStartToken") { () -> String? in
      if #available(iOS 17.2, *) {
        return Activity<BlockActivityAttributes>.pushToStartToken.map(hex)
      }
      return nil
    }

    AsyncFunction("getActivityPushToken") { (blockKey: String) -> String? in
      activity(blockKey)?.pushToken.map(hex)
    }
  }
}
