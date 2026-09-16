import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

export type AppChipVariant = 'neutral' | 'selected' | 'positive' | 'warning' | 'danger';

type AppChipProps = {
  label: string;
  variant?: AppChipVariant;
  style?: StyleProp<ViewStyle>;
};

export function AppChip({ label, variant = 'neutral', style }: AppChipProps) {
  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: size.chipHeight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...type.badge,
  },
});

const variantStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceSubtle },
  selected: { backgroundColor: colors.selected },
  positive: { backgroundColor: colors.accentSoft },
  warning: { backgroundColor: colors.warningTint },
  danger: { backgroundColor: colors.dangerTint },
});

const labelStyles = StyleSheet.create({
  neutral: { fontWeight: '600', color: colors.primary },
  selected: { color: colors.primary },
  positive: { color: colors.primary },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
});
