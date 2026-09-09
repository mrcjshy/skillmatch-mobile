import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCardDateTime } from '@/lib/date-time';
import { SkillMatchTheme } from '@/constants/theme';
import { useClientJobs } from '@/providers/client-jobs-provider';

function formatSchedule(iso: string | null): string {
  return formatCardDateTime(iso) ?? 'No schedule';
}

export default function ClientJobs() {
  const { isLoading, loadError, jobs } = useClientJobs();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>Loading your jobs…</Text>
        </View>
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : jobs.length === 0 ? (
        <Text style={styles.note}>You have not posted a job yet.</Text>
      ) : (
        jobs.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.cardTitle}>{job.title}</Text>
            <Text style={styles.cardLine}>Status: {job.status}</Text>
            <Text style={styles.cardLine}>Schedule: {formatSchedule(job.scheduled_at)}</Text>
            <Text style={styles.cardLine}>
              Budget: {job.budget === null ? 'Not set' : job.budget}
            </Text>
            <Text style={styles.cardLine}>
              Skills: {job.skills.length > 0 ? job.skills.join(', ') : 'None'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  note: { fontSize: 14, opacity: 0.7 },
  card: { borderWidth: 1, borderColor: SkillMatchTheme.border.default, borderRadius: SkillMatchTheme.radius.card, padding: SkillMatchTheme.spacing.cardPadding, gap: SkillMatchTheme.spacing.cardGap, backgroundColor: SkillMatchTheme.surface.default },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardLine: { fontSize: 14, opacity: 0.8 },
  error: { color: '#b91c1c', fontSize: 14 },
});
