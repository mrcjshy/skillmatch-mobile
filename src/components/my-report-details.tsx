import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
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
import { reportStatusVariant } from '@/lib/status-presentation';

const { colors, type, spacing } = SkillMatchTheme.ui;

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
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <View style={styles.statusRow}>
        <AppChip
          label={formatReportStatus(report.status)}
          variant={reportStatusVariant(report.status)}
        />
      </View>

      <SurfaceGroup>
        <DetailLine label="Category" value={formatReportCategory(report.category)} />
        <DetailLine label="Context" value={reportContextLabel(report.booking_id)} />
        <DetailLine label="Created" value={created} />
        {report.booking_id ? <DetailLine label="Booking ID" value={report.booking_id} /> : null}
        {reviewedAt ? <DetailLine label="Reviewed" value={reviewedAt} /> : null}
      </SurfaceGroup>

      <View style={styles.section}>
        <SectionHeader title="Description" />
        <Text style={styles.body}>{report.description}</Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Admin response" />
        <Text style={styles.body}>{report.admin_response ?? COPY.noAdminResponse}</Text>
      </View>
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
    backgroundColor: colors.canvas,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    padding: spacing.gutter,
    gap: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  center: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  section: { gap: spacing.md },
  body: {
    ...type.body,
    color: colors.textPrimary,
  },
  detailRow: {
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  detailLabel: {
    ...type.helper,
    color: colors.textSecondary,
  },
  detailValue: {
    ...type.body,
    color: colors.textPrimary,
  },
});
