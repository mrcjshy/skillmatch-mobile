import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import {
  IDENTITY_COPY,
  identityTypeLabel,
  listWorkersPendingIdReview,
  type PendingIdentityReview,
} from '@/lib/worker-identity';

const { colors, type, spacing } = SkillMatchTheme.ui;

export function IdentityReviewQueue({
  adminId,
  header,
  footer,
  onSelectWorker,
}: {
  adminId: string | undefined;
  header?: ReactNode;
  footer?: ReactNode;
  onSelectWorker: (userId: string) => void;
}) {
  const hasLoaded = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<PendingIdentityReview[]>([]);

  const load = useCallback(async () => {
    const rows = await listWorkersPendingIdReview();
    setWorkers(rows);
    setLoadError(null);
  }, []);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message) {
      console.warn('[V3-W1] list_workers_pending_id_review failed:', error.message);
    }
    setLoadError(IDENTITY_COPY.reviewLoadFailed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!adminId) return undefined;
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
    }, [adminId, load, applyError])
  );

  async function handleRefresh() {
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void handleRefresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {header}
      <Text style={styles.heading}>Pending Identity Reviews</Text>
      <Text style={styles.note}>
        Tap a Worker to review their ID. Approve verifies the Worker. Oldest submission first.
      </Text>

      {isLoading ? (
        <InlineStatus variant="loading" message="Loading the ID review queue…" />
      ) : loadError ? (
        <InlineStatus
          variant="error"
          message={loadError}
          action={
            <AppButton
              label="Retry"
              variant="secondary"
              onPress={() => {
                void handleRefresh();
              }}
            />
          }
        />
      ) : workers.length === 0 ? (
        <InlineStatus variant="empty" message="No identity submissions are waiting for review." />
      ) : (
        workers.map((worker) => {
          const submitted = formatCardDateTime(worker.submittedAt);
          return (
            <Pressable
              key={worker.documentId}
              onPress={() => onSelectWorker(worker.userId)}
              accessibilityRole="button"
              accessibilityLabel={`Review identity for ${worker.fullName}`}
              style={({ pressed }) => [pressed ? styles.pressed : null]}
            >
              <AppCard>
                <Text style={styles.cardTitle}>{worker.fullName}</Text>
                <View style={styles.meta}>
                  <Text style={styles.cardLine}>ID type: {identityTypeLabel(worker.idType)}</Text>
                  {submitted ? <Text style={styles.cardLine}>Submitted: {submitted}</Text> : null}
                </View>
              </AppCard>
            </Pressable>
          );
        })
      )}
      {footer}
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
  heading: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.72,
  },
  cardTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  meta: {
    gap: spacing.xs,
  },
  cardLine: {
    ...type.helper,
    color: colors.textSecondary,
  },
});
