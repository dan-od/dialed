# Source inventory

Hashes are SHA-256 of the files in this pack. Originals preserved; extracted behavior is evidence, not reusable code unless noted.

| ID | Source | SHA-256 | Kind | Authority | Coverage | Inspection method | Status and findings |
|---|---|---|---|---|---|---|---|
| REF-001 | `assets/references/dialed-flow-prototype.html` | 5a477674854b7e0971e0f483dd5f630ef16e1e319696626f9f7010e2584a9a52 | interactive prototype (HTML) | AUTHORITATIVE | required | runtime (Playwright walk of all 76 states, light/dark, 390×844 and 375×667), static read | Approved v8 (D-09); v9 adds the six D-35 screens (console group "New screens to approve") — awaiting owner approval. UI, states, motion, haptic intent, copy. Copy corrections: D-13 key copy; D-14 lock Customize sheet scope; widget slot rules are iOS-owned. |
| REF-002 | `assets/references/class-schedule-fall-2026.png` | adb9bb5411ca336b574f9888f115af2d98fe6fd902446f72ae7957f5f34e75ad | screen (owner timetable) | CONTENT_ONLY | required | visual | Owner's student-portal screenshot, 'Week of Sep 14'. Six class meetings: Advanced Networking I lecture Mon/Thu 9:40–11:00 SCI1140, tutorial Wed 2:10–3:30 SIR1350, laboratory Thu 2:10–5:00 SIR4150; Cryptography & Network Security (title truncated on screen) lecture Tue 8:10–11:00 SCI2120; Capstone Study Project lecture Wed 11:10–2:00 SCI1140. Expected extraction: backend/seed/fixtures/timetable/expected-classes.json. Seed + import fixture. |
| REF-003 | `assets/references/planning-guide-draft.md` | e4fc1cdb3412b0409d9c5cb49555c178d433a7902ff2f7a00bdebed15557335a | document | DIRECTIONAL | required | extraction | Productised into mcp/planning-guide.md (terms, quiet blocks, protected categories, provider-agnostic). |
| REF-004 | `assets/references/mcp-server-sketch.ts` | 9580f2f7edd53d28e55731dd6cee21a590753ce92fc5985e78783b2f61b9e804 | code (unrun) | BEHAVIOR_ONLY | contextual | static | Shape of MCP registration; superseded by mcp/tools.md contract. |
| REF-005 | `assets/references/first-schedule.html` | f80f7d221eac392ac4e19bf11b24ac639623659c83054bd95b95f26657f835cf | page | SUPERSEDED | contextual | visual | First static weekly schedule; routine content matches seed. |
| REF-006 | `assets/brand/dialed-logo-kit.zip` | 9c80b876cada17a25391d3754d4132a7e54b2519dc974eabf934dbbfecbf6dac | brand kit | AUTHORITATIVE | required | metadata, visual | Masters, lockups, web icons, presentation board, usage guide. |
| REF-007 | `assets/brand/dialed-icon-composer.zip` | ec268371c59d403a19a4a754081486f1be9855f1cfa3d0f396cb98b4b5daee5b | brand (Icon Composer layers) | AUTHORITATIVE | required | metadata | Two layers (knob, stem) + README for the Liquid Glass icon. |
| REF-008 | `assets/brand/app-icon/ios-light.svg` | 5a7c88c0223fe35819eca12bd3999aac1fb8e94854e3c2125084a33b743ee163 | icon | AUTHORITATIVE | required | visual | iOS light icon 1024 full-bleed. |
| REF-009 | `assets/brand/app-icon/ios-dark.svg` | 9686c6847f32a0f14a03dfa6257d489ad8f5cc273e758ee39827443afaab6578 | icon | AUTHORITATIVE | required | visual | iOS dark icon. |
| REF-010 | `assets/brand/app-icon/ios-tinted.svg` | 96feb8ebde52610b1c15a4d19169bb1741759d8dc73cc38bcac9956a48c0d8f6 | icon | AUTHORITATIVE | required | visual | iOS tinted icon. |
| REF-011 | `assets/brand/dialed-symbol.svg` | 8067ed094d526b5a7ab63850dd80f55069c7ef6080bfb65650a9b7bf9fad20c7 | logo | AUTHORITATIVE | required | visual | Master d-knob symbol. |
| REF-012 | `assets/brand/dialed-symbol-icon.svg` | 2184212354dedca0032856ea9acbb09ee1a6c9450f91c1f2d9620a89df8910dd | logo | AUTHORITATIVE | required | visual | Small-size cut (fatter slot) for ≤40 px, widgets, LA. |
| REF-013 | `assets/brand/dialed-wordmark.svg` | 27869fee29e4f6649e4831b334515964a66b7c3a445ccbe15296a70019956399 | logo | AUTHORITATIVE | required | visual | Outlined Anton caps wordmark. |
| REF-014 | `assets/brand/ai-mark-paths.txt` | d757efd69743312a0eefe862678fb4e5c0d8403f30a6f11ebece13f56a9986ac | icon geometry | AUTHORITATIVE | required | static | AI mark: knob + clockwise arrow, 24-grid paths. |
| REF-015 | `assets/brand/liquid-glass-mockup.png` | f8ea257213aaf7b65d13b10e5b8ede89f0498f7c355c3fd59e74390a9172049f | mockup | DIRECTIONAL | contextual | visual | Liquid Glass appearances; real render comes from Icon Composer. |
| REF-016 | `assets/brand/dialed-horizontal.svg` | 6c87d52cc43031b28b4709158ab13f3e1558fe6d80e373f5763cdd6ca3aeb337 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-017 | `assets/brand/dialed-horizontal-color.svg` | cf7c240c6d724e6585f1105b3043caa030432b35c8cac6e0bd2691e99088ca77 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-018 | `assets/brand/dialed-horizontal-reversed.svg` | a3763f3d49a41c0463db3f0a7d8615817e87f9d8a23d32f392eb5524fbb40a83 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-019 | `assets/brand/dialed-stacked.svg` | 9860fa8ac1cc4cf051a5eff7b5d8173ccd51b5453a6c98aa704c75f7fb054f03 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-020 | `assets/brand/dialed-stacked-reversed.svg` | c59c5537b6b89383652aa8591bd9170de4eda66d9096c60c70f55f4380c4cfde | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-021 | `assets/brand/dialed-symbol-orange.svg` | 328e8c6097346844c0cd94af79f7903ce35561479b5fa5ea966d70358b365233 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-022 | `assets/brand/dialed-symbol-reversed.svg` | 1b86737b3da0af68aa98189bb4ab52041389593e1780db204d7801a8df1748cf | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-023 | `assets/brand/dialed-symbol-small.svg` | ea4236d348fe8258eafd705fdfa60ca6b81e555f28f8e0a18a1e8a3b00fd4715 | logo | AUTHORITATIVE | contextual | visual | Lockup / colour variant. |
| REF-024 | `claude.ai artifact WSWoK2XkP8UDFJDpxErVTE (design canvas)` | n/a (hosted artifact) | design boards | DIRECTIONAL | contextual | visual | Earlier day/week/month explorations; prototype supersedes. |
| REF-025 | `claude.ai artifact 3fi4y6P5ph4hzBihyev9GA (Logo Lab)` | n/a (hosted artifact) | design boards | SUPERSEDED | contextual | visual | Logo rounds; Dialed d-knob chosen. |

## Conversation decisions (authoritative, not files)
Owner instructions in the design conversation (2026-10-19/20) are recorded as LOCKED/APPROVED decisions in `00_Brief_Analysis.md`. Highlights: native iOS first; home-lab backend; any AI via MCP; work blocks → Live Activity, quiet blocks → line under date, Line-only option; widgets user-chosen; timetable from photo/screenshot/PDF/Word; notifications minimal.
