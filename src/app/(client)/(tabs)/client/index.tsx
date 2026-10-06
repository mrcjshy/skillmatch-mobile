import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, type Href, useRouter } from 'expo-router';

import { ActiveBookingHomeCard } from '@/components/active-booking-home-card';
import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { loadClientBookings, type ClientBooking } from '@/lib/booking-records';
import { createClientHomeBookingFocus } from '@/lib/client-home-booking-focus';
import { formatCardDateTime } from '@/lib/date-time';
import { homeGreeting } from '@/lib/home-greeting';
import { firstNameFromFullName } from '@/lib/initials';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function ClientHome() {
  const { account } = useAccount();
  const clientId = account?.id;
  const router = useRouter();
  const { isLoading, loadError, jobs } = useClientJobs();
  const { isPosting, isOwnerCurrent, takePendingCreatedJob } = useClientPostJobDraft();
  const [bookings, setBookings] = useState<ClientBooking[]>([]);

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
    const pendingJobId = takePendingCreatedJob();
    if (pendingJobId) focus.waitForJob(pendingJobId);
    else focus.refresh();
    // Tabs remain mounted on blur; this cancels the consumed wait permanently.
    return () => focus.cancel();
  }, [clientId, isOwnerCurrent, takePendingCreatedJob, router]));

  const hasActiveBooking = bookings.some(booking => booking.booking_status === 'confirmed');
  const postDisabled = isLoading || !!loadError || isPosting || !isOwnerCurrent();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.titleBlock}>
        <Text style={styles.greeting}>{homeGreeting()}</Text>
        <Text style={styles.displayTitle} accessibilityRole="header">{firstNameFromFullName(account?.full_name ?? '')}</Text>
        <Text style={styles.serviceArea}>Santa Ana, Pateros · SkillMatch service area</Text>
      </View>
      <ActiveBookingHomeCard
        role="client"
        bookings={bookings}
        onPressPrimary={(booking) => router.push({
          pathname: '/client/booking-details', params: { bookingId: booking.booking_id },
        } as unknown as Href)}
        onPressViewAll={() => router.push('/client/bookings' as Href)}
      />
      <View style={styles.content}>
        <AppButton label="Post Job" variant={hasActiveBooking ? 'secondary' : 'primary'} disabled={postDisabled} loading={isPosting}
          onPress={() => { if (!postDisabled && isOwnerCurrent()) router.push('/client/post-job' as Href); }} />
        <View style={styles.section}>
          <SectionHeader title="Your jobs" />
          {isLoading ? <InlineStatus variant="loading" message="Loading your jobs…" /> : loadError ? (
            <InlineStatus variant="error" message={loadError} />
          ) : (
            <>
              <Text selectable style={styles.summary}>{jobs.filter(job => job.status === 'open').length} open jobs</Text>
              {jobs.length === 0 ? <InlineStatus variant="empty" message="You have not posted a job yet." /> : jobs.slice(0, 3).map(job => (
                <View key={job.id} style={styles.job}>
                  <Text selectable style={styles.jobTitle}>{job.title}</Text>
                  <Text selectable style={styles.summary}>Status: {job.status}</Text>
                  <Text selectable style={styles.summary}>{formatCardDateTime(job.scheduled_at) ?? 'No schedule'}</Text>
                  <Text selectable style={styles.summary}>Budget: {job.budget === null ? 'Not set' : '\u20b1' + job.budget.toLocaleString()}</Text>
                </View>
              ))}
            </>
          )}
          <AppButton label="My Jobs" variant="ghost" onPress={() => router.push('/client/jobs' as Href)} />
        </View>
        <AppButton label="Help" variant="ghost" onPress={() => router.push('/client/help' as Href)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, backgroundColor: colors.background, paddingBottom: spacing.xxxl + spacing.sm },
  titleBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  greeting: { ...type.helper, color: colors.textSecondary },
  displayTitle: { ...type.screenTitle, color: colors.textPrimary },
  serviceArea: { ...type.helper, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xl },
  section: { gap: spacing.md },
  summary: { ...type.helper, color: colors.textSecondary },
  job: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  jobTitle: { ...type.cardTitle, color: colors.textPrimary },
});
