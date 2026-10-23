# Design v11 — before / after (owner review 2026-10-23)

Device: iPhone 17e Simulator (iOS 27.0) unless noted; auth shots on iPhone SE (3rd gen). Dev clock "today
1:15 pm" (Fri 23 Oct 2026). Re-run: `ONLY=auth|app|offline|perm ./scripts/design_v11_evidence` (see the script
header for what each needs), then `scripts/dev_evidence_cleanup`.

| What changed (decision) | Before | After |
|---|---|---|
| Field problems are the field's error line with an orange link (D-45) | `before-taken-*`, `before-none-*` (stamp boxes under the form) | `after-taken-*` ("This email already has an account. **Sign in instead**"), `after-none-*` ("Nobody has signed up with this email. **Make an account**") |
| Fit strip under the times in Add (D-48) | `before-add-blank-*` (capsule times, no strip), `before-add-overlap-*` (Overlap stamp) | `after-add-blank-*` ("Free 10:00 pm to 12:00 am"), `after-add-overlap-*` (hatched clash, "Overlaps Prayers by 60 min", dashed next free slot, Keep both), `after-add-keep-*` ("Sharing time with Prayers", Add anyway) |
| Plain time fields; the native wheel opens under the pair (D-49) | `before-add-blank-*` (grey iOS capsules) | `after-add-wheel-*` |
| Fit strip in Edit and Move (D-48, beyond v11 by owner direction) | `before-edit-*` (no strip) | `after-edit-*` ("Free 3:30 pm to 5:00 pm"), `after-move-clash-*` (Saturday already has Gym: clash + dashed 5:15 pm) |
| Large detent for Add / Edit / Category (D-47) | 0.93 detent (Day visible above) in every `before-add-*`/`before-edit-*` | full height in every `after-add-*`/`after-edit-*` |
| Wrapped titles never clip (D-54) | `before-cards-*` | `after-cards-*` (Tuesday: "Speedwatch Ontario", "Networking assignments" on two lines) |
| Terms: plain date fields, full-width wheel, inline messages (D-45, D-49) | `before-terms-*` (capsule dates, "No term" stamp), `before-terms-overlap-dark` (Overlap stamp) | `after-terms-*` (**Dec 23 – Jan 4** has no term…), `after-terms-overlap-*` (**Overlaps Exam weeks.** Days in both use Fall term.) |
| Offline pill + one muted line (D-46) | `before-day-offline-*`, `before-day-offline-queued-dark`, `before-add-offline-dark`, `before-routine-offline-dark` | `after-day-offline-*` (pill under the date: "Offline", then "Showing what's saved on this phone."), `after-day-offline-queued-light`, `after-add-offline-light`, `after-routine-offline-light` ("Offline · N to sync" + one line). The queued edit in `offline_1` is the theme button, so these three are light. |
| Settings problem inline under the setting (D-45) | `before-reminders-off-dark` | see "Not captured" below |

Also covered in Flow 04/05 runs after the change: `e2e/add_invalid_overlap.yaml` (strip + Add anyway + end before
start), `e2e/move_block.yaml` (Move through the strip's dashed slot → Saturday), `e2e/term_dates.yaml` (wheel →
Dec 18 saved once on close).

## Not captured as after-shots (and why)
- Reminders off (inline under Push alert): needs a fresh install with notifications denied (`ONLY=perm`).
