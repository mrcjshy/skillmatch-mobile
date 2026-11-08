import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { loadSkillCategories, skillChipItems } from '@/lib/skill-categories';

/**
 * SKL-02 (owner, 2026-11-06): a Worker's skills as separate pills, each with a dot in its catalog
 * category's colour and grouped by category, instead of one long dot-separated line.
 */
export function SkillChips({ skills }: { skills: readonly string[] }) {
  const styles = createStyles(useUiTheme());
  const [categories, setCategories] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let active = true;
    loadSkillCategories().then((map) => { if (active) setCategories(map); }, () => undefined);
    return () => { active = false; };
  }, []);
  return (
    <View style={styles.wrap}>
      {skillChipItems(skills, categories).map((item) => (
        <View key={item.name} style={styles.chip} accessible
          accessibilityLabel={item.category === null ? item.name : `${item.name}, ${item.category}`}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.label}>{item.name}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  return StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + spacing.xxs,
      minHeight: size.chipHeight,
      maxWidth: '100%',
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSunken,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { ...type.badge, color: colors.textPrimary, flexShrink: 1 },
  });
}
