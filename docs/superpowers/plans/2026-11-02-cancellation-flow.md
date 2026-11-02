# Cancellation flow implementation plan

**Goal:** Replace native job and booking cancellation alerts with the existing branded sheet system, for Client and Worker.

**Scope:** The owner's screenshot and November 2 request; mascot appears only within cancellation flows, as confirmed. History cards, server rules, payment gates and completion controls stay outside this visual change.

**Architecture:** A shared `CancellationSheet` composes `AppSheet`, existing buttons/notices and a decorative mascot wrapper. Posted-job withdrawal keeps its exact ownership/status-filtered delete. Booking cancellation keeps reason validation and the published RPC, adding reason/review steps inside one sheet. Errors retain the draft; pending requests prevent duplicate submission or dismissal.

**Visual direction:** Existing warm canvas, cobalt accent, rounded sheet, large clear action labels, full-width reason rows. Keep is the safe filled action; final cancellation is explicitly named and red. The mascot settles once rather than looping; reduced motion renders it still. React Native Motion's Reanimated 4 examples inform motion composition; no dependency installation is needed.

## Tasks

- [x] Extend behavioral tests before implementation: safe dismissal, explicit review, both roles, validation, single-flight submission, retained draft on error, and successful cancellation with failed refresh.
- [x] Add shared cancellation sheet and a dedicated animated mascot wrapper, preserving the static mascot everywhere else.
- [x] Replace open-job native alert and booking reason/native-review dialogs; preserve all backend call arguments and authority checks.
- [x] Run focused tests, complete QA-source suite, TypeScript and targeted lint using existing installed dependencies.
- [x] Mirror changed source to the existing QA candidate and build/install an emulator-compatible local preview. Inspect Worker booking reason/review natively and inspect Client open-job/booking paths in source and behavioral tests, without committing a real cancellation. Client native presentation remains unverified.

## Review focus

- Keep, Back, scrim and Close never submit cancellation.
- Neither double taps nor pending dismissal can race a submitted cancellation.
- Other requires nonblank detail; details survive a refused request.
- A committed cancellation followed by a failed refresh is never presented as a failed cancellation.
- Text scaling, keyboard clearance and reduced motion remain usable; no business writes are needed for visual review.

No commit, push, hosted deployment or worktree operation is authorized by this plan.

## Current verification

- Existing QA candidate: 173 test files, 3,074 tests passing. TypeScript and targeted ESLint pass.
- The two initial native test assumptions expected Client Home; the existing QA session is Worker. The corrected native check uses that existing Worker account and never presses final cancellation.
- Emulator preview: `Documents/SkillMatch-Two-Phone-QA-20261028/rc3-20261030-v1/preview/154603-cancellation-ui-20261102/SkillMatch-QA-Cancellation-emulator.apk`. Native-library extraction is enabled only in the emulator package; application code equals the phone preview.

## Incumbent conformance and evidence closeout — 2026-11-02

This is a scoped extension of the incumbent native system (`SCOPED_EXISTING_ALLOWED`), not a new visual world or global system change. The existing `SkillMatchTheme.ui` remains authoritative. No `PRODUCT.md`, `DESIGN.md` or design sidecar was created; their absence pre-existed this task.

- Palette: the implementation consumes the existing cobalt accent (`#1C3AA6`), warm canvas (`#F7F6F3`), white raised surface and semantic error (`#B3261E`); red remains a destructive/status treatment.
- Type: Android platform Roboto is retained through the theme. The sheet uses screen title 22/28 at 700, body 16/24 at 400, reason labels 16/24 at 600, helper 14/20 and caption 12/16; button labels retain the incumbent button variants.
- Layout and shape: `AppSheet` retains 24dp top corners, a scrollable body, pinned footer and safe-area padding. Reason controls use existing 12dp control corners and 48dp minimum targets; the review inset uses the existing 16dp card radius. Source handles keyboard clearance and scalable text, without native verification of those states.
- Action hierarchy: booking reason selection advances to review; final review exposes an explicitly named red cancellation action and filled cobalt Keep action. The initial reason step uses a primary Review action and ghost Keep action. Client open-job withdrawal reuses the same sheet and existing ownership/status-filtered delete; booking cancellation retains validated reason arguments and the published RPC.
- Motion: the existing 64dp decorative mascot gains only a cancellation wrapper: 8dp rise and bounded 4-degree tilt, using existing 120ms/320ms timing tokens, with no repeat. The wrapper resets/cancels under the live reduced-motion preference. Other mascot placements remain static; history receives no mascot extension. Static captures do not prove live motion or reduced-motion runtime.

Source checked: `src/constants/theme.ts`, `src/constants/motion.ts`, `src/components/app-button.tsx`, `app-sheet.tsx`, `cancellation-sheet.tsx`, `cancel-open-job.tsx`, `booking-lifecycle.tsx`, `motion.tsx` and `skillmatch-mascot.tsx`. Direction checked: `.impeccable/review/cancellation-brief.md`; document guidance checked: `C:/Users/JOSH/.agents/skills/impeccable/reference/document.md`.

Native visual evidence: `.impeccable/review/cancel-booking-reason-worker.png` and `cancel-booking-review-worker.png`, each captured at 1080x2400 on the installed Android emulator preview, at idle with actions and gesture area visible. The finish reviewer returned **SHIP within the Worker phone reason/review screen scope**, with no material fixes. This disposition does not establish Client presentation, font scaling, keyboard state, live motion or physical-device behavior. No web detector ran because these are native components.

Behavioral evidence carried from the verification run: the existing QA candidate passed 173 files / 3,074 tests; `tsc --noEmit` and targeted ESLint were clean. TesterArmy `.e2e-worker-2` passed one Worker reason/review/change-reason/Keep path. The earlier Client-assumption runs failed because the existing session was Worker; the corrected run used that Worker session. No final cancellation was pressed, so this run does not prove a live cancellation commit or post-commit runtime behavior. Evidence folder: `C:/Users/JOSH/Documents/SkillMatch-Two-Phone-QA-20261028/cancellation-ui-20261102`.

Build identity: local, uncommitted changes on `checkpoint/mobile-rc3-20261030`, base `8ec8487`. Installed emulator APK SHA256: `2bbcb86c5e992b443c06d7b966ce04b03bc996a201faa0d6f476182ea70ce0bb`. Its `extractNativeLibs` packaging adjustment is emulator-only; the application code equals the phone preview. No commit, push, hosted deployment or runtime mutation was performed by this documentation pass.

Not canonized or repaired: pre-existing missing product/design context remains outside this scoped extension; no new visual defect was identified in the checked Worker stills, and unobserved Client/accessibility/motion states remain evidence limits rather than new system rules.
