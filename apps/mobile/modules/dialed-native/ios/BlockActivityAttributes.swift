// Canonical Live Activity shape: packages/contracts/src/liveActivity.ts (BACKEND_SETUP §8).
// This file is copied byte-for-byte to targets/widgets/BlockActivityAttributes.swift; a jest test keeps the
// two equal, because ActivityKit matches the app's and the widget's types by name and shape.
import ActivityKit
import Foundation

struct BlockActivityAttributes: ActivityAttributes {
  struct NextBlock: Codable, Hashable {
    var title: String
    var startsAt: Date
    var durationMin: Int
  }

  struct ContentState: Codable, Hashable {
    var endsAt: Date
    /// At most 2.
    var next: [NextBlock]
  }

  var blockKey: String
  var title: String
  var categoryColorHex: String
  var startsAt: Date
}
