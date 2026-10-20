import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { AppSymbol } from '@/components/app-symbol';
import { SkillMatchTheme } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const { colors, radius, spacing } = SkillMatchTheme.ui;

/**
 * "Your job is open to eligible workers" carousel (owner reference, 2026-10-20; UI-V2).
 *
 * Technique, re-implemented (not copied) from react-native-motion's GalleryStackCarousel @366cc4d: every card
 * is absolutely placed by its signed distance from a shared `active` index; the centre card is full size and
 * its neighbours step down in scale and darken (here: fade toward the canvas) with distance; z-order follows
 * distance; the index moves by spring, so a step retargets instead of queueing. Its CarouselBackdrop idea (a
 * colour wash that follows the active card and dissolves into the page) is reproduced on the UI thread with
 * interpolateColor plus a linear-gradient background. Differences for SkillMatch: the index advances on its own
 * (the post is live, nobody swipes), it wraps over five cards, and the cards are anonymous silhouettes that are
 * hidden from screen readers. Nothing here reads, ranks or names a Worker (D-003: the first eligible Worker to
 * accept books the job).
 *
 * Worklets reference only their parameters and module-level primitives/frozen tables: a worklet cannot see a
 * default-parameter expression (V1 crashed natively with "Property 'CAROUSEL' doesn't exist").
 */
export const CARDS = 5;
export const CARD_W = 96;
export const CARD_H = 124;
const GAP = 18;
const PITCH = CARD_W + GAP;
export const HOLD_MS = 1500;
/** One step settles in ~500 ms, no visible overshoot. */
export const STEP_SPRING = { damping: 22, stiffness: 150, mass: 1, reduceMotion: ReduceMotion.Never } as const;
/** Per-card wash tints (all from the theme's tint family); the last repeats the first so the wrap is seamless. */
const WASH = [colors.accentSubtle, colors.successTint, colors.warningTint, colors.infoTint, colors.accentSubtlePressed, colors.accentSubtle];
const WASH_STOPS = [0, 1, 2, 3, 4, 5];
const AVATAR = [colors.accent, colors.success, colors.warning, colors.accent, colors.success];

/** Signed distance of card `index` from `active`, wrapped into [-count/2, count/2). */
export function wrappedDiff(index: number, active: number, count: number) {
  'worklet';
  const raw = index - active;
  return ((((raw % count) + count) + count / 2) % count) - count / 2;
}

/** `active` folded into [0, count): drives the backdrop wash. */
export function wrappedIndex(active: number, count: number) {
  'worklet';
  return ((active % count) + count) % count;
}

function IdCard({ index, active, veilColor }: { index: number; active: SharedValue<number>; veilColor: string }) {
  const card = useAnimatedStyle(() => {
    const diff = wrappedDiff(index, active.get(), CARDS);
    const distance = Math.abs(diff);
    return {
      // Only the centre and its two neighbours are ever visible: a card two steps out is fully transparent at rest,
      // so it can never ghost through a neighbour (seen on device in the first V2 build at 17%).
      opacity: interpolate(distance, [0, 1.3, 1.85], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: diff * PITCH },
        { translateY: interpolate(distance, [0, 1], [-8, 4], Extrapolation.CLAMP) },
        { scale: interpolate(distance, [0, 1, 2], [1, 0.82, 0.68], Extrapolation.CLAMP) },
      ],
    };
  });
  // The reference darkens neighbours (0 / 0.5 / 0.7 by distance); on a light canvas they recede toward it instead.
  const veil = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(wrappedDiff(index, active.get(), CARDS)), [0, 1, 2], [0, 0.5, 0.7], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[styles.card, card]}>
    <View style={[styles.avatar, { borderColor: AVATAR[index % AVATAR.length] }]}>
      <AppSymbol name={{ android: 'person', ios: 'person.fill' }} size={30} tintColor={colors.textMuted} />
    </View>
    <View style={[styles.line, styles.lineLong]} />
    <View style={[styles.line, styles.lineShort]} />
    <View style={styles.chips}><View style={styles.chip} /><View style={styles.chip} /></View>
    <Animated.View pointerEvents="none" style={[styles.veil, { backgroundColor: veilColor }, veil]} />
  </Animated.View>;
}

/** Pause outside the foreground; the parent unmounts the carousel on acceptance or loss of access. */
export function useCarouselForeground() {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  return foreground;
}

/** Hex colour the wash and the receding cards dissolve into: the page canvas, or the sheet surface (UI-V3). */
export function FindingWorkerCarousel({ blendInto = colors.canvas }: { blendInto?: string } = {}) {
  const reducedMotion = useReducedMotion();
  const foreground = useCarouselForeground();
  // Keep looping for the mounted waiting state. Reduced motion/background settles the cards.
  const reduced = reducedMotion || !foreground;
  const active = useSharedValue(0);
  useEffect(() => {
    if (reduced) { cancelAnimation(active); active.set(Math.round(active.get())); return; }
    // One spring step per hold, retargeting from wherever the last step is: interruptible, never queued.
    const timer = setInterval(() => active.set(withSpring(Math.round(active.get()) + 1, STEP_SPRING)), HOLD_MS);
    return () => { clearInterval(timer); cancelAnimation(active); };
  }, [reduced, active]);
  const wash = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(wrappedIndex(active.get(), CARDS), WASH_STOPS, WASH),
  }));

  return <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={styles.stage}>
      <Animated.View style={[StyleSheet.absoluteFill, wash]} />
      {/* The wash rises out of and dissolves back into the canvas (the reference fades only downward; on a light
          page that left a hard top edge on device). */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
        experimental_backgroundImage: `linear-gradient(to bottom, ${blendInto} 0%, ${blendInto}00 28%, ${blendInto}00 58%, ${blendInto} 100%)`,
      }]} />
      {Array.from({ length: CARDS }, (_, index) => <IdCard key={index} index={index} active={active} veilColor={blendInto} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: -spacing.gutter },
  stage: { height: CARD_H + 56, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', width: CARD_W, height: CARD_H, paddingTop: 14, alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceRaised, borderRadius: radius.card, borderCurve: 'continuous', overflow: 'hidden',
    boxShadow: '0px 10px 20px -10px rgba(27, 31, 36, 0.35)',
  },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceSunken },
  line: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceSunken },
  lineLong: { width: 60 },
  lineShort: { width: 40 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { width: 22, height: 8, borderRadius: 4, backgroundColor: colors.accentSubtle },
});
