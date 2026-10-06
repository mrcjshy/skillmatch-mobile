import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppSegment } from '@/components/app-segment';
import { BookingCompactCard } from '@/components/booking-compact-card';
import { groupPosition } from '@/components/grouped-row';
import { SectionHeader } from '@/components/section-header';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { BookingLoadError, loadErrorCopy } from '@/lib/bookings';
import {
  BookingRole,
  BookingSegment,
  RoleBooking,
  bookingsForSegment,
  loadClientBookings,
  loadWorkerBookings,
} from '@/lib/booking-records';
import { useAccount } from '@/providers/account-provider';
import {
  createBookingRefreshCoordinator,
  type BookingRefreshReason,
  type BookingRefreshScope,
} from '@/lib/booking-refresh-coordinator';
import {
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  userNotificationsTopic,
} from '@/lib/realtime';

const { colors, spacing } = SkillMatchTheme.ui;

const EMPTY_COPY: Record<BookingSegment, string> = {
  active: 'You have no active bookings.',
  history: 'You have no booking history yet.',
};

export default function MyBookingsList({ role }: { role: BookingRole }) {
  const router = useRouter();
  const { account } = useAccount();
  const accountId = account?.id;
  const [coordinator] = useState(() => createBookingRefreshCoordinator<RoleBooking>());
  const refreshScope = useRef<(BookingRefreshScope & { accountId: string; role: BookingRole }) | null>(null);
  const [segment, setSegment] = useState<BookingSegment>('active');
  const [bookings, setBookings] = useState<RoleBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Home's View all asks for the Active list. The tab stays mounted, so honour the request each
  // time it arrives, then clear it so a later visit keeps whatever segment the person chose.
  const { segment: requestedSegment } = useLocalSearchParams<{ segment?: string }>();
  const [handledRequest, setHandledRequest] = useState<string | undefined>(undefined);
  if (requestedSegment !== handledRequest) {
    setHandledRequest(requestedSegment);
    if (requestedSegment === 'active') setSegment('active');
  }
  useEffect(() => {
    if (requestedSegment === 'active') router.setParams({ segment: undefined });
  }, [requestedSegment, router]);

  // Revoke the old authority at commit, before passive effects or late reads can
  // update a changed identity. The coordinator's request slot survives this swap.
  useLayoutEffect(() => {
    if (!accountId) return undefined;
    const scope = coordinator.activate({
      loadBookings: role === 'worker' ? loadWorkerBookings : loadClientBookings,
      onBookings: (rows) => {
        setBookings(rows);
        setLoadError(null);
      },
      onError: (error) => {
        if (error instanceof BookingLoadError) {
          console.warn(`[R1-B] ${role} bookings load failed:`, error.code, error.message);
        } else if (error instanceof Error && error.message) {
          console.warn(`[R1-B] ${role} bookings load failed:`, error.message);
        }
        setLoadError(loadErrorCopy(error));
      },
      onActivity: ({ isLoading: loading, isRefreshing: refreshing }) => {
        setIsLoading(loading);
        setIsRefreshing(refreshing);
        if (loading) setLoadError(null);
      },
    });
    const ownedScope = { ...scope, accountId, role };
    refreshScope.current = ownedScope;
    // Initial loading also works without a live Realtime connection.
    scope.refresh('focus');
    const cleanup = subscribeInvalidation({
      topic: userNotificationsTopic(accountId),
      events: [NOTIFICATION_INSERTED],
      onInvalidate: () => scope.refresh('invalidation'),
    });

    return () => {
      scope.cancel();
      if (refreshScope.current === ownedScope) refreshScope.current = null;
      cleanup();
    };
  }, [accountId, coordinator, role]);

  const requestRefresh = useCallback((reason: BookingRefreshReason) => {
    const scope = refreshScope.current;
    if (scope?.accountId === accountId && scope?.role === role) scope.refresh(reason);
  }, [accountId, role]);

  // Focus, including return from Details, joins the same queue as Realtime.
  useFocusEffect(
    useCallback(() => {
      requestRefresh('focus');
    }, [requestRefresh])
  );

  function retry() {
    requestRefresh('retry');
  }

  function refresh() {
    requestRefresh('manual');
  }

  const visibleBookings = bookingsForSegment(bookings, segment);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <AppSegment
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
        ] as const}
        value={segment}
        onChange={setSegment}
      />

      <SectionHeader
        title={segment === 'active' ? 'Active bookings' : 'Booking history'}
        subtitle={role === 'worker' ? 'Jobs booked to you.' : 'Workers booked to your jobs.'}
      />

      {isLoading ? (
        <InlineStatus variant="loading" message="Loading your bookings…" />
      ) : loadError ? (
        <InlineStatus
          variant="error"
          message={loadError}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} />}
        />
      ) : visibleBookings.length === 0 ? (
        <InlineStatus variant="empty" message={EMPTY_COPY[segment]} />
      ) : (
        // One grouped surface: the rows carry their own dividers, so no gap between them.
        <View>
        {visibleBookings.map((booking, index) => (
          <BookingCompactCard
            key={booking.booking_id}
            role={role}
            booking={booking}
            position={groupPosition(index, visibleBookings.length)}
            onPress={() => {
              const pathname = role === 'worker' ? '/worker/booking-details' : '/client/booking-details';
              // Expo's generated route union updates during the next export;
              // both literal destinations are backed by route files in this change.
              router.push({ pathname, params: { bookingId: booking.booking_id } } as unknown as Href);
            }}
          />
        ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
});
