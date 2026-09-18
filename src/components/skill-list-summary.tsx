import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import type { CatalogSkill } from '@/lib/skill-catalog';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

const MORE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export type SkillListSummaryItem = Pick<CatalogSkill, 'id' | 'skill_name'>;

export type SkillListSummaryProps = {
  skills: readonly SkillListSummaryItem[];
  /** How many skill names to show before collapsing. Defaults to 3. */
  maxVisible?: number;
  /** Opens the full read-only list when provided. */
  onPressView?: () => void;
  viewLabel?: string;
  emptyLabel?: string;
};

export function SkillListSummary({
  skills,
  maxVisible = 3,
  onPressView,
  viewLabel = 'View skills',
  emptyLabel = 'No skills yet.',
}: SkillListSummaryProps) {
  if (skills.length === 0) {
    return <Text style={styles.note}>{emptyLabel}</Text>;
  }

  const limit = Math.max(0, Math.floor(maxVisible));
  const visible = skills.slice(0, limit);
  const remaining = skills.length - visible.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {visible.map((skill) => (
          <View key={skill.id} style={styles.chip}>
            <Text style={styles.chipLabel} numberOfLines={1}>
              {skill.skill_name}
            </Text>
          </View>
        ))}
        {remaining > 0 ? (
          onPressView ? (
            <Pressable
              onPress={onPressView}
              hitSlop={MORE_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`View ${remaining} more skills`}
              style={({ pressed }) => [styles.moreChip, pressed && styles.pressed]}
            >
              <Text style={styles.moreLabel}>+{remaining} more</Text>
            </Pressable>
          ) : (
            <View style={styles.moreChip}>
              <Text style={styles.moreLabel}>+{remaining} more</Text>
            </View>
          )
        ) : null}
      </View>
      {onPressView ? (
        <Pressable
          onPress={onPressView}
          accessibilityRole="button"
          accessibilityLabel={viewLabel}
          style={({ pressed }) => [styles.viewAffordance, pressed && styles.pressed]}
        >
          <Text style={styles.viewLabel}>{viewLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...type.helper, color: colors.textSecondary },
  chip: {
    maxWidth: '100%',
    height: size.chipHeight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  chipLabel: {
    ...type.badge,
    fontWeight: '600',
    color: colors.primary,
  },
  moreChip: {
    height: size.chipHeight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.selected,
  },
  moreLabel: {
    ...type.badge,
    color: colors.primary,
  },
  viewAffordance: {
    alignSelf: 'flex-start',
    minHeight: size.ghostButton,
    justifyContent: 'center',
  },
  viewLabel: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
  pressed: { opacity: 0.72 },
});
