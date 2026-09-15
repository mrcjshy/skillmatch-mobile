import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { SkillMatchTheme } from '@/constants/theme';
import { loadClientBookings } from '@/lib/booking-records';
import {
  CLIENT_PORTFOLIO_COPY,
  loadClientBookingPortfolio,
  type ClientPortfolioLoad,
} from '@/lib/client-portfolio';
import { projectScaleLabel, type PortfolioItem, type PortfolioItemImage } from '@/lib/portfolio';

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
  }, [])

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
        <ActivityIndicator />
        <Text style={styles.muted}>{CLIENT_PORTFOLIO_COPY.loading}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            void retry();
          }}
          accessibilityRole="button"
          accessibilityLabel={CLIENT_PORTFOLIO_COPY.retry}
        >
          <Text style={styles.secondaryButtonText}>{CLIENT_PORTFOLIO_COPY.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (state === null || state.kind === 'unavailable' || state.kind === 'revoked') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{CLIENT_PORTFOLIO_COPY.unavailable}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
    >
      {state.workerName ? <Text style={styles.heading}>{state.workerName}</Text> : null}
      <Text style={styles.heading}>{CLIENT_PORTFOLIO_COPY.title}</Text>
      {state.items.length === 0 ? (
        <Text style={styles.muted}>{CLIENT_PORTFOLIO_COPY.empty}</Text>
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
    <View style={styles.card}>
      {cover ? <SavedCover image={cover} /> : null}
      {rest.length > 0 ? (
        <View style={styles.galleryRow}>
          {rest.map((image) => (
            <SavedThumb key={image.id} image={image} />
          ))}
        </View>
      ) : null}
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.muted}>{projectScaleLabel(item.projectScale)}</Text>
      {item.description ? <Text style={styles.line}>{item.description}</Text> : null}
    </View>
  );
}

function SavedCover({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return <Text style={styles.muted}>{CLIENT_PORTFOLIO_COPY.imageUnavailable}</Text>;
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.cover} contentFit="cover" />;
}

function SavedThumb({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.savedThumbFallback}>
        <Text style={styles.muted}>{CLIENT_PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.savedThumb} contentFit="cover" />;
}

const styles = StyleSheet.create({
  container: {
    padding: SkillMatchTheme.spacing.screenGutter,
    gap: SkillMatchTheme.spacing.cardGap,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: SkillMatchTheme.brand.background,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: SkillMatchTheme.text.primary,
  },
  card: {
    backgroundColor: SkillMatchTheme.surface.default,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: 8,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SkillMatchTheme.text.primary,
  },
  line: {
    fontSize: 15,
    lineHeight: 21,
    color: SkillMatchTheme.text.primary,
  },
  muted: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
  },
  error: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  galleryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: SkillMatchTheme.radius.input,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  savedThumb: {
    width: 64,
    height: 64,
    borderRadius: SkillMatchTheme.radius.input,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  savedThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: SkillMatchTheme.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SkillMatchTheme.surface.subtle,
    padding: 4,
  },
  secondaryButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
