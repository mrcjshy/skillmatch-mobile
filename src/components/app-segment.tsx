import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, spacing, radius, size } = SkillMatchTheme.ui;

export type AppSegmentOption<T extends string> = {
  value: T;
  label: string;
};

type AppSegmentProps<T extends string> = {
  options: readonly AppSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppSegment<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: AppSegmentProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected ? styles.optionSelected : null]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: size.segmentHeight,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  option: {
    flex: 1,
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  labelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
});
