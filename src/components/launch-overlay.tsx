import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MotionView, useLaunchMotion } from '@/components/motion';
import { useUiTheme } from '@/components/refinement-theme';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import {
  LAUNCH_BACKGROUND,
  LAUNCH_MASCOT_EXPRESSION,
  LAUNCH_MASCOT_OFFSET_Y,
  LAUNCH_MASCOT_SIZE,
  LAUNCH_TIMING,
  launchExitDuration,
  launchShouldLeave,
} from '@/lib/launch-splash';

type LaunchOverlayProps = {
  /** True while the root boot state is 'session-restoring' or 'account-pending'. */
  booting: boolean;
};

/**
 * The launch hand-off. Its first frame is the native splash: the app canvas with Itik's hello frame
 * at the same size and place (see `@/lib/launch-splash`), so nothing jumps when Android removes its
 * splash. Then Itik waves hello and the wordmark rises in under it. It leaves once the root boot
 * state is ready and the minimum has passed, or at the cap, with a short fade, then unmounts.
 *
 * Decorative: hidden from screen readers (the StateScreen beneath carries the loading state), and
 * it stops taking touches the moment it starts to leave.
 */
export function LaunchOverlay({ booting }: LaunchOverlayProps) {
  const { colors, type, spacing } = useUiTheme();
  // Latched: once the boot state has been ready, a later loading state does not hold the cover.
  const [ready, setReady] = useState(!booting);
  if (!booting && !ready) setReady(true);
  const [clock, setClock] = useState({ minimumPassed: false, capPassed: false });
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const { reduced, cover, wordmark } = useLaunchMotion(leaving);
  if (!leaving && launchShouldLeave({ ready, reduced, ...clock })) setLeaving(true);

  useEffect(() => {
    const minimum = setTimeout(() => setClock((current) => ({ ...current, minimumPassed: true })), LAUNCH_TIMING.minimum);
    const cap = setTimeout(() => setClock({ minimumPassed: true, capPassed: true }), LAUNCH_TIMING.cap);
    return () => { clearTimeout(minimum); clearTimeout(cap); };
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setGone(true), launchExitDuration(reduced));
    return () => clearTimeout(timer);
  }, [leaving, reduced]);

  if (gone) return null;
  return (
    <MotionView accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.cover, cover]}>
      <View style={styles.mascot}>
        <SkillMatchMascot expression={LAUNCH_MASCOT_EXPRESSION} size={LAUNCH_MASCOT_SIZE} />
      </View>
      <MotionView style={[styles.wordmark, { marginTop: WORDMARK_TOP + spacing.sm }, wordmark]}>
        <Text style={[type.display, { color: colors.accent }]}>SkillMatch</Text>
      </MotionView>
    </MotionView>
  );
}

/** The cell's bottom edge below the window centre (dp): the wordmark starts under it. */
const WORDMARK_TOP = LAUNCH_MASCOT_OFFSET_Y + LAUNCH_MASCOT_SIZE / 2;

const styles = StyleSheet.create({
  // Above every root host; the window is edge-to-edge, so this is the native splash's whole window.
  cover: { zIndex: 2000, backgroundColor: LAUNCH_BACKGROUND },
  // Centred on the window like the native splash icon, then LAUNCH_MASCOT_OFFSET_Y lower.
  mascot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: LAUNCH_MASCOT_SIZE,
    height: LAUNCH_MASCOT_SIZE,
    marginTop: LAUNCH_MASCOT_OFFSET_Y - LAUNCH_MASCOT_SIZE / 2,
    marginLeft: -LAUNCH_MASCOT_SIZE / 2,
  },
  wordmark: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' },
});
