import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

type AppListRowProps = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  showDivider = false,
  accessibilityLabel,
  style,
}: AppListRowProps) {
  const body = (
    <>
      <View style={styles.row}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing ? (
          typeof trailing === 'string' ? (
            <Text style={styles.trailingText}>{trailing}</Text>
          ) : (
            trailing
          )
        ) : null}
      </View>
      {showDivider ? (
        <View style={[styles.divider, leading ? styles.dividerInset : styles.dividerFull]} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.wrap, style]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed ? styles.pressed : null, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: size.listRowMinHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 32,
  },
  leading: {
    width: size.iconCircle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.helper,
    color: colors.textSecondary,
  },
  trailingText: {
    ...type.bodyEmphasis,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  dividerInset: {
    marginLeft: 68 - spacing.lg,
  },
  dividerFull: {
    marginLeft: 0,
  },
});
