import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChip } from '@/components/app-chip';
import { SkillMatchTheme } from '@/constants/theme';
import {
  JOB_OPPORTUNITY_COPY,
  compactOpportunityFields,
  type JobOpportunity,
} from '@/lib/job-opportunities';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

export function JobOpportunityCompactCard({
  opportunity,
  primarySkillName,
  onPress,
}: {
  opportunity: JobOpportunity;
  primarySkillName?: string | null;
  onPress: () => void;
}) {
  const fields = compactOpportunityFields(opportunity, primarySkillName);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${fields.title}, ${fields.matchLine}. View job opportunity details`}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {fields.title}
        </Text>
        {fields.primarySkillName ? (
          <AppChip label={fields.primarySkillName} variant="selected" />
        ) : null}
      </View>

      {fields.descriptionPreview ? (
        <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">
          {fields.descriptionPreview}
        </Text>
      ) : null}

      {fields.schedule ? <Text style={styles.primaryLine}>{fields.schedule}</Text> : null}
      <View style={styles.metaRow}>
        {fields.budget ? <Text style={styles.meta}>{fields.budget}</Text> : null}
        {fields.area ? (
          <Text style={styles.meta} numberOfLines={1}>
            {fields.area}
          </Text>
        ) : null}
      </View>
      <Text style={styles.match}>{fields.matchLine}</Text>

      <Text style={styles.affordance}>{JOB_OPPORTUNITY_COPY.viewDetails}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.72 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: {
    flex: 1,
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  description: {
    ...type.helper,
    color: colors.textSecondary,
  },
  primaryLine: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  match: {
    ...type.helper,
    color: colors.textSecondary,
  },
  affordance: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
});
