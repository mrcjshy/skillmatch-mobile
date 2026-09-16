import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, radius, size } = SkillMatchTheme.ui;

export type IconCircleVariant = 'neutral' | 'accent';
export type IconCircleSize = 40 | 56;

type IconCircleProps = {
  children?: ReactNode;
  variant?: IconCircleVariant;
  size?: IconCircleSize;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconCircle({
  children,
  variant = 'neutral',
  size: circleSize = 40,
  accessibilityLabel,
  style,
}: IconCircleProps) {
  const dimension = circleSize === 56 ? size.actionCircle : size.iconCircle;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[
        styles.base,
        {
          width: dimension,
          height: dimension,
          borderRadius: radius.pill,
          backgroundColor: variant === 'accent' ? colors.accent : colors.surfaceSubtle,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
