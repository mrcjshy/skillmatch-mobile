import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  AVAILABILITY_OPTIONS,
  type AvailabilityStatus,
} from '@/providers/worker-profile-provider';

type AvailabilityControlProps = {
  value: AvailabilityStatus;
  onChange: (value: AvailabilityStatus) => void;
  disabled?: boolean;
  accentColor?: string;
};

export function AvailabilityControl({
  value,
  onChange,
  disabled = false,
  accentColor,
}: AvailabilityControlProps) {
  const selectedBorder = accentColor ?? SkillMatchTheme.brand.primary;
  const selectedFill = accentColor ? `${accentColor}33` : SkillMatchTheme.brand.primaryMuted;

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Availability">
      {AVAILABILITY_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.chip,
              selected && { borderColor: selectedBorder, backgroundColor: selectedFill },
            ]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                styles.chipText,
                selected && { color: SkillMatchTheme.brand.primary, fontWeight: '600' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flex: 1,
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SkillMatchTheme.surface.default,
  },
  chipText: {
    fontSize: 16,
    color: SkillMatchTheme.text.primary,
  },
});
