import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



export type AppNoticeVariant = 'info' | 'warning' | 'danger' | 'success';

type AppNoticeProps = {
  message: string;
  variant?: AppNoticeVariant;
  style?: StyleProp<ViewStyle>;
};

export function AppNotice({ message, variant = 'warning', style }: AppNoticeProps) {
  const ui = useUiTheme();
  const { styles, fillStyles, textStyles } = createStyles(ui);

  return (
    <View style={[styles.base, fillStyles[variant], style]}>
      {/* A danger notice is an error: an alert in a polite live region (see InlineStatus). */}
      <Text
        style={[styles.message, textStyles[variant]]}
        accessibilityRole={variant === 'danger' ? 'alert' : undefined}
        accessibilityLiveRegion={variant === 'danger' ? 'polite' : undefined}
      >
        {message}
      </Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
const styles = StyleSheet.create({
  base: {
    borderRadius: radius.control,
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  message: {
    ...type.helper,
  },
});

const fillStyles = StyleSheet.create({
  info: { backgroundColor: colors.infoTint },
  warning: { backgroundColor: colors.warningTint },
  danger: { backgroundColor: colors.errorTint },
  success: { backgroundColor: colors.successTint },
});

const textStyles = StyleSheet.create({
  info: { color: colors.info },
  warning: { color: colors.warning },
  danger: { color: colors.error },
  success: { color: colors.success },
});

  return { styles, fillStyles, textStyles };
}
