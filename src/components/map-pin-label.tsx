import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue,
  withRepeat, withTiming,
} from 'react-native-reanimated';

import { MotionView } from '@/components/motion';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { MotionTokens } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { MARKER_LABEL_MAX_WIDTH } from '@/lib/location-map-view';

/** Job location (dark) and the Worker's live position (blue); `group` when the two overlap. */
export type MapPinKind = 'destination' | 'worker' | 'group';

/** The pointed destination tip (or live-position dot) sits on the coordinate: Marker anchor="bottom". */
export function MapPinLabel({ kind, label, stale = false }: { kind: MapPinKind; label: string; stale?: boolean }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const fill = pinColor(ui, kind);
  // A stale pin keeps its colour family but drops the solid fill, so "live" reads at a glance.
  return (
    <View style={styles.pin} pointerEvents="none">
      <View style={[styles.chip, { backgroundColor: stale ? ui.colors.surface : fill, borderColor: fill }]}>
        <Text style={[styles.label, { color: stale ? fill : ui.colors.onAccent }]} numberOfLines={2}>{label}</Text>
      </View>
      {kind === 'destination' ? <DestinationPin ui={ui} stale={stale} />
        : <View style={[styles.dot, { backgroundColor: fill, borderColor: ui.colors.surface }]} />}
    </View>
  );
}

/**
 * Original native geometry; no reference artwork or new package. Uses react-native-motion's
 * shared-progress/effect technique @366cc4d. The whole pin turns on its vertical axis, with its
 * tip anchored at the saved coordinate. The label and white centre size stay steady.
 */
function DestinationPin({ ui, stale }: { ui: UiTheme; stale: boolean }) {
  const styles = createStyles(ui);
  const spin = useDestinationPinMotion(stale);
  return <MotionView style={[styles.destination, spin]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.outerTail, { borderTopColor: ui.colors.surface }]} />
    <View style={[styles.outerHead, { backgroundColor: ui.colors.surface }]} />
    <View style={[styles.innerTail, { borderTopColor: ui.colors.accentPressed }]} />
    <View style={[styles.innerHead, { backgroundColor: ui.colors.accent }]} />
    <View style={[styles.centre, { backgroundColor: ui.colors.onAccent }]} />
  </MotionView>;
}

/** Stop off-screen, in the background, for stale data and for the live reduced-motion preference. */
export function useDestinationPinMotion(stale: boolean) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const rotation = useSharedValue(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    const settle = () => {
      cancelAnimation(rotation);
      rotation.set(0);
    };
    settle();
    if (!foreground || reduced || stale) return settle;
    rotation.set(withRepeat(withTiming(360, {
      duration: MotionTokens.duration.emphasized * 10,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    }), -1, false, undefined, ReduceMotion.Never));
    return settle;
  }, [rotation, foreground, reduced, stale]));
  return useAnimatedStyle(() => ({ transform: [{ perspective: 500 }, { rotateY: `${rotation.get()}deg` }] }));
}

export function pinColor(ui: UiTheme, kind: MapPinKind): string {
  if (kind === 'destination') return ui.colors.textPrimary;
  if (kind === 'worker') return ui.colors.accent;
  return ui.colors.textSecondary;
}

function createStyles(ui: UiTheme) {
  return StyleSheet.create({
    pin: { alignItems: 'center', maxWidth: MARKER_LABEL_MAX_WIDTH },
    chip: { borderWidth: 2, borderRadius: ui.radius.pill, paddingHorizontal: ui.spacing.sm, paddingVertical: ui.spacing.xs },
    label: { ...ui.type.label, textAlign: 'center' },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 },
    destination: { width: 48, height: 48, marginTop: 2, transformOrigin: 'center bottom' },
    outerHead: { position: 'absolute', top: 0, left: 4, width: 40, height: 40, borderRadius: 20 },
    outerTail: { position: 'absolute', top: 24, left: 4, width: 0, height: 0,
      borderLeftWidth: 20, borderRightWidth: 20, borderTopWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
    innerHead: { position: 'absolute', top: 2, left: 6, width: 36, height: 36, borderRadius: 18 },
    innerTail: { position: 'absolute', top: 24, left: 6, width: 0, height: 0,
      borderLeftWidth: 18, borderRightWidth: 18, borderTopWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
    centre: { position: 'absolute', top: 12, left: 16, width: 16, height: 16, borderRadius: 8 },
  });
}
