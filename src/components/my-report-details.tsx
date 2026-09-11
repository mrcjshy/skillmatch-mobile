import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
        <ActivityIndicator />
        <Text style={styles.note}>Loading report…</Text>
      </View>
    );
  }

  if (loadError || report === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError ?? COPY.unavailable}</Text>
        <Pressable style={styles.outlineButton} onPress={retry} accessibilityRole="button">
          <Text style={styles.outlineButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const created = formatDetailDateTime(report.created_at);
  const reviewedAt = formatDetailDateTime(report.reviewed_at);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <View style={styles.statusCard}>
        <Text style={styles.eyebrow}>STATUS</Text>
        <Text style={styles.status}>{formatReportStatus(report.status)}</Text>
      </View>

      <View style={styles.card}>
        <DetailLine label="Category" value={formatReportCategory(report.category)} />
        <DetailLine label="Context" value={reportContextLabel(report.booking_id)} />
        <DetailLine label="Created" value={created} />
        {report.booking_id ? <DetailLine label="Booking ID" value={report.booking_id} /> : null}
        {reviewedAt ? <DetailLine label="Reviewed" value={reviewedAt} /> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.body}>{report.description}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Admin response</Text>
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
  container: {
    padding: SkillMatchTheme.spacing.screenGutter,
    gap: SkillMatchTheme.spacing.cardGap,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  card: {
    backgroundColor: SkillMatchTheme.surface.default,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: 10,
  },
  statusCard: {
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
  },
  eyebrow: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  status: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionTitle: {
    color: SkillMatchTheme.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  body: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 15,
    lineHeight: 21,
  },
  detailRow: { gap: 2 },
  detailLabel: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: SkillMatchTheme.text.primary,
    fontSize: 15,
  },
  note: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 14,
  },
  error: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  outlineButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontWeight: '700',
  },
});
