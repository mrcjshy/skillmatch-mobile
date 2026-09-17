import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppSegment } from '@/components/app-segment';
import { BookingCompactCard } from '@/components/booking-compact-card';
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

const { colors, type, spacing } = SkillMatchTheme.ui;

const EMPTY_COPY: Record<BookingSegment, string> = {
  active: 'You have no active bookings.',
  history: 'You have no booking history yet.',
};

export default function MyBookingsList({ role }: { role: BookingRole }) {
  const router = useRouter();
  const { account } = useAccount();
  const accountId = account?.id;
  const hasLoaded = useRef(false);
  const [segment, setSegment] = useState<BookingSegment>('active');
  const [bookings, setBookings] = useState<RoleBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = role === 'worker' ? await loadWorkerBookings() : await loadClientBookings();
    setBookings(rows);
    setLoadError(null);
  }, [role]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof BookingLoadError) {
      console.warn(`[R1-B] ${role} bookings load failed:`, error.code, error.message);
    } else if (error instanceof Error && error.message) {
      console.warn(`[R1-B] ${role} bookings load failed:`, error.message);
    }
    setLoadError(loadErrorCopy(error));
  }, [role]);

  // This is the sole automatic loader: first focus loads once, and returning
  // from Details performs the required read-only authoritative refresh.
  useFocusEffect(
    useCallback(() => {
      if (!accountId) return undefined;
      const run = { cancelled: false };
      if (!hasLoaded.current) setIsLoading(true);
      load()
        .catch((error: unknown) => {
          if (!run.cancelled) applyError(error);
        })
        .finally(() => {
          if (!run.cancelled) {
            hasLoaded.current = true;
            setIsLoading(false);
          }
        });
      return () => { run.cancelled = true; };
    }, [accountId, load, applyError])
  );

  async function retry() {
    if (isLoading || isRefreshing) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
      hasLoaded.current = true;
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refresh() {
    if (isLoading || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsRefreshing(false);
    }
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
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={styles.note}>{role === 'worker' ? 'Jobs booked to you.' : 'Workers booked to your jobs.'}</Text>

      <AppSegment
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
        ] as const}
        value={segment}
        onChange={setSegment}
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
        visibleBookings.map((booking) => (
          <BookingCompactCard
            key={booking.booking_id}
            role={role}
            booking={booking}
            onPress={() => {
              const pathname = role === 'worker' ? '/worker/booking-details' : '/client/booking-details';
              // Expo's generated route union updates during the next export;
              // both literal destinations are backed by route files in this change.
              router.push({ pathname, params: { bookingId: booking.booking_id } } as unknown as Href);
            }}
          />
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
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.md,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
});
