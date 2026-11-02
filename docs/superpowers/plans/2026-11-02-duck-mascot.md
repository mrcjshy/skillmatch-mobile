# Pateros duck mascot

Owner direction: replace the old mascot with an original soft 3D duck representing Pateros. Extend expressive motion across user greetings, empty states, full-screen system states, success and cancellation. Preserve existing controls, skeleton loading, role routing and business behavior.

Character: cream clay duck, amber bill and webbed feet, cobalt scarf. Nine poses in a single opaque white atlas on a white illustration stage; no reliance on unreliable generated transparency. Original art produced with the built-in image generation tool. Archive toolkit inspected as reference data only; no installer, scripts, dependencies or remote API calls from it were executed.

Motion: two wing poses for an actual wave, brief blinks, bounded breathing, one celebratory hop, gentle concern. Central motion tokens and live reduced-motion preference. Stop timers and transforms when inactive/backgrounded/unmounted. No animation gates an action. Optional navigation context pauses retained routes on blur; bootstrap artwork remains safe outside a navigator.

Scope: shared Client/Worker Home header; shared empty states and whole-screen system states; existing success and cancellation placements. Compact errors and skeletons retain their current presentation. No mascot on cancelled-history cards. No commit, push, hosted deployment, package installation or schema change.

Validation: behavior tests for expression timing and cleanup; shared component composition tests; complete existing suite, TypeScript and targeted lint; fresh local QA package including new asset; Android read-only interaction and motion capture; finish review and scoped documentation.

## Scoped closeout — 2026-11-02

Implemented the approved original Pateros duck replacement in the existing native system: Worker/Client Home greeting, shared empty/full-screen states, existing success placement and live cancellation sheet. The existing palette, native typography, role navigation, controls, skeletons and cancellation business behavior remain the incumbent authority. `DESIGN.md` and `.impeccable/design.json` now record observed shared tokens and actual mascot behavior; the sidecar's synthesized tonal strips and browser primitive previews are documentation aids, not new native tokens or implementation.

The original 1254-by-1254, three-by-three opaque atlas is `assets/images/mascot/pateros-duck-poses.png`. The adjacent `pateros-duck-poses.provenance.json` retains the built-in image-generation prompt, pose order, material description and SHA-256 `0f485ea5179dc66fffec3eb3f953d8bebdee67f40f1fd74aab202f911c70a6be`. Archive material informed material/motion reference only; no archive installer/runtime was executed. Artwork uses an intentional white circular stage. Production source uses the normal bundled `require`; no dependency or configuration change was needed.

Final motion begins after image readiness and only while the mascot is active, foregrounded and route-focused. Optional navigation context supports bootstrap states outside a navigator. Finite wing changes, blinks, breathing, tilt and one celebration hop reset on blur, background, hiding, unmount or live reduced-motion preference. No control waits for animation. The lifecycle/source tests cover these paths; device-level live reduced-motion behavior remains unverified.

Final source gates, as reported by the implementation orchestrator: 175 test files / 3,079 tests passed; TypeScript and targeted ESLint passed. Final native read-only Home/Bookings/navigation e2e passed (`duck-mascot-20261102/.e2e-final/report.json`). `.impeccable/review/duck-native-evidence.json` identifies the Worker account, emulator and retained limits. Final Home, Bookings, 130% font and high/low wing captures are valid 1080-by-2400 evidence. `duck-wave-09.png` and `duck-wave-10.png` show alternating wings; `duck-wave-08.png` shows settling, with `duck-greeting-final.mp4` retaining the motion capture. System font scale was restored to 1.0 after the 1.3 check.

Final local QA package directory: `C:/Users/JOSH/Documents/SkillMatch-Two-Phone-QA-20261028/rc3-20261030-v1/preview/203133-duck-ready-20261102`. Emulator APK SHA-256: `f247efcdbc84a2103ecd89ab3d571612d82dc59cd7bb836be5202db342f10eb7`. Phone-preview APK SHA-256: `94230e0c4a4b513c7b48941c5f3eb98c51f8c1e19b9076db2b132ffa2d331c4a`. Local preview packaging binds the Metro image module to `asset:/skillmatch/pateros-duck-poses.png`; the real APK asset was verified. The emulator-only preview uses `extractNativeLibs=true`; this is not a production configuration change or physical-device verification.

Finish reviewer verdict: **SHIP for the scored hidden-route playback fix only**, with no remaining material fix from that review. The reviewer accepted focus/foreground/visibility/image-readiness gating and lifecycle cleanup, and found no visible regressions from that fix in the final Worker Home/Bookings/font and wing evidence. This does not approve the whole surface, Client native flows, cancellation runtime or motion performance.

Retained evidence limits: the current Worker account had no active booking, so the new duck was not observed in live cancellation; no hosted fixture or cancellation write was created. Cancellation composition/unit paths were covered. Client native, physical-device behavior, motion smoothness and live device reduced-motion settings remain unproven. The inherited system display face is recorded as retained incumbent treatment, not canonized as a new brand display rule. No prior cancellation document was changed, and no commit, push or hosted deployment was performed.

Documentation validation: schema-v2 sidecar JSON parses; the eight canonical DESIGN sections retain their order; all frontmatter references resolve; 17 color metadata entries have eight-step preview ramps; 10 self-contained primitive previews and three named rules are present and consistent with the recorded source. No external schema validator was run.


## Owner follow-up: transparent artwork and Post job footer

The owner requested removal of the duck's white background and explicitly approved local Python removal after the image editor produced edge artifacts. The existing nine-pose artwork was cut out locally without regenerating the character. All nine cell borders are transparent, with 1,001,643 fully transparent and 548,363 fully opaque pixels; opaque subject RGB samples match the original. Light/dark composites were inspected. The shared mascot wrapper no longer draws a white fill or circular badge. Original source and removal script/evidence remain in `Documents/SkillMatch-Two-Phone-QA-20261028/duck-background-removal-20261102`; asset provenance and current DESIGN guidance were updated.

The owner also requested removing the duplicate budget beside Post job. The Client review summary retains its Budget fact row; the pinned footer now contains the existing full-width posting action and any submission error. Posting authority, validation, loading/disabled behavior and safe-area layout were retained.

Focused mascot/motion tests passed 17 checks; Client posting, structural and mascot checks passed 77 checks. TypeScript, targeted ESLint, PNG/provenance verification and diff checks passed. No additional full-suite claim is made for this narrow follow-up.

Combined local preview: `rc3-20261030-v1/preview/204800-duck-clear-post-footer-20261102`. Native Client Home capture: `.impeccable/review/duck-transparent-home-client.png`. The existing QA session had changed to Client by this capture; no account was switched by the agent. Client footer is verified by the source/component checks; it was not opened in this native capture. No job was posted, no hosted fixture was created, and no commit/push/deployment occurred. Emulator APK SHA256: `6d12967ba25d266afc57b6b5c34761074f46f476002ff27e608f67cc421c760e`.


## Owner follow-up: remove mascot from greeting headers

The owner identified the duck beside the greeting/name/date and requested its removal for all users. `HomeStickyHeader` now renders no mascot for any role or greeting state. Existing name/date, time-of-day glyph, notification bell, safe-area handling and role controls remain. Current design guidance was updated. Existing focused header/navigation checks passed 46 tests; TypeScript, targeted ESLint and native preview verification are recorded with the final capture. No hosted data or Git publication is part of this change.

Final local preview: `211212-no-header-mascot-20261102`, emulator APK SHA256 `39848ed3b47bb6fdb37ec5ccdc8afd6dfa0c2f322a76e10fb32db01f64ea40d6`. Native capture: `.impeccable/review/home-header-without-mascot.png`. TypeScript, targeted ESLint and diff checks passed; no commit or push.


## GitHub save point authorization

The owner explicitly requested pushing the latest changes to GitHub. The publication target is the existing `checkpoint/mobile-rc3-20261030` branch in `mrcjshy/skillmatch-mobile`; this is a source save point, with no main-branch integration or hosted Supabase operation. Fresh pre-commit verification passed 175 files / 3,079 tests, TypeScript, changed-file ESLint, source/QA byte matching and diff checks. Runtime screenshots, recordings and device logs remain local QA evidence; the commit carries source, original artwork/provenance, tests, design guidance and written scope/evidence notes.
