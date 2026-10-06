import type { ReactNode } from 'react';
import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { type SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



export type InlineStatusVariant = 'loading' | 'empty' | 'error' | 'note';

type InlineStatusProps = {
  variant?: InlineStatusVariant;
  message: string;
  headline?: string;
  /** Empty-state glyph; defaults to the existing briefcase. */
  icon?: SymbolViewProps['name'];
  /** Decorative empty-state artwork shown in place of the glyph tile (empty variant only). */
  illustration?: ReactNode;
  loading?: boolean;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function InlineStatus({
  variant = 'note',
  message,
  headline,
  icon = { android: 'work_outline', ios: 'briefcase' },
  illustration,
  loading = false,
  action,
  style,
}: InlineStatusProps) {
  const ui = useUiTheme();
  const { colors } = ui;
  const { styles } = createStyles(ui);

  const showSpinner = variant === 'loading' || loading;
  const messageColor = variant === 'error' ? colors.error : colors.textSecondary;

  return (
    <View style={[styles.wrap, variant === 'error' && styles.error, style]}>
      {showSpinner ? <ActivityIndicator color={colors.accent} /> : null}
      {variant === 'empty' && illustration ? illustration : variant === 'empty' ? <View style={styles.emptyIcon} accessible={false} importantForAccessibility="no-hide-descendants">
        <SymbolView name={icon} size={24} tintColor={colors.accent} />
      </View> : null}
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {/* An error is an alert in a polite live region: Android announces it when it appears or its
          words change, once, and an unmounted (cleared) error leaves nothing behind. */}
      <Text
        style={[styles.message, { color: messageColor }]}
        accessibilityRole={variant === 'error' ? 'alert' : undefined}
        accessibilityLiveRegion={variant === 'error' ? 'polite' : undefined}
      >
        {message}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  error: { paddingHorizontal: spacing.lg, borderRadius: radius.card, backgroundColor: colors.errorTint },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
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

  return { styles };
}
