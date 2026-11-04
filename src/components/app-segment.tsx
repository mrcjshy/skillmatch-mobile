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
  /** Give long labels their natural width; wrap whole options on narrow windows. */
  contentSized?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppSegment<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  contentSized = false,
  accessibilityLabel,
  style,
}: AppSegmentProps<T>) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, contentSized && styles.trackContentSized, style]}
    >
      {options.map((option, index) => {
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
              contentSized && styles.optionContentSized,
              index > 0 && !contentSized ? styles.optionDivided : null,
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
  // M3 segmented buttons: one outlined pill (>= 3:1) split by dividers; it clips its segments.
  track: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  option: {
    flex: 1,
    minHeight: size.ghostButton,
    minWidth: size.ghostButton,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionDivided: { borderLeftWidth: 1, borderLeftColor: colors.controlBorder },
  // Wrapping choices cannot share one pill: each becomes its own outlined M3 segment.
  trackContentSized: { flexWrap: 'wrap', gap: spacing.xs, borderWidth: 0, borderRadius: radius.control, overflow: 'visible' },
  optionContentSized: { flex: 0, flexBasis: 'auto', flexGrow: 1, flexShrink: 0, maxWidth: '100%', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.controlBorder },
  optionSelected: {
    backgroundColor: colors.accentTonal,
  },
  optionPressed: { backgroundColor: colors.surfaceSunken },
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
