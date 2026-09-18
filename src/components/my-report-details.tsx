import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip, type AppChipVariant } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  COPY,
  MyReport,
  ReportError,
  formatReportCategory,
  formatReportStatus,
  isReportId,
  loadMyReports,
  loadMyReportsErrorCopy,
  reportContextLabel,
} from '@/lib/reports';

const { colors, type, spacing } = SkillMatchTheme.ui;

function reportChipVariant(status: string): AppChipVariant {
  if (status === 'resolved') return 'selected';
  if (status === 'under_review') return 'warning';
  if (status === 'dismissed') return 'warning';
  return 'neutral';
}

function statusCardTone(status: string): 'success' | 'warning' | undefined {
  if (status === 'resolved') return 'success';
  if (status === 'under_review' || status === 'dismissed') return 'warning';
  return undefined;
}

export default function MyReportDetails({ reportId }: { reportId: string | null }) {
  const [report, setReport] = useState<MyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isReportId(reportId)) {
      setReport(null);
      setLoadError(COPY.unavailable);
      return;
    }
    const rows = await loadMyReports();
    const match = rows.find((row) => row.id === reportId) ?? null;
    if (match === null) {
      setReport(null);
      setLoadError(COPY.unavailable);
      return;
    }
    setReport(match);
    setLoadError(null);
  }, [reportId]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof ReportError) {
      console.warn('[R3-UI] my report detail load failed:', error.code, error.message);
    } else if (error instanceof Error && error.message) {
      console.warn('[R3-UI] my report detail load failed:', error.message);
    }
    setLoadError(loadMyReportsErrorCopy(error));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- established fetch-on-mount convention */
  useEffect(() => {
    const run = { cancelled: false };
    load()
      .catch((error: unknown) => {
        if (!run.cancelled) applyError(error);
      })
      .finally(() => {
        if (!run.cancelled) setIsLoading(false);
      });
    return () => {
      run.cancelled = true;
    };
  }, [load, applyError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function retry() {
    setIsLoading(true);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refresh() {
    if (isRefreshing) return;
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
        <InlineStatus variant="loading" message="Loading report…" />
      </View>
    );
  }

  if (loadError || report === null) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError ?? COPY.unavailable}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} />}
        />
      </View>
    );
  }

  const created = formatDetailDateTime(report.created_at);
  const reviewedAt = formatDetailDateTime(report.reviewed_at);

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
      <AppCard variant="status" tone={statusCardTone(report.status)}>
        <Text style={styles.eyebrow}>STATUS</Text>
        <AppChip
          label={formatReportStatus(report.status)}
          variant={reportChipVariant(report.status)}
          style={styles.statusChip}
        />
      </AppCard>

      <AppCard>
        <DetailLine label="Category" value={formatReportCategory(report.category)} />
        <DetailLine label="Context" value={reportContextLabel(report.booking_id)} />
        <DetailLine label="Created" value={created} />
        {report.booking_id ? <DetailLine label="Booking ID" value={report.booking_id} /> : null}
        {reviewedAt ? <DetailLine label="Reviewed" value={reviewedAt} /> : null}
      </AppCard>

      <AppCard>
        <SectionHeader title="Description" />
        <Text style={styles.body}>{report.description}</Text>
      </AppCard>

      <AppCard>
        <SectionHeader title="Admin response" />
        <Text style={styles.body}>{report.admin_response ?? COPY.noAdminResponse}</Text>
      </AppCard>
    </ScrollView>
  );
}

function DetailLine({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
  eyebrow: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  detailRow: {
    gap: spacing.xxs,
  },
  detailLabel: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    ...type.body,
    color: colors.textPrimary,
  },
});
