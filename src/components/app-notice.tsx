import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

export type AppNoticeVariant = 'warning' | 'danger' | 'success';

type AppNoticeProps = {
  message: string;
  variant?: AppNoticeVariant;
  style?: StyleProp<ViewStyle>;
};

export function AppNotice({ message, variant = 'warning', style }: AppNoticeProps) {
  return (
    <View style={[styles.base, fillStyles[variant], style]}>
      <Text style={[styles.message, textStyles[variant]]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  message: {
    ...type.helper,
  },
});

const fillStyles = StyleSheet.create({
  warning: { backgroundColor: colors.warningTint },
  danger: { backgroundColor: colors.dangerTint },
  success: { backgroundColor: colors.accentSoft },
});

const textStyles = StyleSheet.create({
  warning: { color: colors.warning },
  danger: { color: colors.danger },
  success: { color: colors.success },
});
