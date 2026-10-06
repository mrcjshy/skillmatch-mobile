import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { groupedRowStyle, type GroupPosition } from '@/components/grouped-row';
import { ServiceMark } from '@/components/service-mark';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { compactOpportunityFields, type JobOpportunity } from '@/lib/job-opportunities';

/**
 * A job opportunity as one row of a grouped list. Reading order follows what a Worker decides on:
 * the work, the skill it needs, where (area only) and when, then the budget and the match cue.
 * There is no card chrome of its own: `position` places the row in its group, so a long list reads as
 * one surface of rows. Only the general area is shown here, never an exact address.
 */
export function JobOpportunityCompactCard({ opportunity, primarySkillName, compact = false, onPress, position = 'only' }: {
  opportunity: JobOpportunity; primarySkillName?: string | null; compact?: boolean; onPress: () => void; position?: GroupPosition;
}) {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  const fields = compactOpportunityFields(opportunity, primarySkillName);
  return <Pressable
    style={({ pressed }) => [styles.row, groupedRowStyle(ui, position), pressed && styles.pressed]}
    onPress={onPress} accessibilityRole="button"
    accessibilityLabel={fields.title + ', ' + fields.matchLine + '. View job opportunity details'}>
    <ServiceMark subject={fields.primarySkillName || fields.title} />
    <View style={styles.copy}>
      <Text style={styles.title}>{fields.title}</Text>
      {fields.primarySkillName ? <Text style={styles.skill}>{fields.primarySkillName}</Text> : null}
      {fields.area ? <View style={styles.fact}><SymbolView name={{ android: 'location_on', ios: 'mappin' }} size={16} tintColor={colors.textSecondary} /><Text style={styles.meta}>{fields.area}</Text></View> : null}
      {fields.schedule ? <View style={styles.fact}><SymbolView name={{ android: 'schedule', ios: 'clock' }} size={16} tintColor={colors.textSecondary} /><Text style={styles.meta}>{fields.schedule}</Text></View> : null}
      {!compact && fields.descriptionPreview ? <Text style={styles.description}>{fields.descriptionPreview}</Text> : null}
      <View style={styles.footer}>
        {fields.budget ? <Text style={styles.budget}>{fields.budget}</Text> : null}
        <Text style={styles.match}>{fields.matchLine}</Text>
      </View>
    </View>
    <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right' }} size={20} tintColor={colors.textSecondary} />
  </Pressable>;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: size.listRowMinHeight, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, maxWidth: '100%' },
    pressed: { backgroundColor: colors.surfaceSunken },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { ...type.bodyEmphasis, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
    skill: { ...type.label, color: colors.accent, flexShrink: 1, maxWidth: '100%' },
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, maxWidth: '100%' },
    meta: { ...type.helper, color: colors.textSecondary, flexShrink: 1, maxWidth: '100%' },
    description: { ...type.helper, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
    footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.md, rowGap: spacing.xs, maxWidth: '100%', paddingTop: spacing.xs },
    budget: { ...type.numeric, fontSize: 16, lineHeight: 24, color: colors.textPrimary, maxWidth: '100%', flexShrink: 1 },
    match: { ...type.helper, color: colors.textSecondary, flexShrink: 1, maxWidth: '100%' },
  });

  return styles;
}
