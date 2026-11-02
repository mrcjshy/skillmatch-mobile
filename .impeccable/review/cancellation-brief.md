# Cancellation surface direction

Mode: Operate. Native Android phone, existing SkillMatch identity.

Owner request: replace the old Android cancellation alert shown in the supplied screenshot, across Client and Worker cancellation flows; use Taste Skill and React Native Motion references; add mascot motion. Owner explicitly chose cancellation flow only, excluding history cards.

A scoped extension of the existing visual system: cobalt #1C3AA6, warm canvas #F7F6F3, white surfaces, Roboto platform typography, 24dp sheet corners, existing AppButton/AppSheet/notice semantics. Preserve business authority and clear irreversible-action copy. No whole-app rebrand, dependency addition or backend edit.

Design: one rounded bottom sheet, existing decorative mascot with one bounded settle and live reduced-motion handling, full-width reason choices, a review inside the same sheet, explicit red cancellation action and blue Keep action. Pending blocks repeat/dismiss; failure preserves the selected reason and detail. Mascot artwork and other placements stay static.

Quality bar: clear task-specific actions, no platform Alert for job/booking cancellation, readable contrast, no clipped content, scrollable body/pinned footer, 48dp targets, no mascot loops or invented cancellation success.

Evidence: Android emulator-5554, 1080x2400, actual installed QA APK. Captured Worker reason and review. TesterArmy E2E proves review gating, selection retention, change reason and Keep dismissal. Client paths have behavioral/unit coverage; no fresh Client account native session was used. No final cancellation was pressed. No web detector ran because these are native components.

Source: src/components/cancellation-sheet.tsx, cancel-open-job.tsx, booking-lifecycle.tsx, app-sheet.tsx, motion.tsx; src/constants/motion.ts and theme.ts. Plan: docs/superpowers/plans/2026-11-02-cancellation-flow.md.

No PRODUCT.md or DESIGN.md pre-existed in this checkout. Context explicitly allowed scoped incumbent refinement. Preserve that documentation boundary; do not create a new visual world or fix existing context drift.
