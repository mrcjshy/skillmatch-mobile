import { useEffect, useState } from 'react';
import Animated, {
  Easing,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MotionTokens, staggerDelay, type MotionCurve } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * The SkillMatch motion primitives. Every authored animation goes through this file: it reads the
 * shared tokens and the live reduced-motion preference, so a component cannot animate with an
 * ad-hoc duration or ignore the system setting. Under reduced motion every preset is `undefined`
 * (content appears in its final state at once) and press feedback keeps the control at rest.
 * Motion is transform/opacity only and never gates content, focus or an action.
 *
 * The live preference is the single source of truth: presets are built with ReduceMotion.Never
 * because they are simply not passed when motion is reduced. (Reanimated's own flag is read once
 * at startup, so turning "Remove animations" off mid-session would otherwise keep motion off.)
 */

const { duration, easing, scale, distance } = MotionTokens;
const curve = ([x1, y1, x2, y2]: MotionCurve) => Easing.bezier(x1, y1, x2, y2);
const NEVER = ReduceMotion.Never;

/** Reanimated host components, re-exported so screens depend on this file only. */
export const MotionView = Animated.View;
export const MotionFlatList = Animated.FlatList;

/** A row arriving in a list: fades in while rising `distance.enter`, after a capped cascade. */
function rowEnter(rank: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: distance.enter }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: curve(easing.decelerate) },
  }).duration(duration.standard).delay(staggerDelay(rank)).reduceMotion(NEVER);
}

/** Rows moving to new places (a sort change, a row leaving) glide instead of jumping. */
const rowLayout = LinearTransition.duration(duration.standard).easing(curve(easing.standard)).reduceMotion(NEVER);

/** A foreground banner drops a short way into place, then lifts away faster than it came. */
const bannerEnter = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -distance.banner }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: curve(easing.decelerate) },
}).duration(duration.standard).reduceMotion(NEVER);
const bannerExit = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -distance.banner }], easing: curve(easing.accelerate) },
}).duration(duration.exit).reduceMotion(NEVER);

/** A state that replaces a spinner (an empty result) settles in rather than popping. */
const fadeIn = new Keyframe({
  0: { opacity: 0 },
  100: { opacity: 1, easing: curve(easing.decelerate) },
}).duration(duration.standard).reduceMotion(NEVER);

/** A legitimate success: the mark grows slightly into place once. No bounce, no repeat. */
const successEnter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: scale.reveal }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: curve(easing.decelerate) },
}).duration(duration.emphasized).reduceMotion(NEVER);

/** The motion presets for the current preference. All `undefined` under reduced motion. */
export function useMotion() {
  const reduced = useReducedMotion();
  return reduced
    ? { reduced, rowLayout: undefined, bannerEnter: undefined, bannerExit: undefined, fadeIn: undefined, successEnter: undefined }
    : { reduced, rowLayout, bannerEnter, bannerExit, fadeIn, successEnter };
}

/**
 * Press feedback for one prominent control: scales down while held and back on release.
 * Spread `onPressIn`/`onPressOut` onto the Pressable and `style` onto its MotionView wrapper.
 */
export function usePressScale(pressedScale: number = scale.pressAction) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: progress.get() }] }));
  const settle = (to: number) => {
    progress.set(reduced ? 1 : withTiming(to, { duration: duration.micro, easing: curve(easing.standard), reduceMotion: NEVER }));
  };
  return { style, onPressIn: () => settle(pressedScale), onPressOut: () => settle(1) };
}

type RevealState = { key: string; seen: ReadonlySet<string>; fresh: ReadonlyMap<string, number> };
const NONE: ReadonlyMap<string, number> = new Map();

/**
 * Which rows are arriving. Given the previous state and the ids now listed (display order),
 * a row is fresh when the job set changed and the row was not listed before. Its rank among the
 * fresh rows sets its cascade delay. A reorder of the same rows is not an arrival.
 */
export function nextReveal(previous: RevealState, ids: readonly string[]): RevealState {
  const key = [...ids].sort().join('\n');
  if (key === previous.key) return previous;
  const fresh = new Map<string, number>();
  for (const id of ids) if (!previous.seen.has(id)) fresh.set(id, fresh.size);
  return { key, seen: new Set(ids), fresh };
}

/**
 * Entering animation per list row. Rows that arrive with a load, a refresh or a live update fade
 * in once, within `revealWindow`; rows that mount later because the list scrolled (virtualisation)
 * and rows that only change place do not, so a settled list never moves on its own.
 */
export function useListReveal(ids: readonly string[]) {
  const reduced = useReducedMotion();
  const [reveal, setReveal] = useState<RevealState>(() => ({ key: [...ids].sort().join('\n'), seen: new Set(ids), fresh: NONE }));
  const next = nextReveal(reveal, ids);
  if (next !== reveal) setReveal(next);

  useEffect(() => {
    if (reveal.fresh.size === 0) return;
    const timer = setTimeout(() => {
      setReveal((current) => (current === reveal ? { ...current, fresh: NONE } : current));
    }, MotionTokens.revealWindow);
    return () => clearTimeout(timer);
  }, [reveal]);

  return (id: string) => {
    const rank = reveal.fresh.get(id);
    return reduced || rank === undefined ? undefined : rowEnter(rank);
  };
}
