import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSheet } from '@/components/app-sheet';
import { AppSymbol } from '@/components/app-symbol';
import { RadioRow } from '@/components/radio-row';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type AppSelectOption<T extends string> = { value: T; label: string };

type AppSelectProps<T extends string> = {
  label: string;
  options: readonly AppSelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  errorText?: string;
};

/**
 * A dropdown field: looks like an AppField (label above, bordered box, chevron) and opens a bottom
 * sheet of radio rows. Choosing one closes the sheet. No native picker module is needed.
 */
export function AppSelect<T extends string>({ label, options, value, onChange, placeholder = 'Choose one', disabled = false, errorText }: AppSelectProps<T>) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not chosen'}`}
        accessibilityHint="Opens a list to choose from"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, errorText ? styles.fieldError : null, disabled ? styles.fieldDisabled : null, pressed ? styles.fieldPressed : null]}
      >
        <Text style={[styles.value, selected ? null : styles.placeholder]} numberOfLines={2}>{selected?.label ?? placeholder}</Text>
        <AppSymbol name={{ android: 'expand_more', ios: 'chevron.down' }} size={22} tintColor={ui.colors.textSecondary} />
      </Pressable>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      <AppSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={styles.options} accessibilityRole="radiogroup">
          {options.map((option) => (
            <RadioRow
              key={option.value}
              label={option.label}
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </AppSheet>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  return StyleSheet.create({
    label: { ...type.label, color: colors.textPrimary, marginBottom: spacing.sm },
    field: {
      minHeight: size.fieldHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
    },
    fieldPressed: { backgroundColor: colors.surfaceSunken },
    fieldError: { borderColor: colors.error },
    fieldDisabled: { backgroundColor: colors.surfaceSunken },
    value: { ...type.body, color: colors.textPrimary, flex: 1, paddingVertical: spacing.sm },
    placeholder: { color: colors.textMuted },
    error: { ...type.helper, color: colors.error, marginTop: spacing.xs },
    options: { gap: spacing.sm },
  });
}
