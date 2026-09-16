import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppListRow } from '@/components/app-list-row';
import { AppSegment } from '@/components/app-segment';
import { HomeHeader } from '@/components/home-header';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import { homeGreeting } from '@/lib/home-greeting';
import { firstNameFromFullName } from '@/lib/initials';
import { supabase } from '@/lib/supabase';
import { workerVerificationLabel } from '@/lib/worker-profile';
import { useAccount } from '@/providers/account-provider';
import { AVAILABILITY_OPTIONS, useWorkerProfile } from '@/providers/worker-profile-provider';

const { colors, type, spacing, size } = SkillMatchTheme.ui;
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
  const firstName = firstNameFromFullName(account?.full_name ?? '');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <HomeHeader fullName={fullName} role="worker" variant="chrome" />

      <View style={styles.titleBlock}>
        <Text style={styles.greeting}>{homeGreeting()}</Text>
        <Text
          style={styles.displayTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
          accessibilityRole="header"
        >
          {firstName}
        </Text>
      </View>

      <View style={styles.availabilityBlock}>
        {!isLoading && !loadError && !isVerified ? (
          <AppChip variant="warning" label={workerVerificationLabel(false)} />
        ) : null}
        <Text style={styles.sectionTitle}>Availability</Text>
        <Text style={styles.help}>This is the status used for matching.</Text>
        {isLoading ? (
          <InlineStatus variant="loading" message="Loading your profile…" />
        ) : loadError ? (
          <InlineStatus variant="error" message={loadError} />
        ) : (
          <AppSegment
            options={AVAILABILITY_OPTIONS}
            value={availability}
            onChange={(status) => {
              void persistAvailability(status);
            }}
            disabled={isPersistingAvailability}
            accessibilityLabel="Availability"
            style={styles.availabilitySegment}
          />
        )}
        {isPersistingAvailability ? <ActivityIndicator color={colors.primary} /> : null}
        {persistAvailabilityError ? (
          <InlineStatus variant="error" message={persistAvailabilityError} />
        ) : null}
        {refreshPersistedAvailabilityError ? (
          <InlineStatus variant="error" message={refreshPersistedAvailabilityError} />
        ) : null}
      </View>

      <View style={styles.jobsBlock}>
        <SectionHeader
          title="Job opportunities"
          style={styles.sectionHeader}
          trailing={
            availability === 'available' ? (
              <AppButton
                variant="ghost"
                label="View all"
                onPress={() => router.push('/worker/opportunities')}
                accessibilityLabel="View all job opportunities"
              />
            ) : undefined
          }
        />
        {availability !== 'available' ? (
          <InlineStatus
            variant="note"
            message="Set your status to Available to receive matching job opportunities. Busy and Offline workers are not included in matching."
            style={styles.statusPad}
          />
        ) : oppLoading ? (
          <InlineStatus
            variant="loading"
            message="Loading your opportunities…"
            style={styles.statusPad}
          />
        ) : oppError ? (
          <InlineStatus variant="error" message={oppError} style={styles.statusPad} />
        ) : opportunities.length === 0 ? (
          <InlineStatus
            variant="empty"
            message="No matching job opportunities right now."
            style={styles.statusPad}
          />
        ) : (
          opportunities.map((job, index) => {
            const location = formatLocation(job.barangay, job.city);
            const schedule = formatCardDateTime(job.scheduled_at);
            const subtitle = [location, schedule].filter((part): part is string => part !== null).join(
              ' · '
            );
            return (
              <AppListRow
                key={job.job_id}
                title={job.title}
                subtitle={subtitle.length > 0 ? subtitle : undefined}
                trailing={`Match Score: ${formatPoints(job.total_points)}/100`}
                showDivider={index < opportunities.length - 1}
                style={styles.listRow}
              />
            );
          })
        )}
      </View>

      <AppListRow
        title="Skill Gap"
        subtitle="What a job still needs"
        onPress={() => router.push('/worker/skill-gap')}
        trailing={
          <SymbolView
            name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }}
            size={size.icon}
            tintColor={colors.textSecondary}
          />
        }
        style={styles.listRow}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  titleBlock: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  greeting: {
    ...type.helper,
    color: colors.textSecondary,
  },
  displayTitle: {
    ...type.display,
    color: colors.textPrimary,
  },
  availabilityBlock: {
    paddingHorizontal: spacing.gutter,
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  availabilitySegment: {
    height: 44,
  },
  jobsBlock: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.gutter,
  },
  statusPad: {
    paddingHorizontal: spacing.gutter,
  },
  listRow: {
    paddingHorizontal: spacing.gutter,
  },
});
