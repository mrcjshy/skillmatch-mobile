import { useEffect, useState } from 'react';
import Animated, {
  Easing,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  cancelAnimation,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MotionTokens, staggerDelay, type MotionCurve } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  DUCK_MOVES, DUCK_PLAY_LIMIT, NEUTRAL, duckMove, duckPosePlan, loopRepeats, restingDuckPose, splitTrack,
  type DuckEase, type DuckExpression, type DuckKey, type DuckTrack,
} from '@/lib/mascot-motion';

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

/**
 * The Home greeting's hand: two quick waves from the wrist each time `play` changes (arriving on
 * Home), then still. Finite, transform-only, and still under reduced motion.
 */
export function useGreetingWave(play: number) {
  const reduced = useReducedMotion();
  const angle = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(angle);
    angle.set(0);
    if (reduced) return;
    const leg = { duration: 140, easing: curve(easing.standard), reduceMotion: NEVER };
    angle.set(withSequence(
      withTiming(18, leg), withTiming(-8, leg), withTiming(16, leg), withTiming(-4, leg), withTiming(0, leg),
    ));
    return () => cancelAnimation(angle);
  }, [angle, play, reduced]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
}

/** Sound arc `k` for call progress `c`: each arc grows and fades a little later than the one before. */
function announceArc(c: number, k: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, c * 1.3 - k * 0.15));
  return { opacity: t === 0 ? 0 : 0.85 * (1 - t * 0.6), transform: [{ rotate: '45deg' }, { scale: 0.6 + 0.6 * t }] };
}

/** How many times Itik calls out through the megaphone after a job is posted. Finite on purpose. */
export const ANNOUNCE_CALLS = 4;

/**
 * Itik announcing a newly posted Job: each call leans toward the megaphone and lifts slightly
 * (wing-led bob), while three sound arcs ripple out from the horn. ANNOUNCE_CALLS calls, then still
 * at rest, so UI automation sees an idle screen afterwards. Under reduced motion nothing moves and
 * the arcs stay hidden. `play` restarts it.
 */
export function useAnnounceMotion(play: boolean) {
  const reduced = useReducedMotion();
  const call = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(call);
    call.set(0);
    if (reduced || !play) return;
    const out = { duration: 260, easing: curve(easing.standard), reduceMotion: NEVER };
    const back = { duration: 420, easing: curve(easing.standard), reduceMotion: NEVER };
    call.set(withRepeat(withSequence(withTiming(1, out), withTiming(0, back)), ANNOUNCE_CALLS, false));
    return () => cancelAnimation(call);
  }, [call, play, reduced]);
  const duck = useAnimatedStyle(() => {
    const c = call.get();
    return { transform: [{ translateY: -6 * c }, { rotate: `${-5 * c}deg` }, { scale: 1 + 0.04 * c }] };
  });
  const arc0 = useAnimatedStyle(() => announceArc(call.get(), 0));
  const arc1 = useAnimatedStyle(() => announceArc(call.get(), 1));
  const arc2 = useAnimatedStyle(() => announceArc(call.get(), 2));
  return { reduced, duck, arcs: [arc0, arc1, arc2] as const };
}

/**
 * A placeholder breathing while its content loads. One shared opacity for a whole placeholder, a
 * bounded number of breaths, and it ends fully visible: a slow network leaves a still placeholder,
 * never an endless animation. Under reduced motion it stays still.
 */
export function useLoadingPulse() {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    const { leg, legs, dim } = MotionTokens.loading;
    opacity.set(withRepeat(withTiming(dim, { duration: leg, easing: curve(easing.standard), reduceMotion: NEVER }), legs, true, undefined, NEVER));
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);
  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}

/** Animated duck body and finite expression changes. Inactive/reduced motion cancels immediately. */
/** Mascot Designer's curves: in/out are quadratic, inOut is a sine. */
const DUCK_EASE: Record<DuckEase, ReturnType<typeof Easing.bezier>> = {
  linear: Easing.bezier(0, 0, 1, 1),
  in: Easing.bezier(0.11, 0, 0.5, 0),
  out: Easing.bezier(0.5, 1, 0.89, 1),
  inOut: Easing.bezier(0.37, 0, 0.63, 1),
};
const DUCK_TRACKS: readonly DuckTrack[] = ['sx', 'sy', 'rot', 'tx', 'ty'];

/** One keyframe track as timed steps (the first key is the starting value). */
function keySteps(keys: readonly DuckKey[]) {
  return keys.slice(1).map(([at, value, ease], index) =>
    withTiming(value, { duration: Math.max(0, (at - keys[index][0]) * 1000), easing: DUCK_EASE[ease ?? 'linear'], reduceMotion: NEVER }));
}

/**
 * Itik's body moves: squash and stretch around the feet, anticipation, overshoot, a bounded loop.
 * Sprite changes follow the move's own timeline and blinks. Inactive or reduced motion: the
 * meaningful pose holds still (the words beside it always carry the state).
 */
export function useDuckMotion(expression: DuckExpression, active: boolean, size = 96) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState({ expression, pose: restingDuckPose(expression) });
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const rot = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  useEffect(() => {
    const values = { sx, sy, rot, tx, ty };
    const reset = () => {
      for (const track of DUCK_TRACKS) { cancelAnimation(values[track]); values[track].set(NEUTRAL[track]); }
    };
    reset();
    if (!active || reduced) return reset;
    const timers = duckPosePlan(expression).map(({ at, pose }) => setTimeout(() => setFrame({ expression, pose }), at));
    const move = duckMove(expression);
    const def = DUCK_MOVES[move];
    const idle = DUCK_MOVES.idle;
    const repeats = loopRepeats(move);
    const idleAfter = Math.max(1, Math.floor((DUCK_PLAY_LIMIT - def.duration) / idle.duration));
    for (const track of DUCK_TRACKS) {
      const keys = def.tracks[track] ?? [[0, NEUTRAL[track]] as DuckKey];
      const { intro, loop } = splitTrack(keys, def.loopFrom, def.duration);
      const steps: number[] = [];
      if (def.loopFrom === undefined) {
        // A one-shot (hello, celebrate), then a calm, bounded idle.
        steps.push(...keySteps(intro));
        const idleKeys = idle.tracks[track];
        if (idleKeys) steps.push(withRepeat(withSequence(...keySteps(idleKeys)), idleAfter, false, undefined, NEVER));
      } else {
        steps.push(...keySteps(intro));
        if (loop.length > 1) steps.push(withRepeat(withSequence(...keySteps(loop)), repeats, false, undefined, NEVER));
      }
      values[track].set(keys[0][1]);
      if (steps.length) values[track].set(withSequence(...steps));
    }
    return () => { timers.forEach(clearTimeout); reset(); };
  }, [active, expression, reduced, rot, sx, sy, tx, ty]);
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: tx.get() * size }, { translateY: ty.get() * size }, { rotate: `${rot.get()}deg` },
    { scaleX: sx.get() }, { scaleY: sy.get() },
  ] }));
  return { pose: reduced || !active || frame.expression !== expression ? restingDuckPose(expression) : frame.pose, style };
}

/**
 * The launch hand-off (LaunchOverlay). The wordmark fades in while rising under Itik, once; when
 * `leaving` turns true the whole cover fades out while growing slightly. Finite and transform/opacity
 * only. Under reduced motion nothing moves: the wordmark is simply there and the cover only fades,
 * quickly.
 */
export function useLaunchMotion(leaving: boolean) {
  const reduced = useReducedMotion();
  const { launch } = MotionTokens;
  const word = useSharedValue(reduced ? 1 : 0);
  const leave = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(word);
    if (reduced) { word.set(1); return; }
    word.set(withDelay(launch.wordmarkDelay,
      withTiming(1, { duration: duration.emphasized, easing: curve(easing.decelerate), reduceMotion: NEVER }), NEVER));
    return () => cancelAnimation(word);
  }, [launch, reduced, word]);
  useEffect(() => {
    if (!leaving) return;
    leave.set(withTiming(1, { duration: reduced ? launch.reducedExit : launch.exit, easing: curve(easing.accelerate), reduceMotion: NEVER }));
    return () => cancelAnimation(leave);
  }, [launch, leave, leaving, reduced]);
  const grow = reduced ? 0 : launch.exitScale - 1;
  const rise = launch.rise;
  const cover = useAnimatedStyle(() => ({ opacity: 1 - leave.get(), transform: [{ scale: 1 + grow * leave.get() }] }));
  const wordmark = useAnimatedStyle(() => ({ opacity: word.get(), transform: [{ translateY: (1 - word.get()) * rise }] }));
  return { reduced, cover, wordmark };
}

/** The strength of one dot as a sweep (0..3) passes it. */
function dotStrength(sweep: number, dot: number, rest: number) {
  'worklet';
  const distance = Math.abs(sweep - dot - 0.5);
  return Math.max(rest, 1 - distance * (1 - rest));
}

/** Three dots a wait passes across. Bounded like the placeholder pulse; still under reduced motion. */
export function useLoadingDots() {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  const { rest } = MotionTokens.dots;
  useEffect(() => {
    if (reduced) return;
    const { sweep: duration, sweeps } = MotionTokens.dots;
    sweep.set(withRepeat(withTiming(3, { duration, easing: Easing.linear, reduceMotion: NEVER }), sweeps, false, undefined, NEVER));
    return () => cancelAnimation(sweep);
  }, [sweep, reduced]);
  const first = useAnimatedStyle(() => ({ opacity: dotStrength(sweep.get(), 0, rest) }));
  const second = useAnimatedStyle(() => ({ opacity: dotStrength(sweep.get(), 1, rest) }));
  const third = useAnimatedStyle(() => ({ opacity: dotStrength(sweep.get(), 2, rest) }));
  return [first, second, third] as const;
}

/**
 * Follows the on-screen keyboard frame by frame. The app is edge-to-edge, so Android resizes
 * nothing for the keyboard: a screen leaves this much room at its bottom itself. Both bars are
 * declared translucent because that is what the window already is; anything else would make the
 * tracker refit the window.
 */
const KEYBOARD_WINDOW = { isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true } as const;
export function useKeyboardRoom(bottomOffset: number) {
  const keyboard = useAnimatedKeyboard(KEYBOARD_WINDOW);
  return useAnimatedStyle(() => ({ height: Math.max(0, keyboard.height.get() - bottomOffset) }));
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
