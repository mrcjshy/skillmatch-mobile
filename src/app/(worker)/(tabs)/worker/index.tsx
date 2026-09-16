import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AvailabilityControl } from '@/components/availability-control';
import { HomeHeader } from '@/components/home-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import { supabase } from '@/lib/supabase';
import { workerVerificationLabel } from '@/lib/worker-profile';
import { useAccount } from '@/providers/account-provider';
import { useWorkerProfile } from '@/providers/worker-profile-provider';

const WORKER_ACCENT = '#9FE870';
const PREVIEW_LIMIT = 3;

type OpportunityPreview = {
  job_id: string;
  title: string;
  barangay: string | null;
  city: string | null;
  scheduled_at: string | null;
  total_points: number;
};

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function toPreview(row: unknown): OpportunityPreview | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const jobId = typeof r.job_id === 'string' ? r.job_id : null;
  const title = typeof r.title === 'string' ? r.title : null;
  const total = toNumber(r.total_points);
  if (jobId === null || title === null || total === null) return null;
  return {
    job_id: jobId,
    title,
    barangay: toNullableText(r.barangay),
    city: toNullableText(r.city),
    scheduled_at: toNullableText(r.scheduled_at),
    total_points: total,
  };
}

function formatLocation(barangay: string | null, city: string | null): string | null {
  const parts = [barangay, city].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

async function loadOpportunityPreview(): Promise<OpportunityPreview[]> {
  const res = await supabase.rpc('list_my_job_opportunities');
  if (res.error) {
    throw new Error(res.error.message || 'The request failed.');
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows
    .map(toPreview)
    .filter((row): row is OpportunityPreview => row !== null)
    .slice(0, PREVIEW_LIMIT);
}

export default function WorkerHome() {
  const { account } = useAccount();
  const {
    availability,
    isLoading,
    loadError,
    isVerified,
    isPersistingAvailability,
    persistAvailabilityError,
    persistAvailability,
    refreshPersistedAvailabilityError,
    refreshPersistedAvailability,
  } = useWorkerProfile();
  const router = useRouter();

  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityPreview[]>([]);

  useFocusEffect(
    useCallback(() => {
      void refreshPersistedAvailability();
    }, [refreshPersistedAvailability])
  );

  const loadPreview = useCallback(async () => {
    const rows = await loadOpportunityPreview();
    setOpportunities(rows);
    setOppError(null);
  }, []);

  useEffect(() => {
    if (isLoading || loadError || availability !== 'available') return;

    let cancelled = false;
    void (async () => {
      setOppLoading(true);
      try {
        await loadPreview();
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof Error && error.message) {
          console.warn('[V2-A] list_my_job_opportunities failed:', error.message);
        }
        setOppError('Unable to load job opportunities. Please try again.');
      } finally {
        if (!cancelled) setOppLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [availability, isLoading, loadError, loadPreview]);

  const fullName = account?.full_name ?? '—';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <HomeHeader fullName={fullName} role="worker" />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Availability</Text>
        <Text style={styles.help}>This is the status used for matching.</Text>
        {isLoading ? (
          <Text style={styles.note}>Loading your profile…</Text>
        ) : loadError ? (
          <Text style={styles.error}>{loadError}</Text>
        ) : (
          <AvailabilityControl
            value={availability}
            onChange={(status) => {
              void persistAvailability(status);
            }}
            disabled={isPersistingAvailability}
            accentColor={WORKER_ACCENT}
          />
        )}
        {isPersistingAvailability ? <ActivityIndicator /> : null}
        {persistAvailabilityError ? <Text style={styles.error}>{persistAvailabilityError}</Text> : null}
        {refreshPersistedAvailabilityError ? (
          <Text style={styles.error}>{refreshPersistedAvailabilityError}</Text>
        ) : null}
        {!isLoading && !loadError && !isVerified ? (
          <Text style={styles.help}>{workerVerificationLabel(false)}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Job opportunities</Text>
        {availability !== 'available' ? (
          <Text style={styles.note}>
            Set your status to Available to receive matching job opportunities. Busy and Offline
            workers are not included in matching.
          </Text>
        ) : oppLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.note}>Loading your opportunities…</Text>
          </View>
        ) : oppError ? (
          <Text style={styles.error}>{oppError}</Text>
        ) : opportunities.length === 0 ? (
          <Text style={styles.note}>No matching job opportunities right now.</Text>
        ) : (
          opportunities.map((job) => {
            const location = formatLocation(job.barangay, job.city);
            const schedule = formatCardDateTime(job.scheduled_at);
            return (
              <View key={job.job_id} style={styles.preview}>
                <Text style={styles.previewTitle}>{job.title}</Text>
                {location ? <Text style={styles.previewLine}>{location}</Text> : null}
                {schedule ? <Text style={styles.previewLine}>{schedule}</Text> : null}
                <Text style={styles.previewScore}>Match Score: {formatPoints(job.total_points)}/100</Text>
              </View>
            );
          })
        )}
        {availability === 'available' ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/worker/opportunities')}
            accessibilityRole="button"
            accessibilityLabel="View all job opportunities"
          >
            <Text style={styles.secondaryButtonText}>View all</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Tools</Text>
      <Pressable
        style={styles.tile}
        onPress={() => router.push('/worker/skill-gap')}
        accessibilityRole="button"
      >
        <Text style={styles.tileTitle}>Skill Gap</Text>
        <Text style={styles.tileHint}>What a job still needs</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 48,
    gap: 12,
    backgroundColor: SkillMatchTheme.brand.background,
  },
  card: {
    marginHorizontal: SkillMatchTheme.spacing.screenGutter,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
    marginHorizontal: SkillMatchTheme.spacing.screenGutter,
  },
  help: {
    fontSize: 13,
    color: SkillMatchTheme.text.secondary,
  },
  note: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
  },
  error: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 14,
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  preview: {
    gap: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: SkillMatchTheme.border.default,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
  },
  previewLine: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
  },
  previewScore: {
    fontSize: 14,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
  },
  secondaryButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  tile: {
    marginHorizontal: SkillMatchTheme.spacing.screenGutter,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 2,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
  },
  tileHint: {
    fontSize: 12,
    color: SkillMatchTheme.text.secondary,
  },
});
