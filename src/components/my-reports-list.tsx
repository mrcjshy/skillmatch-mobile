import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip, type AppChipVariant } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import {
  COPY,
  MyReport,
  ReportError,
  formatReportCategory,
  formatReportStatus,
  loadMyReports,
  loadMyReportsErrorCopy,
  reportContextLabel,
} from '@/lib/reports';
import { BookingRole } from '@/lib/booking-records';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

function reportChipVariant(status: string): AppChipVariant {
  if (status === 'resolved') return 'selected';
  if (status === 'under_review') return 'warning';
  if (status === 'dismissed') return 'warning';
  return 'neutral';
}

export default function MyReportsList({ role }: { role: BookingRole }) {
  const router = useRouter();
  const { account } = useAccount();
  const accountId = account?.id;
  const hasLoaded = useRef(false);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await loadMyReports();
    setReports(rows);
    setLoadError(null);
  }, []);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof ReportError) {
      console.warn(`[R3-UI] ${role} my reports load failed:`, error.code, error.message);
    } else if (error instanceof Error && error.message) {
      console.warn(`[R3-UI] ${role} my reports load failed:`, error.message);
    }
    setLoadError(loadMyReportsErrorCopy(error));
  }, [role]);

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
      return () => {
        run.cancelled = true;
      };
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message="Loading your reports…" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} />}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {reports.length === 0 ? (
        <InlineStatus variant="empty" message={COPY.emptyMyReports} />
      ) : (
        reports.map((report) => {
          const created = formatCardDateTime(report.created_at);
          return (
            <Pressable
              key={report.id}
              onPress={() => {
                const pathname = role === 'worker' ? '/worker/my-report-details' : '/client/my-report-details';
                router.push({ pathname, params: { reportId: report.id } } as unknown as Href);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${formatReportCategory(report.category)}, ${formatReportStatus(report.status)}. View report details`}
            >
              <AppCard>
                <View style={styles.topRow}>
                  <Text style={styles.title}>{formatReportCategory(report.category)}</Text>
                  <AppChip
                    label={formatReportStatus(report.status)}
                    variant={reportChipVariant(report.status)}
                  />
                </View>
                <Text style={styles.meta}>{reportContextLabel(report.booking_id)}</Text>
                {created ? <Text style={styles.meta}>{created}</Text> : null}
                <Text style={styles.affordance}>View details →</Text>
              </AppCard>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.md,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  affordance: {
    ...type.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});
