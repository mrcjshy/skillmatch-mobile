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
        <Text style={styles.title}>
          {fields.title}
        </Text>
        {fields.primarySkillName ? (
          <AppChip label={fields.primarySkillName} variant="selected" />
        ) : null}
      </View>

      {fields.descriptionPreview ? (
        <Text style={styles.description}>
          {fields.descriptionPreview}
        </Text>
      ) : null}

      {fields.schedule ? <Text style={styles.primaryLine}>{fields.schedule}</Text> : null}
      <View style={styles.metaRow}>
        {fields.budget ? <Text style={styles.meta}>{fields.budget}</Text> : null}
        {fields.area ? (
          <Text style={styles.meta}>
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
  pressed: { backgroundColor: colors.surfaceSubtle },
  topRow: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '100%', gap: spacing.sm },
  title: {
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  description: {
    maxWidth: '100%',
    flexShrink: 1,
    ...type.helper,
    color: colors.textSecondary,
  },
  primaryLine: {
    maxWidth: '100%',
    flexShrink: 1,
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', gap: spacing.sm },
  meta: {
    maxWidth: '100%',
    flexShrink: 1,
    ...type.helper,
    color: colors.textSecondary,
  },
  match: {
    maxWidth: '100%',
    flexShrink: 1,
    ...type.helper,
    color: colors.textSecondary,
  },
  affordance: {
    maxWidth: '100%',
    flexShrink: 1,
    ...type.bodyEmphasis,
    color: colors.primary,
  },
});
