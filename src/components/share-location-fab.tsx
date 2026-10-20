import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppSymbol } from '@/components/app-symbol';
import { MotionView, usePressScale } from '@/components/motion';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const SIZE = 56;

/**
 * Pulse timing, copied from the owner's motion reference (2026-10-20): the circle itself never moves; a soft
 * halo blooms at its edge and becomes a thin ring that expands to about 1.7x while fading (~1.3 s), then the
 * button rests. At rest (`ready`) a pulse repeats every ~5 s, as in the reference. While the location is live
 * (`live`) the same pulse repeats every ~2 s, so "on air" reads at a glance. One ease-out for the whole pulse
 * (expo-ui-examples' sheet timing: fast start, soft landing, no overshoot).
 */
export const SHARE_PULSE = { leadMs: 280, ringMs: 1300, haloShare: 0.55, readyRestMs: 3700, liveRestMs: 700, ringScale: 1.75, haloScale: 1.45 } as const;
/** UI-V2, from the video frames (0.07 s steps): the disc is visible from the first frames of a pulse (peak 0.4 at 5%),
 *  the ring brightens while the disc is still there (peak 0.85 at 18%) and is a thin, light stroke by the end. */
const HALO_IN = [0, 0.05, SHARE_PULSE.haloShare];
const HALO_OPACITY = [0, 0.4, 0];
const RING_IN = [0, 0.18, 0.6, 1];
const RING_OPACITY = [0, 0.85, 0.4, 0];
const OUT = Easing.out(Easing.cubic);

export type ShareFabMode = 'ready' | 'live' | 'busy' | 'blocked';

/**
 * The Worker's share-location control, floating on the booking map above the collapsed panel. It runs the same
 * `start`/`stop` handlers as the former panel button, so the permission flow, the server session and every Stop
 * guarantee are unchanged. The pulse runs on the UI thread (one shared value, transform/opacity only) and is
 * off under Reduce Motion.
 */
export function ShareLocationFab({ mode, onPress, bottom }: { mode: ShareFabMode; onPress: () => void; bottom: number }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const reduced = useReducedMotion();
  const press = usePressScale();
  const pulse = useSharedValue(0);
  const pulsing = !reduced && (mode === 'ready' || mode === 'live');
  const rest = mode === 'live' ? SHARE_PULSE.liveRestMs : SHARE_PULSE.readyRestMs;

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.set(0);
    if (!pulsing) return;
    pulse.set(withRepeat(withSequence(
      withDelay(SHARE_PULSE.leadMs, withTiming(1, { duration: SHARE_PULSE.ringMs, easing: OUT, reduceMotion: ReduceMotion.Never })),
      withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
      withTiming(0, { duration: rest, reduceMotion: ReduceMotion.Never }),
    ), -1));
    return () => cancelAnimation(pulse);
  }, [pulsing, rest, pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), HALO_IN, HALO_OPACITY, Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.get(), [0, SHARE_PULSE.haloShare], [1, SHARE_PULSE.haloScale], Extrapolation.CLAMP) }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), RING_IN, RING_OPACITY, Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.get(), [0, 1], [1, SHARE_PULSE.ringScale], Extrapolation.CLAMP) }],
  }));

  const label = mode === 'live' ? 'Stop sharing location on this device' : mode === 'busy' ? 'Cancel starting location sharing' : 'Share my location';
  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom }]}>
      <View style={styles.stage}>
        <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
        <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
        <MotionView style={press.style}>
          <Pressable accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ disabled: mode === 'blocked', busy: mode === 'busy' }}
            disabled={mode === 'blocked'} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} hitSlop={8}
            style={[styles.button, mode === 'blocked' && styles.blocked]}>
            <AppSymbol name={{ android: 'share_location', ios: 'location.circle.fill' }} size={28} tintColor="#FFFFFF" />
          </Pressable>
        </MotionView>
      </View>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { spacing, colors, elevation } = ui;
  return StyleSheet.create({
    anchor: { position: 'absolute', right: spacing.gutter },
    stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
    halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.accent },
    ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5, borderColor: colors.accent },
    button: {
      width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF', ...elevation.floating,
    },
    blocked: { opacity: 0.5 },
  });
}
