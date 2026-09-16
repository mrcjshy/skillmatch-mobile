import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

/** Compact pill stays 36 tall; hitSlop expands the interactive area to 44. */
const COMPACT_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'compact';

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
}: AppButtonProps) {
  const blocked = disabled || loading;
  const spinnerColor =
    variant === 'compact'
      ? colors.textInverse
      : variant === 'destructive'
        ? colors.danger
        : variant === 'primary'
          ? colors.textOnAccent
          : colors.primary;

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      hitSlop={variant === 'compact' ? COMPACT_HIT_SLOP : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        variant === 'primary' && pressed && !blocked ? styles.primaryPressed : null,
        variant !== 'primary' && pressed && !blocked ? styles.pressed : null,
        blocked && variant === 'primary' ? styles.primaryDisabled : null,
        blocked && variant !== 'primary' ? styles.blocked : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
  },
  pressed: {
    opacity: 0.72,
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  blocked: {
    opacity: 0.4,
  },
  label: {
    textAlign: 'center',
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    alignSelf: 'stretch',
    height: size.primaryButton,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  secondary: {
    alignSelf: 'stretch',
    height: size.secondaryButton,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
  },
  ghost: {
    minHeight: size.ghostButton,
    backgroundColor: 'transparent',
  },
  destructive: {
    alignSelf: 'stretch',
    height: size.secondaryButton,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  compact: {
    height: size.compactButton,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    ...type.button,
    color: colors.textOnAccent,
  },
  secondary: {
    ...type.button,
    color: colors.primary,
  },
  ghost: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.primary,
  },
  destructive: {
    ...type.button,
    color: colors.danger,
  },
  compact: {
    ...type.badge,
    color: colors.textInverse,
  },
});
