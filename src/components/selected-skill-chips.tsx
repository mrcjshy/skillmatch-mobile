import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import type { CatalogSkill } from '@/lib/skill-catalog';

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
            <Text style={styles.name} numberOfLines={3}>
              ✓ {skill.skill_name}
            </Text>
            <Pressable
              style={[styles.remove, disabled && styles.disabled]}
              onPress={() => onRemove(skill.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${skill.skill_name}`}
              accessibilityState={{ disabled }}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
          {renderAfterSkill?.(skill)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: { width: '100%', gap: 8 },
  note: { fontSize: 14, color: SkillMatchTheme.text.secondary },
  chip: {
    minHeight: SkillMatchTheme.size.iconTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
  },
  name: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
  },
  remove: {
    minHeight: SkillMatchTheme.size.iconTarget,
    minWidth: SkillMatchTheme.size.iconTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
    textDecorationLine: 'underline',
  },
  disabled: { opacity: 0.6 },
});
