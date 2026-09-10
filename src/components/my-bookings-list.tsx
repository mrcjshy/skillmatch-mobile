import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookingCompactCard } from '@/components/booking-compact-card';
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
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
      <Text style={styles.heading}>Bookings</Text>
      <Text style={styles.note}>{role === 'worker' ? 'Jobs booked to you.' : 'Workers booked to your jobs.'}</Text>

      <View style={styles.segmentControl} accessibilityRole="tablist">
        {(['active', 'history'] as const).map((value) => {
          const selected = segment === value;
          return (
            <Pressable key={value} style={[styles.segmentButton, selected ? styles.segmentButtonSelected : null]} onPress={() => setSegment(value)} accessibilityRole="tab" accessibilityState={{ selected }}>
              <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{value === 'active' ? 'Active' : 'History'}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SkillMatchTheme.brand.primary} /><Text style={styles.note}>Loading your bookings…</Text></View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={retry} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : visibleBookings.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.note}>{EMPTY_COPY[segment]}</Text></View>
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
  container: { padding: SkillMatchTheme.spacing.screenGutter, gap: SkillMatchTheme.spacing.cardGap, paddingBottom: 48 },
  heading: { color: SkillMatchTheme.text.primary, fontSize: 26, fontWeight: '800' },
  note: { color: SkillMatchTheme.text.secondary, fontSize: 14 },
  segmentControl: { flexDirection: 'row', backgroundColor: SkillMatchTheme.surface.subtle, borderRadius: SkillMatchTheme.radius.input, padding: 4, marginVertical: 4 },
  segmentButton: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentButtonSelected: { backgroundColor: SkillMatchTheme.brand.primary },
  segmentText: { color: SkillMatchTheme.text.secondary, fontSize: 15, fontWeight: '700' },
  segmentTextSelected: { color: SkillMatchTheme.text.inverse },
  center: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  emptyCard: { alignItems: 'center', backgroundColor: SkillMatchTheme.surface.default, borderWidth: 1, borderColor: SkillMatchTheme.border.default, borderRadius: SkillMatchTheme.radius.card, padding: 24 },
  error: { color: SkillMatchTheme.feedback.danger, fontSize: 14, textAlign: 'center' },
  retryButton: { borderWidth: 1, borderColor: SkillMatchTheme.brand.primary, borderRadius: SkillMatchTheme.radius.input, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: SkillMatchTheme.brand.primary, fontWeight: '700' },
});
