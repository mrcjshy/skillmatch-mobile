import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { loadClientBookings } from '@/lib/booking-records';
import {
  CLIENT_PORTFOLIO_COPY,
  loadClientBookingPortfolio,
  type ClientPortfolioLoad,
} from '@/lib/client-portfolio';
import { projectScaleLabel, type PortfolioItem, type PortfolioItemImage } from '@/lib/portfolio';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

function coverImage(images: PortfolioItemImage[]): PortfolioItemImage | null {
  return images.find((image) => image.position === 1) ?? null;
}

function galleryImages(images: PortfolioItemImage[]): PortfolioItemImage[] {
  return images.filter((image) => image.position !== 1);
}

export default function ClientPortfolio({ bookingId }: { bookingId: string | null }) {
  const hasLoaded = useRef(false);
  const [state, setState] = useState<ClientPortfolioLoad | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await loadClientBookingPortfolio(bookingId, { loadBookings: loadClientBookings });
    setState(next);
    setLoadError(null);
  }, [bookingId]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message) {
      console.warn('[R5D-CLIENT-M1] client portfolio load failed:', error.message);
    }
    if (!hasLoaded.current) {
      setState(null);
      setLoadError(CLIENT_PORTFOLIO_COPY.loadFailed);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
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
      return () => {
        run.cancelled = true;
      };
    }, [load, applyError])
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message={CLIENT_PORTFOLIO_COPY.loading} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError}
          action={
            <AppButton
              label={CLIENT_PORTFOLIO_COPY.retry}
              variant="secondary"
              onPress={() => {
                void retry();
              }}
              accessibilityLabel={CLIENT_PORTFOLIO_COPY.retry}
            />
          }
        />
      </View>
    );
  }

  if (state === null || state.kind === 'unavailable' || state.kind === 'revoked') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="empty" message={CLIENT_PORTFOLIO_COPY.unavailable} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {state.workerName ? <SectionHeader title={state.workerName} /> : null}
      {state.items.length === 0 ? (
        <InlineStatus variant="empty" message={CLIENT_PORTFOLIO_COPY.empty} />
      ) : (
        state.items.map((item) => <PortfolioReadCard key={item.id} item={item} />)
      )}
    </ScrollView>
  );
}

function PortfolioReadCard({ item }: { item: PortfolioItem }) {
  const cover = coverImage(item.images);
  const rest = galleryImages(item.images);
  return (
    <AppCard>
      {cover ? <SavedCover image={cover} /> : null}
      {rest.length > 0 ? (
        <View style={styles.galleryRow}>
          {rest.map((image) => (
            <SavedThumb key={image.id} image={image} />
          ))}
        </View>
      ) : null}
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.meta}>{projectScaleLabel(item.projectScale)}</Text>
      {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
    </AppCard>
  );
}

function SavedCover({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.coverFallback}>
        <Text style={styles.meta}>{CLIENT_PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.cover} contentFit="cover" />;
}

function SavedThumb({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.savedThumbFallback}>
        <Text style={styles.fallbackText}>{CLIENT_PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.savedThumb} contentFit="cover" />;
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
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  itemTitle: {
    ...type.cardTitle,
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
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  coverFallback: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  savedThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  savedThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.xs,
    borderCurve: 'continuous',
  },
  fallbackText: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
