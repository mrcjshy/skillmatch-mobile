import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, type Href, useRouter } from 'expo-router';
import { AppSymbol as SymbolView } from '@/components/app-symbol';

import { ActiveBookingHomeCard } from '@/components/active-booking-home-card';
import { AppChip } from '@/components/app-chip';
import { groupPosition, groupedRowStyle } from '@/components/grouped-row';
import { HomeStickyHeader } from '@/components/home-header';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import { loadClientBookings, type ClientBooking } from '@/lib/booking-records';
import { createClientHomeBookingFocus, type ClientHomeBookingFocus } from '@/lib/client-home-booking-focus';
import { formatCardDateTime } from '@/lib/date-time';
import { firstNameFromFullName } from '@/lib/initials';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';



export default function ClientHome() {
  return <RefinementThemeProvider><ClientHomeContent /></RefinementThemeProvider>;
}

function ClientHomeContent() {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  const { account } = useAccount();
  const clientId = account?.id;
  const router = useRouter();
  const { isLoading, loadError, jobs, refresh: refreshJobs } = useClientJobs();
  const { isOwnerCurrent, takePendingCreatedJob } = useClientPostJobDraft();
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const bookingFocus = useRef<ClientHomeBookingFocus | null>(null);

  useFocusEffect(useCallback(() => {
    if (!clientId || !isOwnerCurrent()) return;
    const focus = createClientHomeBookingFocus({
      clientId,
      loadBookings: loadClientBookings,
      onBookings: (rows) => { if (isOwnerCurrent()) setBookings(rows); },
      onNavigate: (bookingId) => {
        if (isOwnerCurrent()) router.push({
          pathname: '/client/booking-details',
          params: { bookingId },
        } as unknown as Href);
      },
    });
    bookingFocus.current = focus;
    const pendingJobId = takePendingCreatedJob();
    if (pendingJobId) focus.waitForJob(pendingJobId);
    else focus.refresh();
    // Tabs remain mounted on blur; this cancels the consumed wait permanently.
    return () => {
      focus.cancel();
      if (bookingFocus.current === focus) bookingFocus.current = null;
    };
  }, [clientId, isOwnerCurrent, takePendingCreatedJob, router]));

  // Only requests still waiting for a worker; finished and matched jobs stay in My jobs.
  const openJobs = jobs.filter(job => job.status === 'open');
  // One pull refreshes the whole Home through the existing bookings read and jobs owner.
  const refreshHome = async () => {
    if (refreshing || !clientId || !isOwnerCurrent()) return;
    setRefreshing(true);
    try {
      bookingFocus.current?.refresh();
      await refreshJobs(clientId);
    } catch {
      // The owner keeps the rows it has; the next focus or pull reads again.
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <View style={styles.screen}>
      {/* Post a job is the bottom bar's central action (Wave 7); the current booking stays in view. */}
      <HomeStickyHeader name={firstNameFromFullName(account?.full_name ?? '')} role="client">
        <ActiveBookingHomeCard
          role="client"
          compact
          bookings={isOwnerCurrent() ? bookings : []}
          onPressPrimary={(booking) => {
            if (isOwnerCurrent()) router.push({ pathname: '/client/booking-details', params: { bookingId: booking.booking_id } } as unknown as Href);
          }}
          onPressViewAll={() => {
            if (isOwnerCurrent()) router.push({ pathname: '/client/bookings', params: { segment: 'active' } } as unknown as Href);
          }}
        />
      </HomeStickyHeader>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshHome(); }} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {/* Requests still waiting scroll below the compact, fixed current booking. */}
        <View style={styles.section}>
          <SectionHeader
            title="Awaiting workers"
            trailing={!isLoading && !loadError && openJobs.length > 0 ? <Text style={styles.count}>{openJobs.length === 1 ? '1 job' : `${openJobs.length} jobs`}</Text> : undefined}
          />
          {isLoading ? <InlineStatus variant="loading" message="Loading your jobs…" /> : loadError ? (
            <InlineStatus variant="error" message={loadError} />
          ) : openJobs.length === 0 ? (
            <InlineStatus variant="empty" message="No jobs are waiting for a worker." />
          ) : (
            <View>
              {openJobs.map((job, index) => {
                const schedule = formatCardDateTime(job.scheduled_at);
                const budget = job.budget === null ? null : '₱' + job.budget.toLocaleString();
                const skills = job.skills.length > 0 && !(job.skills.length === 1 && job.skills[0] === job.title) ? job.skills.join(', ') : null;
                return (
                  <Pressable
                    key={job.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${job.title}, waiting for worker${schedule ? ', ' + schedule : ''}${budget ? ', budget ' + budget : ''}. View job details`}
                    onPress={() => {
                      if (isOwnerCurrent()) router.push({ pathname: '/client/job-details', params: { jobId: job.id } } as unknown as Href);
                    }}
                    style={({ pressed }) => [styles.row, groupedRowStyle(ui, groupPosition(index, openJobs.length)), pressed && styles.rowPressed]}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{job.title}</Text>
                      {skills ? <Text style={styles.rowSkills}>{skills}</Text> : null}
                      {schedule ? (
                        <View style={styles.fact}>
                          <SymbolView name={{ android: 'schedule', ios: 'clock' }} size={16} tintColor={colors.textSecondary} />
                          <Text style={styles.meta}>{schedule}</Text>
                        </View>
                      ) : null}
                      <View style={styles.rowFooter}>
                        {budget ? <Text style={styles.budget}>{budget}</Text> : null}
                        <AppChip label="Waiting for worker" variant="info" />
                      </View>
                    </View>
                    <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right' }} size={20} tintColor={colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    scroll: { flex: 1, backgroundColor: colors.canvas },
    container: { flexGrow: 1, backgroundColor: colors.canvas, paddingTop: spacing.lg, paddingBottom: spacing.xxxxl, gap: spacing.xl },
    section: { gap: spacing.md, paddingHorizontal: spacing.gutter },
    count: { ...type.label, color: colors.textSecondary },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: size.listRowMinHeight, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, maxWidth: '100%' },
    rowPressed: { backgroundColor: colors.surfaceSunken },
    rowCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    rowTitle: { ...type.bodyEmphasis, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
    rowSkills: { ...type.label, color: colors.accent, flexShrink: 1, maxWidth: '100%' },
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, maxWidth: '100%' },
    meta: { ...type.helper, color: colors.textSecondary, flexShrink: 1, maxWidth: '100%' },
    rowFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs, maxWidth: '100%', paddingTop: spacing.xs },
    budget: { ...type.numeric, fontSize: 16, lineHeight: 24, color: colors.textPrimary, maxWidth: '100%', flexShrink: 1 },
  });
}
