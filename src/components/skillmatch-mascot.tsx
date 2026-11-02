import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { AppState, Image, StyleSheet, View } from 'react-native';

import { MotionView, useDuckMotion } from '@/components/motion';
import type { DuckExpression } from '@/lib/mascot-motion';

const ATLAS = require('@/assets/images/mascot/pateros-duck-poses.png');
export const MASCOT_HEIGHT = 96;

type MascotProps = {
  /** Compatibility with existing empty/success call sites. */
  pose?: 'empty' | 'success';
  expression?: DuckExpression;
  size?: number;
  active?: boolean;
};

/** Original Pateros duck. Decorative: the neighboring words carry every state and action. */
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
  const motion = useDuckMotion(expression ?? (pose === 'success' ? 'celebrate' : 'idle'), active && foreground && focused && ready);
  const column = motion.pose % 3;
  const row = Math.floor(motion.pose / 3);
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={[styles.stage, { width: size, height: size }]}>
      <MotionView style={[styles.frame, { width: size, height: size }, motion.style]}>
        <Image source={ATLAS} onLoad={() => setReady(true)} resizeMode="stretch" fadeDuration={0}
          style={{ width: size * 3, height: size * 3, position: 'absolute', left: -column * size, top: -row * size }} />
      </MotionView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: { overflow: 'hidden', transformOrigin: '50% 94%' },
});
