import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { type SymbolViewProps } from 'expo-symbols';
import { AppSymbol as SymbolView } from '@/components/app-symbol';



export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'compact' | 'inverse';

type AppButtonProps = {
  label: string;
  icon?: SymbolViewProps['name'];
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
  /** Set only when the button discloses content below it. */
  expanded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  expanded,
  style,
}: AppButtonProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const { styles, variantStyles, labelStyles } = createStyles(ui);

  const blocked = disabled || loading;
  const spinnerColor =
    variant === 'destructive'
      ? colors.error
      : variant === 'primary' && !blocked
        ? colors.onAccent
        : colors.accent;

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={expanded === undefined ? { disabled: blocked, busy: loading } : { disabled: blocked, busy: loading, expanded }}
      disabled={blocked}
      onPress={onPress}
      // Android-native press response: a bounded ripple over the existing pressed fill (the
      // Material state layer). The system owns its timing, so "Remove animations" also applies.
      android_ripple={{ color: rippleColor(ui, variant), borderless: false, foreground: true }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        variant === 'primary' && pressed && !blocked ? styles.primaryPressed : null,
        variant !== 'primary' && pressed && !blocked
          ? variant === 'compact' ? styles.compactPressed : styles.pressed
          : null,
        blocked ? styles.blocked : null,
        blocked && variant === 'ghost' ? styles.blockedGhost : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : icon ? (
        <>
          <SymbolView pointerEvents="none" accessible={false} name={icon} size={size.icon} tintColor={blocked ? colors.textSecondary : variant === 'primary' || variant === 'compact' ? colors.onAccent : variant === 'destructive' ? colors.error : colors.accent} />
          <Text style={[styles.label, labelStyles[variant], blocked ? styles.blockedLabel : null]}>{label}</Text>
        </>
      ) : (
        <Text style={[styles.label, labelStyles[variant], blocked ? styles.blockedLabel : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Ripple ink: the variant's own foreground colour at low strength, never a new palette colour. */
export function rippleColor(ui: UiTheme, variant: AppButtonVariant): string {
  const { colors } = ui;
  if (variant === 'primary' || variant === 'compact') return `${colors.onAccent}33`;
  if (variant === 'destructive') return `${colors.error}24`;
  return `${colors.accent}24`;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minWidth: 48,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
  },
  pressed: {
    backgroundColor: colors.accentSubtle,
  },
  compactPressed: {
    backgroundColor: colors.accentPressed,
  },
  blocked: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.controlBorder,
  },
  // A blocked text action stays a flat, borderless line of muted text (a countdown, "Resend in 30s")
  // rather than a grey slab; the grey fill is for blocked filled and outlined controls.
  blockedGhost: {
    backgroundColor: 'transparent',
  },
  blockedLabel: {
    color: colors.textSecondary,
  },
  label: {
    textAlign: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    alignSelf: 'stretch',
    minHeight: size.primaryButton,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: size.secondaryButton,
    borderRadius: radius.control,
    backgroundColor: 'transparent',
  },
  ghost: {
    borderWidth: 0,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    minHeight: size.ghostButton,
    backgroundColor: 'transparent',
  },
  destructive: {
    alignSelf: 'stretch',
    minHeight: size.secondaryButton,
    borderRadius: radius.control,
    backgroundColor: 'transparent',
    borderColor: colors.error,
  },
  compact: {
    minHeight: size.compactButton,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
  },
  inverse: {
    alignSelf: 'stretch',
    minHeight: size.primaryButton,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    ...type.button,
    color: colors.onAccent,
  },
  secondary: {
    ...type.button,
    color: colors.accent,
  },
  ghost: {
    ...type.label,
    color: colors.accent,
  },
  destructive: {
    ...type.button,
    color: colors.error,
  },
  compact: {
    ...type.label,
    color: colors.onAccent,
  },
  inverse: {
    ...type.button,
    color: colors.accent,
  },
});

  return { styles, variantStyles, labelStyles };
}
