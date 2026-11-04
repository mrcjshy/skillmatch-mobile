/**
 * Progress maths for the Recruiter Steps panel (components/RecruiterSteps.tsx), kept free of native
 * modules so it can be tested. Progress runs 0…1 and each of the five steps is a fifth of it.
 *
 * The Native Cook original clamps progress at 1, which is exactly where the fifth dot would start to
 * fill, so a controlled panel at 1 said "done" over an empty last ring. A finished panel now runs on
 * to 1 + FINISH, far enough for the fifth dot to fill, ripple and draw its check like the others.
 */
export const STEPS = 5;

/** How far a finished panel runs past 1, in progress units: 0.6 of a step, past the check (0.32). */
export const FINISH = 0.6 / STEPS;

export function clamp01(t: number) {
  'worklet';
  return Math.min(1, Math.max(0, t));
}

/** Where a controlled panel animates to: progress 1 (or more) means every step is done. */
export function controlledTarget(progress: number) {
  return progress >= 1 ? 1 + FINISH : Math.max(0, progress);
}

/** How far past its completion step `index` is, in steps: everything about a dot follows from it. */
export function pastStep(p: number, index: number) {
  'worklet';
  return Math.min(1 + FINISH, Math.max(0, p)) * STEPS - (index + 1);
}

/** The step being worked on at progress `p` (0…5; 5 when everything is done). */
export function activeStep(p: number) {
  'worklet';
  return Math.min(STEPS, Math.floor(clamp01(p) * STEPS + 0.0001));
}
