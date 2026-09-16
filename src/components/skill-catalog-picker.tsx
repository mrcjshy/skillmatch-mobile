import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { filterSkills, type CatalogSkill } from '@/lib/skill-catalog';

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
      <TextInput
        style={styles.search}
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
  wrap: { gap: 8 },
  search: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: SkillMatchTheme.surface.default,
    color: SkillMatchTheme.text.primary,
  },
  note: { fontSize: 14, color: SkillMatchTheme.text.secondary },
  skillBlock: { gap: 8 },
  skillToggle: {
    minHeight: SkillMatchTheme.size.iconTarget,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
  },
  skillToggleSelected: {
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
  },
  skillText: { fontSize: 16, color: SkillMatchTheme.text.primary, flexShrink: 1 },
  skillTextSelected: { color: SkillMatchTheme.brand.primary, fontWeight: '600' },
});
