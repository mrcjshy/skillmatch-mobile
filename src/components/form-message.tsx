import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type FormMessageTone = 'error' | 'warning' | 'success' | 'info';

type FormMessageProps = {
  message: string;
  tone?: FormMessageTone;
  style?: StyleProp<ViewStyle>;
};

const ICONS = {
  error: { android: 'error', ios: 'exclamationmark.circle' },
  warning: { android: 'warning', ios: 'exclamationmark.triangle' },
  success: { android: 'check_circle', ios: 'checkmark.circle' },
  info: { android: 'info', ios: 'info.circle' },
} as const;

/**
 * Form-level message (server failure, session state, success). Always an icon plus words, never
 * colour alone, and announced politely to TalkBack. Field-specific validation uses the field's own
 * `errorText` so the message sits directly under the control it describes.
 */
export function FormMessage({ message, tone = 'info', style }: FormMessageProps) {
  const ui = useUiTheme();
  const { colors } = ui;
  const { styles, fills, inks } = createStyles(ui);

  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.base, fills[tone], style]}
    >
      <AppSymbol
        synchronousGlyph
        pointerEvents="none"
        accessible={false}
        name={ICONS[tone]}
        size={20}
        tintColor={
          tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.accent
        }
      />
      <Text style={[styles.text, inks[tone]]}>{message}</Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
  const styles = StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.control,
      borderCurve: 'continuous',
    },
    text: {
      ...type.body,
      flex: 1,
      flexShrink: 1,
    },
  });
  const fills = StyleSheet.create({
    error: { backgroundColor: colors.errorTint },
    warning: { backgroundColor: colors.warningTint },
    success: { backgroundColor: colors.successTint },
    info: { backgroundColor: colors.accentSubtle },
  });
  const inks = StyleSheet.create({
    error: { color: colors.error },
    warning: { color: colors.warning },
    success: { color: colors.success },
    // Info text uses the primary ink: textMuted is never placed on a pressed accent surface.
    info: { color: colors.textPrimary },
  });
  return { styles, fills, inks };
}
