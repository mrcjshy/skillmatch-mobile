import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AppSymbol } from '@/components/app-symbol';
import { PulseDots } from '@/components/skeleton';
import { COBALT_LIT, COBALT_LIT_PRESSED, COBALT_SHADOW, COBALT_SHEEN } from '@/constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

/**
 * Premium cobalt for the Post a job page (owner 2026-11-04: "remove that black, match the cobalt, but
 * make it feel premium"). Solid cobalt, lit by the Profile hero's sheen, marks what acts or is chosen;
 * white surfaces float on a cobalt-tinted shadow. Text on cobalt is white or onAccentSecondary (8.5:1).
 * The finish itself lives in `@/constants/cobalt-material`, shared with the bottom bar's + action.
 */
export const COBALT = {
  base: colors.accent,
  deep: colors.accentPressed,
  /** The Profile hero's light: lightest top-left, deepest bottom-right. */
  sheen: COBALT_SHEEN,
  /** A button lit from above, and the same pressed a shade deeper. */
  lit: COBALT_LIT,
  litPressed: COBALT_LIT_PRESSED,
  text: colors.onAccent,
  textSecondary: colors.onAccentSecondary,
  hairline: 'rgba(255, 255, 255, 0.16)',
} as const;

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const PRESS_SPRING = { damping: 18, stiffness: 380, mass: 0.6 };
const POP_SPRING = { damping: 12, stiffness: 320, mass: 0.5 };

/** White surfaces lift on a faint cobalt-tinted shadow. */
const LIFT_SHADOW = '0px 14px 30px rgba(28, 58, 166, 0.08), 0px 2px 6px rgba(13, 22, 41, 0.05)';
const NO_SHADOW = '0px 0px 0px rgba(0, 0, 0, 0)';

type CobaltButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Working: the orb types the house dots (like the panel's status) and cannot be pressed again. */
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The page's primary action: a lit cobalt pill with a white orb carrying the arrow. Under the finger
 * it gives a little and the arrow leans forward; disabled turns it a sunken grey (never just faded).
 */
export function CobaltButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, style }: CobaltButtonProps) {
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const body = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * pressed.get() }] }));
  const lean = useAnimatedStyle(() => ({ transform: [{ translateX: 4 * pressed.get() }] }));
  const inactive = disabled || loading;
  const off = disabled && !loading;
  const press = (to: number) => {
    if (!reducedMotion) pressed.set(withSpring(to, PRESS_SPRING));
  };
  return (
    <Animated.View style={[styles.buttonFrame, body, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          onPress();
        }}
        onPressIn={() => press(1)}
        onPressOut={() => press(0)}
        style={({ pressed: down }) => [
          styles.button,
          off ? styles.buttonOff : styles.buttonLit,
          down && !inactive ? styles.buttonPressed : null,
        ]}
      >
        <Text style={[styles.buttonLabel, off ? styles.buttonLabelOff : null]} numberOfLines={1}>
          {label}
        </Text>
        <Animated.View style={[styles.orb, off ? styles.orbOff : null, lean]}>
          {loading ? (
            <View style={styles.orbDots}>
              <PulseDots color={COBALT.base} />
            </View>
          ) : (
            <AppSymbol name={{ android: 'arrow_forward', ios: 'arrow.right' }} size={20} tintColor={off ? colors.textSecondary : COBALT.base} />
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Depth for a white SurfaceGroup on this page: give the group `borderWidth: 0` and the same radius. */
export function LiftCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Nested arrays flatten and empty slots are dropped, like SurfaceGroup. */
function rowsOf(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node.flatMap(rowsOf);
  return node === null || node === undefined || typeof node === 'boolean' ? [] : [node];
}

/** The Review summary on lit cobalt, like the Recruiter Steps panel, rows split by white hairlines. */
export function CobaltTicket({ children }: { children: ReactNode }) {
  const rows = rowsOf(children);
  if (rows.length === 0) return null;
  return (
    <View style={styles.ticket}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.ticketRule} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/**
 * The panel's finished dot as a badge, with a springy pop when it appears: a cobalt disc with a white
 * check on white surfaces, a white disc with a cobalt check on cobalt ones.
 */
export function CheckBadge({ diameter = 20, tone = 'cobalt' }: { diameter?: number; tone?: 'cobalt' | 'white' }) {
  const reducedMotion = useReducedMotion();
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) pop.set(withSpring(1, POP_SPRING));
  }, [pop, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.6),
    transform: [{ scale: 0.4 + 0.6 * pop.get() }],
  }));
  const onWhite = tone === 'cobalt';
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.check,
        { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: onWhite ? COBALT.base : COBALT.text },
        style,
      ]}
    >
      <AppSymbol name={{ android: 'check', ios: 'checkmark' }} size={diameter - 6} tintColor={onWhite ? COBALT.text : COBALT.base} />
    </Animated.View>
  );
}

/** A soft cobalt ring around a field while it has focus; the field keeps its own focus border. */
export function GlowWell({ focused, children }: { focused: boolean; children: ReactNode }) {
  return <View style={[styles.well, focused ? styles.wellFocused : null]}>{children}</View>;
}

// Steps share one horizontal axis: Next enters from the right, Previous from the left. Exit is instant.
const ENTER_NEXT = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 28 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_OUT },
}).duration(320);
const ENTER_PREVIOUS = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: -28 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_OUT },
}).duration(320);

/**
 * The wizard's step content. A new step mounts fresh and slides in along the direction travelled;
 * the first step simply appears. Under Reduce Motion, Reanimated skips the movement.
 */
export function StepStage({ step, children }: { step: number; children: ReactNode }) {
  const [seen, setSeen] = useState({ step, direction: 0 });
  if (seen.step !== step) setSeen({ step, direction: step > seen.step ? 1 : -1 });
  const entering = seen.direction > 0 ? ENTER_NEXT : seen.direction < 0 ? ENTER_PREVIOUS : undefined;
  return (
    <Animated.View key={step} entering={entering} style={styles.stage}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  buttonFrame: {
    borderRadius: 28,
  },
  button: {
    minHeight: 56,
    borderRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: COBALT.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
  },
  buttonLit: {
    experimental_backgroundImage: COBALT.lit,
    boxShadow: COBALT_SHADOW,
  },
  buttonPressed: {
    backgroundColor: COBALT.deep,
    experimental_backgroundImage: COBALT.litPressed,
  },
  buttonOff: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: NO_SHADOW,
  },
  buttonLabel: {
    ...type.button,
    color: COBALT.text,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  buttonLabelOff: {
    color: colors.textSecondary,
  },
  orb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COBALT.text,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 10px rgba(10, 22, 80, 0.28)',
  },
  // The house loader (no spinners in this app), scaled to sit inside the orb.
  orbDots: {
    transform: [{ scale: 0.72 }],
  },
  orbOff: {
    backgroundColor: '#DCDAD4',
    boxShadow: NO_SHADOW,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet - spacing.xs,
    borderCurve: 'continuous',
    boxShadow: LIFT_SHADOW,
  },
  ticket: {
    backgroundColor: COBALT.base,
    experimental_backgroundImage: COBALT.sheen,
    borderRadius: 28,
    borderCurve: 'continuous',
    paddingVertical: spacing.sm,
    boxShadow: COBALT_SHADOW,
  },
  ticketRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COBALT.hairline,
    marginLeft: spacing.lg + size.icon + spacing.md,
  },
  check: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  well: {
    borderRadius: radius.control,
  },
  wellFocused: {
    boxShadow: '0px 0px 0px 4px rgba(28, 58, 166, 0.16)',
  },
  stage: {
    gap: spacing.xl,
  },
});
