import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppField } from '@/components/app-field';
import { SkillMatchTheme } from '@/constants/theme';
import { filterSkills, type CatalogSkill } from '@/lib/skill-catalog';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type SkillCatalogPickerProps = {
  skills: readonly CatalogSkill[];
  query: string;
  onQueryChange: (value: string) => void;
  isSkillSelected: (skillId: string) => boolean;
  onToggleSkill: (skillId: string) => void;
  disabled?: boolean;
  renderAfterSkill?: (skill: CatalogSkill) => ReactNode;
};

export function SkillCatalogPicker({
  skills,
  query,
  onQueryChange,
  isSkillSelected,
  onToggleSkill,
  disabled = false,
  renderAfterSkill,
}: SkillCatalogPickerProps) {
  if (skills.length === 0) {
    return <Text style={styles.note}>No skills are available yet.</Text>;
  }

  const visible = filterSkills(skills, query);

  return (
    <View style={styles.wrap}>
      <AppField
        variant="search"
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search skills"
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search skills"
      />
      {visible.length === 0 ? (
        <Text style={styles.note}>No skills match your search.</Text>
      ) : (
        visible.map((skill) => {
          const selected = isSkillSelected(skill.id);
          return (
            <View key={skill.id} style={styles.skillBlock}>
              <Pressable
                style={[styles.skillToggle, selected && styles.skillToggleSelected]}
                onPress={() => onToggleSkill(skill.id)}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }}
                accessibilityLabel={skill.skill_name}
              >
                <Text style={[styles.skillText, selected && styles.skillTextSelected]} numberOfLines={3}>
                  {selected ? '✓ ' : ''}
                  {skill.skill_name}
                </Text>
              </Pressable>
              {selected ? renderAfterSkill?.(skill) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  note: { ...type.helper, color: colors.textSecondary },
  skillBlock: { gap: spacing.sm },
  skillToggle: {
    minHeight: size.ghostButton,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
  },
  skillToggleSelected: {
    backgroundColor: colors.accentSoft,
  },
  skillText: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  skillTextSelected: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
});
