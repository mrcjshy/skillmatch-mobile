import { type Href, useRouter } from 'expo-router';
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
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>Loading reports…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable style={styles.outlineButton} onPress={retry} accessibilityRole="button">
            <Text style={styles.outlineButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : reports.length === 0 ? (
        <Text style={styles.note}>{COPY.adminEmpty}</Text>
      ) : (
        reports.map((report) => {
          const created = formatCardDateTime(report.created_at);
          return (
            <Pressable
              key={report.report_id}
              style={styles.card}
              onPress={() => {
                router.push({
                  pathname: '/admin/report-details',
                  params: { reportId: report.report_id },
                } as unknown as Href);
              }}
              accessibilityRole="button"
            >
              <View style={styles.topRow}>
                <Text style={styles.title}>{formatReportCategory(report.category)}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{formatReportStatus(report.status)}</Text>
                </View>
              </View>
              <Text style={styles.line}>Reporter: {report.reporter_full_name}</Text>
              <Text style={styles.line}>
                Reported: {report.reported_full_name ?? 'App issue'}
              </Text>
              {report.booking_id ? <Text style={styles.line}>Booking ID: {report.booking_id}</Text> : null}
              {created ? <Text style={styles.meta}>{created}</Text> : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SkillMatchTheme.spacing.screenGutter,
    gap: SkillMatchTheme.spacing.cardGap,
    paddingBottom: 48,
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: SkillMatchTheme.surface.default,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: SkillMatchTheme.text.primary,
  },
  statusPill: {
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  line: {
    fontSize: 14,
    color: SkillMatchTheme.text.primary,
  },
  meta: {
    fontSize: 13,
    color: SkillMatchTheme.text.secondary,
  },
  note: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
    textAlign: 'center',
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
