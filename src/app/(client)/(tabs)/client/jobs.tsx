import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/app-card';
import { AppChip } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import { formatClientPostedPaymentLine } from '@/lib/job-payment';
import { useClientJobs } from '@/providers/client-jobs-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

function formatSchedule(iso: string | null): string {
  return formatCardDateTime(iso) ?? 'No schedule';
}

export default function ClientJobs() {
  const { isLoading, loadError, jobs } = useClientJobs();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {isLoading ? (
        <InlineStatus variant="loading" message="Loading your jobs…" />
      ) : loadError ? (
        <InlineStatus variant="error" message={loadError} />
      ) : jobs.length === 0 ? (
        <InlineStatus variant="empty" message="You have not posted a job yet." />
      ) : (
        jobs.map((job) => (
          <AppCard key={job.id}>
            <Text style={styles.cardTitle}>{job.title}</Text>
            <AppChip label={`Status: ${job.status}`} variant="neutral" />
            <View style={styles.meta}>
              <Text style={styles.cardLine}>Schedule: {formatSchedule(job.scheduled_at)}</Text>
              <Text style={styles.cardLine}>
                Budget: {job.budget === null ? 'Not set' : job.budget}
              </Text>
              {job.payment_method_readable ? (
                <Text style={styles.cardLine}>{formatClientPostedPaymentLine(job.payment_method)}</Text>
              ) : null}
              <Text style={styles.cardLine}>
                Skills: {job.skills.length > 0 ? job.skills.join(', ') : 'None'}
              </Text>
            </View>
          </AppCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
    gap: spacing.lg,
  },
  cardTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  meta: {
    gap: spacing.xs,
  },
  cardLine: {
    ...type.helper,
    color: colors.textSecondary,
  },
});
