import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { AppState, Image, StyleSheet, View } from 'react-native';

import { DuckFxLayer } from '@/components/duck-fx';
import { MotionView, useDuckMotion } from '@/components/motion';
import type { DuckExpression } from '@/lib/mascot-motion';

/** Itik, the Pateros worker duck: nine poses in one 3x3 atlas (idle, blink, wave, think, celebrate, oops, sleep, point, love). */
const ATLAS = require('@/assets/images/mascot/itik-worker-poses.png');
export const MASCOT_HEIGHT = 96;
/** The feet line in each atlas cell: squash and stretch pivot here. */
const GROUND = '95.4%';

type MascotProps = {
  /** Compatibility with existing call sites: an empty state sleeps, a success celebrates. */
  pose?: 'empty' | 'success';
  expression?: DuckExpression;
  size?: number;
  active?: boolean;
};

/** Itik. Decorative: the neighboring words carry every state and action. */
export function SkillMatchMascot({ pose = 'empty', expression, size = MASCOT_HEIGHT, active = true }: MascotProps) {
  // Optional context: bootstrap states also render safely outside a navigator.
  const navigation = useContext(NavigationContext);
  const focused = useSyncExternalStore(useCallback((notify) => {
    if (!navigation) return () => {};
    const focus = navigation.addListener('focus', notify);
    const blur = navigation.addListener('blur', notify);
    return () => { focus(); blur(); };
  }, [navigation]), () => navigation?.isFocused() ?? true, () => true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  const [ready, setReady] = useState(false);
  const shown = expression ?? (pose === 'success' ? 'celebrate' : 'sleep');
  const playing = active && foreground && focused && ready;
  const motion = useDuckMotion(shown, playing, size);
  const column = motion.pose % 3;
  const row = Math.floor(motion.pose / 3);
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={[styles.stage, { width: size, height: size }]}>
      <MotionView style={[styles.frame, { width: size, height: size }, motion.style]}>
        <Image source={ATLAS} onLoad={() => setReady(true)} resizeMode="stretch" fadeDuration={0}
          style={{ width: size * 3, height: size * 3, position: 'absolute', left: -column * size, top: -row * size }} />
      </MotionView>
      <DuckFxLayer expression={shown} active={playing} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The stage keeps its place in the layout; effects (bubble, Zzz, confetti) may draw past it.
  stage: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  frame: { overflow: 'hidden', transformOrigin: `50% ${GROUND}` },
});
