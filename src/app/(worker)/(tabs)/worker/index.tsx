import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActiveBookingHomeCard } from '@/components/active-booking-home-card';
import { AppCard } from '@/components/app-card';
import { AppListRow } from '@/components/app-list-row';
import { AvailabilityControl } from '@/components/availability-control';
import { HomeHeader } from '@/components/home-header';
import { InlineStatus } from '@/components/inline-status';
import { JobOpportunityCompactCard } from '@/components/job-opportunity-compact-card';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { loadWorkerBookings, type WorkerBooking } from '@/lib/booking-records';
import { homeGreeting } from '@/lib/home-greeting';
import { firstNameFromFullName } from '@/lib/initials';
import {
  JOB_OPPORTUNITY_COPY,
  loadMyJobOpportunities,
  type JobOpportunity,
} from '@/lib/job-opportunities';
import {
  IDENTITY_COPY,
  getMyIdentitySubmission,
  workerHomeIdentityNotice,
  type IdentityDocumentStatus,
} from '@/lib/worker-identity';
import { useAccount } from '@/providers/account-provider';
import { useWorkerProfile } from '@/providers/worker-profile-provider';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

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
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [bookings, setBookings] = useState<WorkerBooking[]>([]);
  const [identityStatus, setIdentityStatus] = useState<IdentityDocumentStatus | null>(null);
  const [identityReady, setIdentityReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshPersistedAvailability();
      void loadWorkerBookings()
        .then(setBookings)
        .catch(() => {
          setBookings([]);
        });
      void getMyIdentitySubmission()
        .then((row) => {
          setIdentityStatus(row?.status ?? null);
        })
        .catch(() => {
          setIdentityStatus(null);
        })
        .finally(() => {
          setIdentityReady(true);
        });
    }, [refreshPersistedAvailability])
  );

  const loadOpportunities = useCallback(async () => {
    const rows = await loadMyJobOpportunities();
    setOpportunities(rows);
    setOppError(null);
  }, []);

  useEffect(() => {
    if (isLoading || loadError || availability !== 'available') return;

    let cancelled = false;
    void (async () => {
      setOppLoading(true);
      try {
        await loadOpportunities();
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof Error && error.message) {
          console.warn('[V2-A] list_my_job_opportunities failed:', error.message);
        }
        setOppError(JOB_OPPORTUNITY_COPY.loadFailed);
      } finally {
        if (!cancelled) setOppLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [availability, isLoading, loadError, loadOpportunities]);

  const fullName = account?.full_name ?? '—';
  const firstName = firstNameFromFullName(account?.full_name ?? '');
  const identityNotice = workerHomeIdentityNotice(isVerified, identityStatus);

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

      {!isLoading && !loadError && identityReady && identityNotice !== 'none' ? (
        <View style={styles.pendingPad}>
          <AppCard variant="status" tone="warning">
            {identityNotice === 'rejected' ? (
              <>
                <Text style={styles.pendingHeadline}>{IDENTITY_COPY.homeRejectedHeadline}</Text>
                {IDENTITY_COPY.homeRejectedBody.map((line) => (
                  <Text key={line} style={styles.pendingBody}>
                    {line}
                  </Text>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.pendingHeadline}>{IDENTITY_COPY.homePendingHeadline}</Text>
                {IDENTITY_COPY.homePendingBody.map((line) => (
                  <Text key={line} style={styles.pendingBody}>
                    {line}
                  </Text>
                ))}
              </>
            )}
          </AppCard>
        </View>
      ) : null}

      <View style={styles.availabilityBlock}>
        <Text style={styles.sectionTitle}>Availability</Text>
        <Text style={styles.help}>This is the status used for matching.</Text>
        {isLoading ? (
          <InlineStatus variant="loading" message="Loading your profile…" />
        ) : loadError ? (
          <InlineStatus variant="error" message={loadError} />
        ) : (
          <AvailabilityControl
            value={availability}
            onChange={(status) => {
              void persistAvailability(status);
            }}
            disabled={isPersistingAvailability}
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

      <View style={styles.bookingBlock}>
        <ActiveBookingHomeCard
          role="worker"
          bookings={bookings}
          onPressPrimary={(booking) =>
            router.push({
              pathname: '/worker/booking-details',
              params: { bookingId: booking.booking_id },
            } as unknown as Href)
          }
          onPressViewAll={() => router.push('/worker/bookings' as Href)}
        />
      </View>

      <View style={styles.jobsBlock}>
        <SectionHeader title="Job opportunities" style={styles.sectionHeader} />
        {availability !== 'available' ? (
          <InlineStatus
            variant="note"
            message="Set your status to Available to receive matching job opportunities. Busy workers are not included in matching."
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
          opportunities.map((job) => (
            <View key={job.job_id} style={styles.cardPad}>
              <JobOpportunityCompactCard
                opportunity={job}
                onPress={() =>
                  router.push({
                    pathname: '/worker/opportunity-details',
                    params: { jobId: job.job_id },
                  } as unknown as Href)
                }
              />
            </View>
          ))
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
  pendingPad: {
    paddingHorizontal: spacing.gutter,
    marginBottom: spacing.xxl,
  },
  pendingHeadline: {
    ...type.sectionTitle,
    color: colors.warning,
  },
  pendingBody: {
    ...type.body,
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
  jobsBlock: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  bookingBlock: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.gutter,
  },
  statusPad: {
    paddingHorizontal: spacing.gutter,
  },
  cardPad: {
    paddingHorizontal: spacing.gutter,
  },
  listRow: {
    paddingHorizontal: spacing.gutter,
  },
});
