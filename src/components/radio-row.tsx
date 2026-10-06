import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

type RadioRowProps = {
  label: string;
  /** One plain supporting sentence; leave out when the label is enough. */
  meaning?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * One option of a single-choice group (role, ID type): a full-width row with a radio mark, the
 * label and an optional sentence. Selection is shown by the filled radio, a heavier accent
 * outline and a subtle accent fill; the pressed state never relies on opacity. Text on the
 * subtle and pressed-subtle surfaces uses textPrimary / textSecondary only (never textMuted).
 */
export function RadioRow({ label, meaning, selected, disabled = false, onPress, accessibilityLabel }: RadioRowProps) {
  const styles = createStyles(useUiTheme());
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      accessibilityHint={meaning}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : null,
        pressed && !disabled ? (selected ? styles.pressedSelected : styles.pressed) : null,
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {meaning ? <Text style={styles.meaning}>{meaning}</Text> : null}
      </View>
    </Pressable>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: size.listRowMinHeight,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      backgroundColor: colors.surface,
      borderCurve: 'continuous',
    },
    // The heavier outline takes 1dp from the padding so text never shifts between states.
    rowSelected: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.accentSubtle,
      paddingVertical: spacing.md - 1,
      paddingHorizontal: spacing.lg - 1,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    pressedSelected: { backgroundColor: colors.accentSubtlePressed },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: colors.accent },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
    copy: { flex: 1, gap: spacing.xxs },
    label: { ...type.bodyEmphasis, color: colors.textPrimary },
    meaning: { ...type.helper, color: colors.textSecondary },
  });
}
