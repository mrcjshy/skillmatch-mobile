import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { AppButton } from '@/components/app-button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { loadClientBookings } from '@/lib/booking-records';
import { createLoadGenerationTracker } from '@/lib/booking-details-freshness';
import { CLIENT_PORTFOLIO_COPY, loadClientBookingPortfolio, type ClientPortfolioLoad } from '@/lib/client-portfolio';
import { projectScaleLabel, type PortfolioItem, type PortfolioItemImage } from '@/lib/portfolio';
import { BOOKING_STATUS_CHANGED, bookingMessagesTopic, subscribeInvalidation } from '@/lib/realtime';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

type ViewerState = { ownerKey: string | null; result: ClientPortfolioLoad | null; error: boolean };

export default function ClientPortfolio({ bookingId }: { bookingId: string | null }) {
  const { account, status, hasCurrentConsent } = useAccount();
  const { session, sessionRevision = -1, isSessionRevisionCurrent, isSessionLoading, sessionError, recoveryStatus } = useSession();
  const insets = useSafeAreaInsets();
  const authorized = !isSessionLoading && !sessionError && recoveryStatus === 'idle' && session &&
    status === 'resolved' && account?.id === session.user.id && account?.role === 'client' &&
    account.is_active === true && hasCurrentConsent === true && sessionRevision >= 0 && isSessionRevisionCurrent?.(sessionRevision) === true;
  const ownerKey = authorized ? `${account.id}:${sessionRevision}:${bookingId}` : null;
  const [view, setView] = useState<ViewerState>({ ownerKey: null, result: null, error: false });
  const reloadRef = useRef<(() => Promise<void>) | null>(null);

  useFocusEffect(useCallback(() => {
    if (ownerKey === null) return;
    const tracker = createLoadGenerationTracker();
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const clear = (error = false) => setView({ ownerKey, result: null, error });
    const stopSubscription = () => { unsubscribe?.(); unsubscribe = null; };
    const current = () => !disposed && isSessionRevisionCurrent?.(sessionRevision) === true && AppState.currentState === 'active';

    async function reload() {
      const token = tracker.start();
      const isCurrent = () => current() && tracker.isCurrent(token);
      if (!isCurrent()) return;
      clear();
      try {
        const result = await loadClientBookingPortfolio(bookingId, { loadBookings: loadClientBookings, isCurrent });
        if (!isCurrent()) return;
        setView({ ownerKey, result, error: false });
        if (result.kind !== 'ready') { stopSubscription(); return; }
        if (!unsubscribe && bookingId) {
          unsubscribe = subscribeInvalidation({
            topic: bookingMessagesTopic(bookingId), events: [BOOKING_STATUS_CHANGED],
            onInvalidate: () => { void reload(); },
            onUnavailable: () => {
              if (!current()) return;
              tracker.start();
              clear(true);
            },
          });
        }
      } catch (error) {
        if (!isCurrent()) return;
        stopSubscription();
        const denied = typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';
        setView({ ownerKey, result: denied ? { kind: 'unavailable' } : null, error: !denied });
      }
    }

    reloadRef.current = reload;
    void reload();
    const lifecycle = AppState.addEventListener('change', (next) => {
      if (next === 'active') { void reload(); return; }
      tracker.start();
      stopSubscription();
      clear();
    });
    return () => {
      disposed = true;
      tracker.cancel();
      stopSubscription();
      lifecycle.remove();
      reloadRef.current = null;
      clear();
    };
  }, [bookingId, ownerKey, sessionRevision, isSessionRevisionCurrent]));

  // Mask synchronously: effect cleanup alone is too late for an account/booking change.
  if (ownerKey === null) {
    return <View style={styles.center}><InlineStatus variant="empty" message={CLIENT_PORTFOLIO_COPY.unavailable} /></View>;
  }
  if (view.ownerKey !== ownerKey || (view.result === null && !view.error)) {
    return <View style={styles.center}><InlineStatus variant="loading" skeleton="detail" message={CLIENT_PORTFOLIO_COPY.loading} /></View>;
  }
  if (view.error) {
    return <View style={styles.center}><InlineStatus variant="error" message={CLIENT_PORTFOLIO_COPY.loadFailed}
      action={<AppButton label={CLIENT_PORTFOLIO_COPY.retry} variant="secondary" onPress={() => void reloadRef.current?.()} accessibilityLabel={CLIENT_PORTFOLIO_COPY.retry} />} /></View>;
  }
  const state = view.result;
  if (state === null || state.kind !== 'ready') {
    return <View style={styles.center}><InlineStatus variant="empty" message={CLIENT_PORTFOLIO_COPY.unavailable} /></View>;
  }
  const { resume } = state;
  const header = (
    <View style={styles.header}>
      <SectionHeader title={state.workerName ?? 'Worker'} trailing={
        <InitialsAvatar name={state.workerName ?? 'Worker'} accent={colors.accentSubtle} size={56} photoUri={state.workerPhotoUrl} />
      } />
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.itemTitle}>Professional profile</Text>
        {resume.isVerified === null ? null : <Text style={styles.body}>{resume.isVerified ? 'Verified Worker' : 'Not yet verified'}</Text>}
        {resume.phone ? <Text style={styles.body}>Phone: {resume.phone}</Text> : null}
        {resume.barangay ? <Text style={styles.body}>Barangay: {resume.barangay}</Text> : null}
        {resume.ratingAvg !== null ? <Text style={styles.body}>Client rating: {resume.ratingAvg.toFixed(1)} / 5 ({resume.ratingCount} ratings)</Text>
          : resume.ratingCount === 0 ? <Text style={styles.meta}>No ratings yet.</Text> : null}
      </View>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.itemTitle}>Skills</Text>
        {resume.skills.length === 0 ? <Text style={styles.meta}>No skills shared yet.</Text>
          : resume.skills.map(skill => <Text key={skill} style={styles.body}>{skill}</Text>)}
      </View>
      <Text accessibilityRole="header" style={styles.itemTitle}>Portfolio</Text>
    </View>
  );
  return <FlatList
    style={styles.scroll}
    contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xxxxl) }]}
    data={state.items}
    keyExtractor={item => item.id}
    ListHeaderComponent={header}
    ListEmptyComponent={<InlineStatus variant="empty" message={CLIENT_PORTFOLIO_COPY.empty} />}
    renderItem={({ item }) => <PortfolioReadCard item={item} />}
    initialNumToRender={3}
    maxToRenderPerBatch={3}
    windowSize={5}
    refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reloadRef.current?.()} tintColor={colors.accent} colors={[colors.accent]} />}
  />;
}

function PortfolioReadCard({ item }: { item: PortfolioItem }) {
  const cover = item.images.find(image => image.position === 1);
  const rest = item.images.filter(image => image.position !== 1);
  return <View style={styles.item}>
    <Text accessibilityRole="header" style={styles.itemTitle}>{item.title}</Text>
    <Text style={styles.meta}>{projectScaleLabel(item.projectScale)}</Text>
    {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
    {cover ? <SavedImage image={cover} title={item.title} cover /> : null}
    {rest.length > 0 ? <View style={styles.galleryRow}>{rest.map(image => <SavedImage key={image.id} image={image} title={item.title} />)}</View> : null}
  </View>;
}

function SavedImage({ image, title, cover = false }: { image: PortfolioItemImage; title: string; cover?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (image.signedUrl === null || image.signedUrl === failedUrl) {
    return <View style={cover ? styles.coverFallback : styles.savedThumbFallback} accessibilityLabel={`${title}: ${CLIENT_PORTFOLIO_COPY.imageUnavailable}`}>
      <Text style={cover ? styles.meta : styles.fallbackText}>{CLIENT_PORTFOLIO_COPY.imageUnavailable}</Text>
    </View>;
  }
  return <Image source={{ uri: image.signedUrl }} style={cover ? styles.cover : styles.savedThumb} contentFit="cover" cachePolicy="memory"
    accessibilityLabel={`${title}, photo ${image.position}`} onError={() => setFailedUrl(image.signedUrl)} />;
}

const styles = StyleSheet.create({
  header: { gap: spacing.lg },
  summary: { gap: spacing.sm },
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
  center: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  item: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  itemTitle: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  body: {
    ...type.body,
    color: colors.textPrimary,
  },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  galleryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    borderCurve: 'continuous',
  },
  coverFallback: {
    width: '100%',
    height: 180,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  savedThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    borderCurve: 'continuous',
  },
  savedThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    padding: spacing.xs,
    borderCurve: 'continuous',
  },
  fallbackText: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
