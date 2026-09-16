import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing } = SkillMatchTheme.ui;

export type InlineStatusVariant = 'loading' | 'empty' | 'error' | 'note';

type InlineStatusProps = {
  variant?: InlineStatusVariant;
  message: string;
  headline?: string;
  loading?: boolean;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function InlineStatus({
  variant = 'note',
  message,
  headline,
  loading = false,
  action,
  style,
}: InlineStatusProps) {
  const showSpinner = variant === 'loading' || loading;
  const messageColor = variant === 'error' ? colors.danger : colors.textSecondary;

  return (
    <View style={[styles.wrap, style]}>
      {showSpinner ? <ActivityIndicator color={colors.primary} /> : null}
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      <Text style={[styles.message, { color: messageColor }]}>{message}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  headline: {
    ...type.screenTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...type.helper,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
