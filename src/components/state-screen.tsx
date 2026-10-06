import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type StateScreenTone = 'neutral' | 'error' | 'warning' | 'success';

type StateScreenProps = {
  tone?: StateScreenTone;
  /** State cue. Ignored while `loading` (a spinner is the cue). */
  icon?: SymbolViewProps['name'];
  loading?: boolean;
  title: string;
  message?: string;
  /** Recovery actions: one primary first, a secondary only if needed. */
  children?: ReactNode;
};

/**
 * Whole-screen system state (bootstrap error, blocked, loading, not found): cue, concise title,
 * a useful sentence, then the recovery action. Flat, no card. The column scrolls so 130% text
 * and short viewports never clip the action.
 */
export function StateScreen({
  tone = 'neutral',
  icon = { android: 'info', ios: 'info.circle' },
  loading = false,
  title,
  message,
  children,
}: StateScreenProps) {
  const ui = useUiTheme();
  const { colors } = ui;
  const { styles, cueFills } = createStyles(ui);
  const insets = useSafeAreaInsets();
  const cueInk =
    tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.accent;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <ScrollView style={styles.viewport} contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={[styles.cue, cueFills[tone]]} accessible={false} importantForAccessibility="no-hide-descendants">
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <AppSymbol synchronousGlyph name={icon} size={28} tintColor={cueInk} />
            )}
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message ? (
            <Text accessibilityLiveRegion={loading ? 'polite' : undefined} style={styles.message}>
              {message}
            </Text>
          ) : null}
          {children ? <View style={styles.actions}>{children}</View> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    viewport: { flex: 1, overflow: 'hidden' },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.gutter,
      paddingVertical: spacing.xl,
    },
    column: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    cue: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    title: { ...type.screenTitle, color: colors.textPrimary, textAlign: 'center' },
    message: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
    actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  });
  const cueFills = StyleSheet.create({
    neutral: { backgroundColor: colors.accentSubtle },
    error: { backgroundColor: colors.errorTint },
    warning: { backgroundColor: colors.warningTint },
    success: { backgroundColor: colors.successTint },
  });
  return { styles, cueFills };
}
