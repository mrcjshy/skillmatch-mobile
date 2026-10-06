import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import type { CatalogSkill } from '@/lib/skill-catalog';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type SelectedSkillChipsProps = {
  skills: readonly CatalogSkill[];
  onRemove: (skillId: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  renderAfterSkill?: (skill: CatalogSkill) => ReactNode;
};

export function SelectedSkillChips({
  skills,
  onRemove,
  disabled = false,
  emptyLabel = 'No skills selected yet.',
  renderAfterSkill,
}: SelectedSkillChipsProps) {
  if (skills.length === 0) {
    return <Text style={styles.note}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {skills.map((skill) => (
        <View key={skill.id} style={styles.block}>
          <View style={styles.chip}>
            <Text style={styles.name}>
              ✓ {skill.skill_name}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.remove,
                pressed && !disabled && styles.removePressed,
                disabled && styles.disabled,
              ]}
              onPress={() => onRemove(skill.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${skill.skill_name}`}
              accessibilityState={{ disabled }}
            >
              <Text style={[styles.removeText, disabled && styles.disabledText]}>Remove</Text>
            </Pressable>
          </View>
          {renderAfterSkill?.(skill)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  block: { width: '100%', gap: spacing.sm },
  note: { ...type.helper, color: colors.textSecondary },
  chip: {
    minHeight: size.ghostButton,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.selected,
  },
  name: {
    flex: 1,
    flexShrink: 1,
    ...type.bodyEmphasis,
    color: colors.primary,
  },
  remove: {
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: 'transparent',
    paddingVertical: spacing.sm,
    minHeight: size.ghostButton,
    minWidth: size.ghostButton,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  removeText: {
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'center',
    ...type.helper,
    fontWeight: '600',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  removePressed: { backgroundColor: colors.surface },
  disabled: { backgroundColor: colors.surfaceSubtle },
  disabledText: { color: colors.textSecondary },
});
