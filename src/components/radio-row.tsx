import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { COBALT_SHEEN, COBALT_SHEEN_PRESSED } from '@/constants/cobalt-material';

type RadioRowProps = {
  label: string;
  /** One plain supporting sentence; leave out when the label is enough. */
  meaning?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** 'cobalt' (Post a job): the chosen row turns lit cobalt with a white mark and white text. */
  appearance?: 'default' | 'cobalt';
};

/**
 * One option of a single-choice group (role, ID type): a full-width row with a radio mark, the
 * label and an optional sentence. Selection is shown by the filled radio, a heavier accent
 * outline and a subtle accent fill; the pressed state never relies on opacity. Text on the
 * subtle and pressed-subtle surfaces uses textPrimary / textSecondary only (never textMuted).
 */
export function RadioRow({ label, meaning, selected, disabled = false, onPress, accessibilityLabel, appearance = 'default' }: RadioRowProps) {
  const styles = createStyles(useUiTheme());
  const solid = appearance === 'cobalt' && selected;
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
        selected ? (solid ? styles.rowCobalt : styles.rowSelected) : null,
        pressed && !disabled ? (selected ? (solid ? styles.pressedCobalt : styles.pressedSelected) : styles.pressed) : null,
      ]}
    >
      <View style={[styles.radio, selected ? (solid ? styles.radioOnCobalt : styles.radioSelected) : null]}>
        {selected ? <View style={[styles.radioDot, solid ? styles.radioDotOnCobalt : null]} /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, solid ? styles.labelOnCobalt : null]}>{label}</Text>
        {meaning ? <Text style={[styles.meaning, solid ? styles.meaningOnCobalt : null]}>{meaning}</Text> : null}
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
    // Cobalt: same 2dp outline and padding as rowSelected, so nothing shifts between states.
    rowCobalt: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
      experimental_backgroundImage: COBALT_SHEEN,
      paddingVertical: spacing.md - 1,
      paddingHorizontal: spacing.lg - 1,
      boxShadow: '0px 10px 22px rgba(28, 58, 166, 0.28)',
    },
    pressedCobalt: { backgroundColor: colors.accentPressed, experimental_backgroundImage: COBALT_SHEEN_PRESSED },
    radioOnCobalt: { borderColor: colors.onAccent },
    radioDotOnCobalt: { backgroundColor: colors.onAccent },
    labelOnCobalt: { color: colors.onAccent },
    meaningOnCobalt: { color: colors.onAccentSecondary },
  });
}
