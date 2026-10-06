import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



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
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

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

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  // One outer boundary (>= 3:1) identifies the control; the options inside stay quiet.
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  option: {
    flex: 1,
    minHeight: size.ghostButton,
    minWidth: size.ghostButton,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
  },
  optionPressed: { backgroundColor: colors.accentSubtle },
  optionDisabled: { backgroundColor: 'transparent', borderColor: 'transparent' },
  labelDisabled: { color: colors.textSecondary },
  label: {
    ...type.label,
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'center',
    color: colors.textSecondary,
  },
  // Selection is a heavier weight, the accent colour and the raised white pill; never an underline.
  labelSelected: {
    fontWeight: '700',
    color: colors.accent,
  },
});

  return { styles };
}
