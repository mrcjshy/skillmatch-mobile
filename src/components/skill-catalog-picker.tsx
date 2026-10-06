import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppSymbol } from '@/components/app-symbol';
import { groupPosition, groupedRowStyle } from '@/components/grouped-row';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { filterSkills, type CatalogSkill } from '@/lib/skill-catalog';



type SkillCatalogPickerProps = {
  skills: readonly CatalogSkill[];
  query: string;
  onQueryChange: (value: string) => void;
  isSkillSelected: (skillId: string) => boolean;
  onToggleSkill: (skillId: string) => void;
  disabled?: boolean;
  renderAfterSkill?: (skill: CatalogSkill) => ReactNode;
  /** A short word shown at the end of a selected row, such as its place in an ordered choice. */
  badgeForSkill?: (skill: CatalogSkill) => string | null;
  /** True for an unselected skill that cannot be chosen right now, such as when a limit is reached. */
  isSkillUnavailable?: (skillId: string) => boolean;
};

export function SkillCatalogPicker({
  skills,
  query,
  onQueryChange,
  isSkillSelected,
  onToggleSkill,
  disabled = false,
  renderAfterSkill,
  badgeForSkill,
  isSkillUnavailable,
}: SkillCatalogPickerProps) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

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
        <View style={styles.list}>
          {visible.map((skill, index) => {
            const selected = isSkillSelected(skill.id);
            const badge = selected ? badgeForSkill?.(skill) ?? null : null;
            const rowDisabled = disabled || (!selected && (isSkillUnavailable?.(skill.id) ?? false));
            return (
              <View key={skill.id} style={groupedRowStyle(ui, groupPosition(index, visible.length))}>
                <Pressable
                  style={({ pressed }) => [
                    styles.skillToggle,
                    selected && styles.skillToggleSelected,
                    pressed && !rowDisabled && styles.skillTogglePressed,
                  ]}
                  onPress={() => onToggleSkill(skill.id)}
                  disabled={rowDisabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: rowDisabled }}
                  accessibilityLabel={badge ? `${skill.skill_name}, ${badge}` : skill.skill_name}
                >
                  <View style={[styles.check, selected && styles.checkSelected, rowDisabled && styles.checkDisabled]} accessible={false} importantForAccessibility="no-hide-descendants">
                    {selected ? <AppSymbol name={{ android: 'check', ios: 'checkmark' }} size={16} tintColor={ui.colors.onAccent} /> : null}
                  </View>
                  <Text style={[styles.skillText, selected && styles.skillTextSelected, rowDisabled && styles.skillTextDisabled]}>
                    {skill.skill_name}
                  </Text>
                  {badge ? <AppChip label={badge} variant="neutral" style={styles.badge} /> : null}
                </Pressable>
                {selected ? renderAfterSkill?.(skill) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  note: { ...type.helper, color: colors.textSecondary },
  list: {},
  skillToggle: {
    minHeight: size.listRowMinHeight,
    minWidth: size.ghostButton,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  skillToggleSelected: {
    backgroundColor: colors.accentSubtle,
  },
  skillTogglePressed: { backgroundColor: colors.surfaceSunken },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkDisabled: { backgroundColor: colors.surfaceSunken, borderColor: colors.controlBorder },
  skillTextDisabled: { color: colors.textSecondary },
  skillText: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
    flexGrow: 1,
  },
  // Sits on the selected (tinted) row, so it uses the white surface rather than a second tint.
  badge: { backgroundColor: colors.surface, flexShrink: 0 },
  skillTextSelected: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
});

  return { styles };
}
