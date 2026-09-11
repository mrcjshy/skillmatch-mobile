import { type Href, useFocusEffect, useRouter } from 'expo-router';
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
        <ActivityIndicator />
        <Text style={styles.note}>Loading your reports…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable style={styles.outlineButton} onPress={retry} accessibilityRole="button">
          <Text style={styles.outlineButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      {reports.length === 0 ? (
        <Text style={styles.note}>{COPY.emptyMyReports}</Text>
      ) : (
        reports.map((report) => {
          const created = formatCardDateTime(report.created_at);
          return (
            <Pressable
              key={report.id}
              style={styles.card}
              onPress={() => {
                const pathname = role === 'worker' ? '/worker/my-report-details' : '/client/my-report-details';
                router.push({ pathname, params: { reportId: report.id } } as unknown as Href);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${formatReportCategory(report.category)}, ${formatReportStatus(report.status)}. View report details`}
            >
              <View style={styles.topRow}>
                <Text style={styles.title}>{formatReportCategory(report.category)}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{formatReportStatus(report.status)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>{reportContextLabel(report.booking_id)}</Text>
              {created ? <Text style={styles.meta}>{created}</Text> : null}
              <Text style={styles.affordance}>View details →</Text>
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
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    color: SkillMatchTheme.text.primary,
    fontSize: 16,
    fontWeight: '700',
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
  meta: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 14,
  },
  affordance: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  note: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 14,
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
