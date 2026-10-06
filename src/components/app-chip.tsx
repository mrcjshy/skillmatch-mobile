import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



export type AppChipVariant = 'neutral' | 'selected' | 'info' | 'positive' | 'warning' | 'danger';

type AppChipProps = {
  label: string;
  variant?: AppChipVariant;
  style?: StyleProp<ViewStyle>;
};

export function AppChip({ label, variant = 'neutral', style }: AppChipProps) {
  const ui = useUiTheme();
  const { styles, variantStyles, labelStyles } = createStyles(ui);

  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  base: {
    minHeight: size.chipHeight,
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...type.badge,
    maxWidth: '100%',
    flexShrink: 1,
  },
});

const variantStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceSunken },
  selected: { backgroundColor: colors.accentSubtle },
  info: { backgroundColor: colors.infoTint },
  positive: { backgroundColor: colors.successTint },
  warning: { backgroundColor: colors.warningTint },
  danger: { backgroundColor: colors.errorTint },
});

const labelStyles = StyleSheet.create({
  neutral: { color: colors.textPrimary },
  selected: { color: colors.accent },
  info: { color: colors.info },
  positive: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.error },
});

  return { styles, variantStyles, labelStyles };
}
