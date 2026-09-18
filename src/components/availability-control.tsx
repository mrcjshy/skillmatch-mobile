import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  AVAILABILITY_CONTROL_OPTIONS,
  presentAvailabilityControlValue,
  type AvailabilityControlPresentedValue,
  type WorkerProfileWriteAvailability,
} from '@/lib/worker-profile';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type AvailabilityControlProps = {
  value: WorkerProfileWriteAvailability;
  onChange: (value: AvailabilityControlPresentedValue) => void;
  disabled?: boolean;
};

export function AvailabilityControl({
  value,
  onChange,
  disabled = false,
}: AvailabilityControlProps) {
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
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && !disabled ? styles.triggerPressed : null,
          disabled ? styles.triggerDisabled : null,
        ]}
      >
        <Text style={styles.triggerLabel}>{selectedOption.label}</Text>
        <Text style={styles.caret} accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close availability options"
            style={StyleSheet.absoluteFill}
            onPress={close}
          />
          <View style={styles.menu} accessibilityRole="menu">
            <Text style={styles.menuTitle}>Availability</Text>
            {AVAILABILITY_CONTROL_OPTIONS.map((option) => {
              const selected = option.value === presented;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  onPress={() => selectOption(option.value)}
                  style={({ pressed }) => [
                    styles.option,
                    selected ? styles.optionSelected : null,
                    pressed ? styles.optionPressed : null,
                  ]}
                >
                  <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: size.fieldHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderCurve: 'continuous',
  },
  triggerPressed: {
    borderColor: colors.primary,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerLabel: {
    ...type.body,
    color: colors.textPrimary,
  },
  caret: {
    ...type.bodyEmphasis,
    color: colors.textSecondary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.overlay,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  menuTitle: {
    ...type.sectionTitle,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  option: {
    minHeight: size.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  optionSelected: {
    backgroundColor: colors.accentSoft,
  },
  optionPressed: {
    opacity: 0.72,
  },
  optionLabel: {
    ...type.bodyEmphasis,
    color: colors.textSecondary,
  },
  optionLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
