import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip, type AppChipVariant } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import {
  AdminReportListRow,
  COPY,
  ReportError,
  formatReportCategory,
  formatReportStatus,
  loadAdminReports,
  loadAdminReportsErrorCopy,
} from '@/lib/reports';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

function reportChipVariant(status: string): AppChipVariant {
  if (status === 'resolved') return 'positive';
  if (status === 'under_review') return 'warning';
  if (status === 'dismissed') return 'danger';
  return 'neutral';
}

export default function AdminReports() {
  const router = useRouter();
  const { account } = useAccount();
  const adminId = account?.id;
  const [reports, setReports] = useState<AdminReportListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await loadAdminReports();
    setReports(rows);
    setLoadError(null);
  }, []);

  const applyError = useCallback((e: unknown) => {
    if (e instanceof ReportError) {
      console.warn('[R3-UI] list_reports failed:', e.code, e.message);
    } else if (e instanceof Error && e.message) {
      console.warn('[R3-UI] list_reports failed:', e.message);
    }
    setLoadError(loadAdminReportsErrorCopy(e));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount */
  useEffect(() => {
    if (!adminId) return;
    const run = { cancelled: false };
    load()
      .catch((e: unknown) => {
        if (!run.cancelled) applyError(e);
      })
      .finally(() => {
        if (!run.cancelled) setIsLoading(false);
      });
    return () => {
      run.cancelled = true;
    };
  }, [adminId, load, applyError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function retry() {
    if (isLoading || isRefreshing) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function refresh() {
    if (isLoading || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
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
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {isLoading ? (
        <InlineStatus variant="loading" message="Loading reports…" />
      ) : loadError ? (
        <InlineStatus
          variant="error"
          message={loadError}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} />}
        />
      ) : reports.length === 0 ? (
        <InlineStatus variant="empty" message={COPY.adminEmpty} />
      ) : (
        reports.map((report) => {
          const created = formatCardDateTime(report.created_at);
          return (
            <Pressable
              key={report.report_id}
              onPress={() => {
                router.push({
                  pathname: '/admin/report-details',
                  params: { reportId: report.report_id },
                } as unknown as Href);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [pressed ? styles.pressed : null]}
            >
              <AppCard>
                <View style={styles.topRow}>
                  <Text style={styles.title}>{formatReportCategory(report.category)}</Text>
                  <AppChip
                    label={formatReportStatus(report.status)}
                    variant={reportChipVariant(report.status)}
                  />
                </View>
                <View style={styles.meta}>
                  <Text style={styles.line}>Reporter: {report.reporter_full_name}</Text>
                  <Text style={styles.line}>
                    Reported: {report.reported_full_name ?? 'App issue'}
                  </Text>
                  {report.booking_id ? (
                    <Text style={styles.line}>Booking ID: {report.booking_id}</Text>
                  ) : null}
                  {created ? <Text style={styles.created}>{created}</Text> : null}
                </View>
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
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.md,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  pressed: {
    opacity: 0.72,
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
    gap: spacing.xs,
  },
  line: {
    ...type.helper,
    color: colors.textSecondary,
  },
  created: {
    ...type.caption,
    color: colors.textSecondary,
  },
});
