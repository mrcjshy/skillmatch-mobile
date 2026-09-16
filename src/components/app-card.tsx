import type { ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, spacing, radius } = SkillMatchTheme.ui;

export type AppCardVariant = 'default' | 'highlight' | 'status' | 'empty';
export type AppCardTone = 'warning' | 'danger' | 'success';

type AppCardProps = {
  children?: ReactNode;
  variant?: AppCardVariant;
  tone?: AppCardTone;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, variant = 'default', tone, style }: AppCardProps) {
  const statusFill =
    tone === 'danger'
      ? colors.dangerTint
      : tone === 'success'
        ? colors.accentSoft
        : tone === 'warning'
          ? colors.warningTint
          : colors.surfaceSubtle;

  return (
    <View
      style={[
        styles.base,
        variant === 'default' && styles.default,
        variant === 'highlight' && styles.highlight,
        variant === 'status' && [styles.status, { backgroundColor: statusFill }],
        variant === 'empty' && styles.empty,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    gap: spacing.md,
  },
  default: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderCurve: 'continuous',
  },
  highlight: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.gutter,
    borderCurve: 'continuous',
  },
  status: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  empty: {
    backgroundColor: 'transparent',
    padding: spacing.lg,
  },
});
