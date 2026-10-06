import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSheet } from '@/components/app-sheet';
import { AppSymbol } from '@/components/app-symbol';
import { RadioRow } from '@/components/radio-row';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  AVAILABILITY_CONTROL_OPTIONS,
  presentAvailabilityControlValue,
  type AvailabilityControlPresentedValue,
  type WorkerProfileWriteAvailability,
} from '@/lib/worker-profile';

type AvailabilityControlProps = {
  value: WorkerProfileWriteAvailability;
  onChange: (value: AvailabilityControlPresentedValue) => void;
  disabled?: boolean;
  /** Home header form: the status word and a chevron on one line, without the row caption. */
  compact?: boolean;
};

const OPTION_MEANING: Record<AvailabilityControlPresentedValue, string> = {
  available: 'See jobs that match your skills.',
  busy: 'Pause matching for new work.',
};

/**
 * The Worker's work status: a row showing the current state that opens the shared bottom sheet.
 * Opening changes nothing; a status is applied only by choosing it. Choosing the current status just
 * closes the sheet. Choices still apply immediately and independently of any profile save.
 */
export function AvailabilityControl({ value, onChange, disabled = false, compact = false }: AvailabilityControlProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const styles = createStyles(ui);

  const [open, setOpen] = useState(false);
  const presented = presentAvailabilityControlValue(value);
  const selectedOption =
    AVAILABILITY_CONTROL_OPTIONS.find((option) => option.value === presented) ??
    AVAILABILITY_CONTROL_OPTIONS[1];

  function close() {
    setOpen(false);
  }

  function selectOption(next: AvailabilityControlPresentedValue) {
    close();
    if (next === presentAvailabilityControlValue(value)) return;
    onChange(next);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Availability"
        accessibilityValue={{ text: selectedOption.label }}
        accessibilityHint="Choose whether you are available for new work"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [compact ? styles.compactRow : styles.row, pressed && !disabled ? styles.pressed : null]}
      >
        <View style={[compact ? null : styles.mark, compact ? null : presented === 'available' ? styles.markAvailable : styles.markBusy]} accessible={false} importantForAccessibility="no-hide-descendants">
          <AppSymbol
            name={{
              android: presented === 'available' ? 'check_circle' : 'pause',
              ios: presented === 'available' ? 'checkmark.circle.fill' : 'pause.circle.fill',
            }}
            size={size.icon}
            tintColor={presented === 'available' ? colors.success : colors.textSecondary}
          />
        </View>
        <View style={compact ? styles.compactCopy : styles.copy}>
          {compact ? null : <Text style={styles.caption}>Work status</Text>}
          <Text style={[styles.value, disabled ? styles.valueDisabled : null]}>{selectedOption.label}</Text>
        </View>
        <AppSymbol
          name={{ android: 'expand_more', ios: 'chevron.down' }}
          size={size.icon}
          tintColor={disabled ? colors.textMuted : colors.textSecondary}
        />
      </Pressable>

      <AppSheet visible={open} onClose={close} title="Work status">
        <Text style={styles.help}>Changes apply immediately.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Work status" style={styles.options}>
          {AVAILABILITY_CONTROL_OPTIONS.map((option) => (
            <RadioRow
              key={option.value}
              label={option.label}
              meaning={OPTION_MEANING[option.value]}
              selected={option.value === presented}
              accessibilityLabel={option.label}
              onPress={() => selectOption(option.value)}
            />
          ))}
        </View>
      </AppSheet>
    </>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  return StyleSheet.create({
    row: {
      minHeight: size.listRowMinHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    // Hugs its content at the start of the line; still a full 48dp target.
    compactRow: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      minHeight: size.minTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingRight: spacing.sm,
      borderRadius: radius.control,
    },
    compactCopy: { flexShrink: 1, minWidth: 0 },
    pressed: { backgroundColor: colors.surfaceSunken },
    mark: { width: size.iconCircle, height: size.iconCircle, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    markAvailable: { backgroundColor: colors.successTint },
    markBusy: { backgroundColor: colors.surfaceSunken },
    copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
    caption: { ...type.helper, color: colors.textSecondary },
    value: { ...type.bodyEmphasis, color: colors.textPrimary },
    valueDisabled: { color: colors.textSecondary },
    help: { ...type.body, color: colors.textSecondary },
    options: { gap: spacing.sm, paddingBottom: spacing.sm },
  });
}
