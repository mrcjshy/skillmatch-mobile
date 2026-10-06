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
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppSegment<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
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
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.optionSelected : null,
              pressed && !disabled ? styles.optionPressed : null,
              disabled ? styles.optionDisabled : null,
            ]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null, disabled ? styles.labelDisabled : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  option: {
    flex: 1,
    minHeight: size.ghostButton,
    minWidth: size.ghostButton,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  optionPressed: { backgroundColor: colors.selected },
  optionDisabled: { backgroundColor: colors.surfaceSubtle, borderColor: colors.controlBorder },
  labelDisabled: { color: colors.textSecondary },
  label: {
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  labelSelected: {
    textDecorationLine: 'underline',
    fontWeight: '700',
    color: colors.primary,
  },
});
