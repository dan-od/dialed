# Surface coverage

Every prototype state (REF-001, `assets/references/dialed-flow-prototype.html` → review console pathway buttons) and every native-only surface has exactly one primary owner. Secondary use is listed separately and never counts as ownership. Open the prototype, use the right-hand console to jump to any state by its key.

| Source ID | Flow | Surface or role | Primary owner | Status | Evidence or rationale |
|---|---|---|---|---|---|
| REF-001#launch | Flow_01 | Launch screen — console “Start and sign in › Launch screen” | yes | assigned | prototype state `launch` |
| REF-001#welcome | Flow_01 | Welcome — console “Start and sign in › Welcome” | yes | assigned | prototype state `welcome` |
| REF-001#apple | Flow_01 | Sign in with Apple — console “Start and sign in › Sign in with Apple” | yes | assigned | prototype state `apple` |
| REF-001#signup | Flow_01 | Sign up — console “Start and sign in › Sign up” | yes | assigned | prototype state `signup` |
| REF-001#signup-invalid | Flow_01 | Sign up, fix these — console “Start and sign in › Sign up, fix these” | yes | assigned | prototype state `signup-invalid` |
| REF-001#signup-taken | Flow_01 | Email already has an account — console “Start and sign in › Email already used” | yes | assigned | prototype state `signup-taken` |
| REF-001#verify | Flow_01 | Enter the code — console “Start and sign in › Enter the code” | yes | assigned | prototype state `verify` |
| REF-001#signin | Flow_01 | Sign in — console “Start and sign in › Sign in” | yes | assigned | prototype state `signin` |
| REF-001#signin-wrong | Flow_01 | Wrong password — console “Start and sign in › Wrong password” | yes | assigned | prototype state `signin-wrong` |
| REF-001#signin-none | Flow_01 | No account for that email — console “Start and sign in › No account found” | yes | assigned | prototype state `signin-none` |
| REF-001#forgot | Flow_01 | Forgot password — console “Start and sign in › Forgot password” | yes | assigned | prototype state `forgot` |
| REF-001#forgot-sent | Flow_01 | Reset link sent — console “Start and sign in › Reset link sent” | yes | assigned | prototype state `forgot-sent` |
| REF-001#account | Flow_01 | Account — console “Start and sign in › Account sheet” | yes | assigned | prototype state `account` |
| REF-001#signout | Flow_01 | Sign out? — console “Start and sign in › Sign out?” | yes | assigned | prototype state `signout`; secondary: Flow_09 |
| REF-001#lockLive | Flow_08 | Lock screen, Live Activity — console “Lock screen and widgets › Live Activity (work block)” | yes | assigned | prototype state `lockLive` |
| REF-001#lockMeal | Flow_08 | Lock screen, meal or break — console “Lock screen and widgets › Meal: line under the date” | yes | assigned | prototype state `lockMeal` |
| REF-001#lock-lineonly | Flow_08 | Lock screen, line only — console “Lock screen and widgets › Line only, no Live Activity” | yes | assigned | prototype state `lock-lineonly` |
| REF-001#lockQuiet | Flow_08 | Lock screen, between blocks — console “Lock screen and widgets › Between blocks” | yes | assigned | prototype state `lockQuiet` |
| REF-001#home | Flow_08 | Home Screen widgets — console “Lock screen and widgets › Home Screen, Rundown today” | yes | assigned | prototype state `home` |
| REF-001#home-week | Flow_08 | Home Screen widgets — console “Lock screen and widgets › Rundown set to week” | yes | assigned | prototype state `home-week` |
| REF-001#homeEdit | Flow_08 | Pick home widgets — console “Lock screen and widgets › Pick home widgets” | yes | assigned | prototype state `homeEdit` |
| REF-001#home-all | Flow_08 | Home Screen widgets — console “Lock screen and widgets › All four home widgets” | yes | assigned | prototype state `home-all` |
| REF-001#lockEdit | Flow_08 | Pick lock-screen widgets — console “Lock screen and widgets › Pick lock widgets” | yes | assigned | prototype state `lockEdit` |
| REF-001#lock-one | Flow_08 | Lock screen, Live Activity — console “Lock screen and widgets › Lock, one widget” | yes | assigned | prototype state `lock-one` |
| REF-001#lock-three | Flow_08 | Lock screen, between blocks — console “Lock screen and widgets › Lock, three widgets” | yes | assigned | prototype state `lock-three` |
| REF-001#settings | Flow_09 | Settings — console “Settings › Settings” | yes | assigned | prototype state `settings` |
| REF-001#categories | Flow_09 | Categories — console “Settings › Categories” | yes | assigned | prototype state `categories` |
| REF-001#catEdit | Flow_09 | Edit category — console “Settings › Edit a category” | yes | assigned | prototype state `catEdit` |
| REF-001#catDelete | Flow_09 | Delete category — console “Settings › Delete a category” | yes | assigned | prototype state `catDelete` |
| REF-001#notifSettings | Flow_09 | Notification settings — console “Settings › Notifications” | yes | assigned | prototype state `notifSettings` |
| REF-001#terms | Flow_05 | Terms and dates — console “Settings › Terms and dates” | yes | assigned | prototype state `terms`; secondary: Flow_09 |
| REF-001#claudeSettings | Flow_06 | AI assistant settings — console “Settings › AI, Dialed server” | yes | assigned | prototype state `claudeSettings`; secondary: Flow_07 |
| REF-001#claude-own | Flow_06 | AI assistant settings — console “Settings › AI, own key (ChatGPT)” | yes | assigned | prototype state `claude-own` |
| REF-001#ai-everywhere | Flow_06 | Plan it, describe — console “Settings › App with ChatGPT chosen” | yes | assigned | prototype state `ai-everywhere`; secondary: Flow_07 |
| REF-001#claude-chat | Flow_07 | AI assistant settings — console “Settings › AI apps connected” | yes | assigned | prototype state `claude-chat` |
| REF-001#push-chat | Flow_07 | Plan sent from Claude chat — console “Settings › Plan sent from chat” | yes | assigned | prototype state `push-chat`; secondary: Flow_08 |
| REF-001#deleteacct | Flow_01 | Delete account? — console “Settings › Delete account?” | yes | assigned | prototype state `deleteacct`; secondary: Flow_09 |
| REF-001#blockEdit | Flow_04 | Edit one block — console “Edit, set up, sync › Edit one block” | yes | assigned | prototype state `blockEdit`; secondary: Flow_03 |
| REF-001#setup | Flow_03 | First run, set up your week — console “Edit, set up, sync › First run, set up” | yes | assigned | prototype state `setup`; secondary: Flow_02 (options), Flow_05, Flow_06 |
| REF-001#ttSource | Flow_02 | Where is your timetable? — console “Edit, set up, sync › Timetable source” | yes | assigned | prototype state `ttSource` |
| REF-001#filePick | Flow_02 | Pick a file — console “Edit, set up, sync › Pick a PDF or Word file” | yes | assigned | prototype state `filePick` |
| REF-001#photo | Flow_02 | Snap your timetable — console “Edit, set up, sync › Snap timetable” | yes | assigned | prototype state `photo` |
| REF-001#photoReview | Flow_02 | Check found classes — console “Edit, set up, sync › Check found classes” | yes | assigned | prototype state `photoReview` |
| REF-001#calDialog | Flow_02 | Calendar permission — console “Edit, set up, sync › Calendar permission” | yes | assigned | prototype state `calDialog` |
| REF-001#calImport | Flow_02 | Pick calendars — console “Edit, set up, sync › Pick calendars” | yes | assigned | prototype state `calImport` |
| REF-001#day-sync | Flow_03 | Day, syncing — console “Edit, set up, sync › Offline edits waiting” | yes | assigned | prototype state `day-sync`; secondary: shared sync |
| REF-001#day | Flow_03 | Day, in a block — console “Day › In a block” | yes | assigned | prototype state `day` |
| REF-001#day-free | Flow_03 | Day, between blocks — console “Day › Between blocks” | yes | assigned | prototype state `day-free` |
| REF-001#day-done | Flow_03 | Day, all done — console “Day › All done” | yes | assigned | prototype state `day-done` |
| REF-001#day-first | Flow_03 | First run, set up your week — console “Day › First use, no routine” | yes | assigned | prototype state `day-first`; secondary: Flow_02 |
| REF-001#day-offline | Flow_03 | Day, offline — console “Day › Offline” | yes | assigned | prototype state `day-offline` |
| REF-001#week | Flow_03 | Week, lanes — console “Week and month › Week lanes” | yes | assigned | prototype state `week` |
| REF-001#cards | Flow_03 | Week, day cards — console “Week and month › Day cards (Wed)” | yes | assigned | prototype state `cards` |
| REF-001#month | Flow_03 | Month, poster — console “Week and month › Month poster” | yes | assigned | prototype state `month` |
| REF-001#add | Flow_04 | Add a block — console “Add a block › Blank form” | yes | assigned | prototype state `add` |
| REF-001#add-invalid | Flow_04 | Add, fix these first — console “Add a block › With errors” | yes | assigned | prototype state `add-invalid` |
| REF-001#add-overlap | Flow_04 | Add, overlaps something — console “Add a block › Overlaps WellServices” | yes | assigned | prototype state `add-overlap` |
| REF-001#cat | Flow_04 | Category picker — console “Add a block › Category picker” | yes | assigned | prototype state `cat` |
| REF-001#cat-create | Flow_04 | Create a category — console “Add a block › Create a category” | yes | assigned | prototype state `cat-create` |
| REF-001#notifAsk | Flow_04 | Ask before the iPhone prompt — console “Add a block › Reminder permission ask” | yes | assigned | prototype state `notifAsk`; secondary: Flow_08 |
| REF-001#permHelp | Flow_04 | Turn reminders back on — console “Add a block › Reminders denied, recovery” | yes | assigned | prototype state `permHelp`; secondary: Flow_08 |
| REF-001#discard | Flow_04 | Discard changes? — console “Add a block › Discard unsaved block” | yes | assigned | prototype state `discard` |
| REF-001#routines | Flow_05 | Routines — console “Routines › Routine list” | yes | assigned | prototype state `routines` |
| REF-001#routineEdit | Flow_05 | Edit a routine — console “Routines › Edit Fall term” | yes | assigned | prototype state `routineEdit` |
| REF-001#applyRoutine | Flow_05 | Save the routine — console “Routines › Save routine” | yes | assigned | prototype state `applyRoutine` |
| REF-001#plan | Flow_06 | Plan it, describe — console “Plan it with Claude › Describe” | yes | assigned | prototype state `plan` |
| REF-001#plan-offline | Flow_06 | Plan it, offline — console “Plan it with Claude › Describe, offline” | yes | assigned | prototype state `plan-offline` |
| REF-001#planLoading | Flow_06 | Claude is drafting — console “Plan it with Claude › Drafting” | yes | assigned | prototype state `planLoading` |
| REF-001#review | Flow_06 | Review the plan — console “Plan it with Claude › Review and approve” | yes | assigned | prototype state `review` |
| REF-001#review-stale | Flow_06 | Plan out of date — console “Plan it with Claude › Plan out of date” | yes | assigned | prototype state `review-stale` |
| REF-001#planQuestion | Flow_06 | Claude asks first — console “Plan it with Claude › Claude asks first” | yes | assigned | prototype state `planQuestion` |
| REF-001#planError | Flow_06 | Claude could not answer — console “Plan it with Claude › Claude unavailable” | yes | assigned | prototype state `planError` |
| REF-001#planError-exhausted | Flow_06 | Still failing after retries — console “Plan it with Claude › Failed three times” | yes | assigned | prototype state `planError-exhausted` |
| REF-001#planDone | Flow_06 | Plan approved — console “Plan it with Claude › Approved” | yes | assigned | prototype state `planDone` |
| REF-001#push-reminder | Flow_08 | Heads-up reminder — console “Notifications › Gym in 10 minutes” | yes | assigned | prototype state `push-reminder`; secondary: Flow_03 |
| REF-001#push-plan | Flow_06 | Plan ready while away — console “Notifications › Plan ready while away” | yes | assigned | prototype state `push-plan`; secondary: Flow_08 |
| NAT-01 | Flow_01 | Native Sign in with Apple system sheet (replaces drawn sheet `apple`) | yes | assigned | native platform surface |
| NAT-02 | Flow_02 | Reading your classes (`photoRead`, transient state between photo and review) | yes | assigned | native platform surface |
| NAT-03 | Flow_02 | iOS Files picker / Photos picker / camera (system UI) | yes | assigned | native platform surface |
| NAT-04 | Flow_08 | Dynamic Island compact, minimal and expanded presentations of the Live Activity | yes | assigned | native platform surface |
| NAT-05 | Flow_08 | iOS lock-screen and home-screen widget editors (system UI; Dialed widget gallery entries + configuration intent for Rundown) | yes | assigned | native platform surface |
| NAT-06 | Flow_07 | OAuth sign-in + consent web page for connecting an AI app (`/oauth/authorize`) — NOT in prototype; needs flow-prototype approval before production (stop point) | yes | assigned | native platform surface |
| NAT-07 | Flow_01 | Password-reset landing: in-app "New password" page + web fallback page if the app is missing — NOT in prototype; **needs flow-prototype approval** (D-35) | yes | assigned | native platform surface |
| NAT-08 | Flow_09 | iOS share sheet for data export (system UI) | yes | assigned | native platform surface |
| NAT-09 | Flow_04 | iOS notification permission system alert (drawn as `iosDialog` inside the add flow) | yes | assigned | native platform surface |
| NAT-10 | Flow_06 | Siri dictation via keyboard mic in the describe box (system UI, no custom surface) | yes | assigned | native platform surface |
| REF-002 | Flow_02 | Owner class schedule screenshot (`class-schedule-fall-2026.png`) — timetable import fixture and seed check | yes | assigned | see 00_Source_Inventory.md |
| REF-003 | Flow_07 | Planning guide draft → productised as `mcp/planning-guide.md` (secondary: Flow_06 in-app engine) | yes | assigned | see 00_Source_Inventory.md |
| REF-004 | Flow_07 | MCP server sketch (behavioral evidence only) | yes | assigned | see 00_Source_Inventory.md |
| REF-005 | Flow_03 | First static schedule page (superseded; content only) | yes | assigned | see 00_Source_Inventory.md |
| REF-006 | shared-foundation | assets/brand/dialed-logo-kit.zip — brand asset (brand kit) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-007 | shared-foundation | assets/brand/dialed-icon-composer.zip — brand asset (brand (Icon Composer layers)) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-008 | shared-foundation | assets/brand/app-icon/ios-light.svg — brand asset (icon) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-009 | shared-foundation | assets/brand/app-icon/ios-dark.svg — brand asset (icon) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-010 | shared-foundation | assets/brand/app-icon/ios-tinted.svg — brand asset (icon) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-011 | shared-foundation | assets/brand/dialed-symbol.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-012 | Flow_08 | assets/brand/dialed-symbol-icon.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-013 | shared-foundation | assets/brand/dialed-wordmark.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-014 | shared-foundation | assets/brand/ai-mark-paths.txt — brand asset (icon geometry) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-015 | shared-foundation | assets/brand/liquid-glass-mockup.png — brand asset (mockup) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-016 | shared-foundation | assets/brand/dialed-horizontal.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-017 | shared-foundation | assets/brand/dialed-horizontal-color.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-018 | shared-foundation | assets/brand/dialed-horizontal-reversed.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-019 | shared-foundation | assets/brand/dialed-stacked.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-020 | shared-foundation | assets/brand/dialed-stacked-reversed.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-021 | shared-foundation | assets/brand/dialed-symbol-orange.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-022 | shared-foundation | assets/brand/dialed-symbol-reversed.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| REF-023 | shared-foundation | assets/brand/dialed-symbol-small.svg — brand asset (logo) | yes | assigned | design-system global contract; used by app icon, launch, widgets |
| NAT-11 | Flow_05 | "Name your term" mini-sheet before the first routine (Build it myself / imports with no term) — NOT in prototype; **needs flow-prototype approval** (D-35) | yes | assigned | native surface added by C-0205 |
| NAT-12 | Flow_09 | Quiet switch on Edit category — NOT in prototype; **needs flow-prototype approval** (D-35) | yes | assigned | added for D-07/D-34 |
| NAT-13 | Flow_06 | "Get told when plans are ready?" permission ask after the first plan — NOT in prototype; **needs flow-prototype approval** (D-35) | yes | assigned | Sub_Interactions/Flow_06 |
| NAT-14 | Flow_07 | Disconnect-all confirm dialog — NOT in prototype; **needs flow-prototype approval** (D-35) | yes | assigned | Sub_Interactions/Flow_07 |

Totals: 76 prototype states (+9 v9 states for the six D-35 screens, console group "New screens to approve": oauth-signin, oauth-consent, oauth-done, newPw, newPw-expired, nameTerm, catQuiet, planNotif, disconnectall — owned by NAT-06, NAT-06, NAT-06, NAT-07, NAT-07, NAT-11, NAT-12, NAT-13, NAT-14), 14 native surfaces (6 prototyped in v9, awaiting approval per D-35), 22 other sources (112 rows). Every row has exactly one primary owner.
