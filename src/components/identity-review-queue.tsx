import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminRow } from '@/components/admin-rows';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { groupPosition, groupedRowStyle } from '@/components/grouped-row';
import { InitialsAvatar } from '@/components/initials-avatar';
import { InlineStatus } from '@/components/inline-status';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { formatCardDateTime } from '@/lib/date-time';
import {
  IDENTITY_COPY,
  identityTypeLabel,
  listWorkersPendingIdReview,
  type PendingIdentityReview,
} from '@/lib/worker-identity';

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
  const ui = useUiTheme();
  const styles = createStyles(ui);
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
          tintColor={ui.colors.accent}
          colors={[ui.colors.accent]}
        />
      }
    >
      {header}
      <SectionHeader
        title="Waiting for review"
        trailing={!isLoading && !loadError && workers.length > 0
          ? <Text style={styles.count}>{workers.length === 1 ? '1 Worker' : `${workers.length} Workers`}</Text>
          : undefined}
      />
      <Text style={styles.note}>
        Oldest submission first. Opening a review does not change it; Approve verifies the Worker.
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
        <InlineStatus
          variant="empty"
          icon={{ android: 'verified_user', ios: 'checkmark.shield' }}
          message="No identity submissions are waiting for review."
        />
      ) : (
        <View>
          {workers.map((worker, index) => {
            const submitted = formatCardDateTime(worker.submittedAt);
            return (
              <AdminRow
                key={worker.documentId}
                style={groupedRowStyle(ui, groupPosition(index, workers.length))}
                leading={<InitialsAvatar name={worker.fullName} accent={ui.colors.accentSubtle} size={ui.size.iconCircle} />}
                title={worker.fullName}
                lines={[
                  worker.skills.length > 0 ? worker.skills.join(', ') : 'No skills added',
                  `ID type: ${identityTypeLabel(worker.idType)}`,
                  submitted ? `Submitted ${submitted}` : null,
                ]}
                trailing={<AppChip label="Pending review" variant="warning" />}
                onPress={() => onSelectWorker(worker.userId)}
                accessibilityLabel={`Review identity for ${worker.fullName}`}
              />
            );
          })}
        </View>
      )}
      {footer}
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xxxxl },
    note: { ...type.helper, color: colors.textSecondary },
    count: { ...type.label, color: colors.textSecondary },
  });
}
