/**
 * SkillMatch motion tokens: the only timing, easing, scale and distance values motion may use.
 *
 * Personality: responsive, warm, calm and purposeful, Android-first. Motion explains a change of
 * state (pressed, arrived, reordered, succeeded); it never decorates, loops or delays a task.
 * Every value here is consumed through `@/components/motion`, which also applies the system
 * reduced-motion preference (see `@/hooks/use-reduced-motion`). Components never hard-code a
 * duration or a curve of their own.
 */

/** Cubic-bezier control points (x1, y1, x2, y2), the Material 3 curves Android users already know. */
export type MotionCurve = readonly [number, number, number, number];

export const MotionTokens = {
  duration: {
    /** Press in / press out feedback. */
    micro: 120,
    /** Leaving: a surface or banner exits faster than it entered. */
    exit: 160,
    /** Standard state change: a fade, an arriving row, a reorder, a banner arriving. */
    standard: 200,
    /** A whole surface travelling (bottom sheet). Top of the standard range. */
    large: 240,
    /** Emphasized success reveal. */
    emphasized: 320,
  },
  easing: {
    /** Moves that start and end on screen (reorder, press release). */
    standard: [0.2, 0, 0, 1] as MotionCurve,
    /** Arriving content: quick start, gentle settle. */
    decelerate: [0.05, 0.7, 0.1, 1] as MotionCurve,
    /** Leaving content: gentle start, quick finish. */
    accelerate: [0.3, 0, 0.8, 0.15] as MotionCurve,
  },
  scale: {
    /** The Client centre + while pressed. */
    pressAction: 0.92,
    /** Where a success mark starts before it settles at 1. */
    reveal: 0.88,
  },
  distance: {
    /** An arriving row rises this far (dp). */
    enter: 8,
    /** The message banner drops in from this far above its resting place (dp). */
    banner: 12,
  },
  stagger: {
    /** Delay between consecutive arriving rows (ms). */
    step: 30,
    /** Only the first rows are staggered; the longest delay is step x (maxItems - 1) = 150 ms. */
    maxItems: 6,
  },
  /** Arriving rows animate only within this window after the list's job set changes (ms). */
  revealWindow: 900,
} as const;

/** The delay before an arriving row at `index` starts: a short, capped cascade, never a wait. */
export function staggerDelay(index: number): number {
  const { step, maxItems } = MotionTokens.stagger;
  return Math.min(Math.max(index, 0), maxItems - 1) * step;
}
