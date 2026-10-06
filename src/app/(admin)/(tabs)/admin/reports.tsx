import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminRow } from '@/components/admin-rows';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { groupPosition, groupedRowStyle } from '@/components/grouped-row';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider, useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { isOpenReport } from '@/lib/admin-presentation';
import { reportStatusVariant } from '@/lib/status-presentation';
import { formatCardDateTime } from '@/lib/date-time';
import {
  AdminReportListRow,
  COPY,
  ReportError,
  formatReportCategory,
  formatReportStatus,
  loadAdminReports,
  loadAdminReportsErrorCopy,
  reportContextLabel,
} from '@/lib/reports';
import { useAccount } from '@/providers/account-provider';

export default function AdminReports() {
  return <RefinementThemeProvider><AdminReportsContent /></RefinementThemeProvider>;
}

function AdminReportsContent() {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const router = useRouter();
  const { account } = useAccount();
  const adminId = account?.id;
  const hasLoaded = useRef(false);
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

  // A tab stays mounted, so read on every focus: a review saved in Report details shows on return.
  useFocusEffect(
    useCallback(() => {
      if (!adminId) return undefined;
      const run = { cancelled: false };
      if (!hasLoaded.current) setIsLoading(true);
      load()
        .catch((e: unknown) => {
          if (!run.cancelled) applyError(e);
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

  // Same rows and order as list_reports returns, split by whether an Admin can still act on them.
  const open = reports.filter((report) => isOpenReport(report.status));
  const closed = reports.filter((report) => !isOpenReport(report.status));

  const renderGroup = (title: string, rows: AdminReportListRow[], empty: string) => (
    <View style={styles.section}>
      <SectionHeader
        title={title}
        trailing={<Text style={styles.count}>{rows.length === 1 ? '1 report' : `${rows.length} reports`}</Text>}
      />
      {rows.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        <View>
          {rows.map((report, index) => {
            const created = formatCardDateTime(report.created_at);
            const category = formatReportCategory(report.category);
            const status = formatReportStatus(report.status);
            return (
              <AdminRow
                key={report.report_id}
                style={groupedRowStyle(ui, groupPosition(index, rows.length))}
                title={category}
                lines={[
                  report.reported_full_name
                    ? `${reportContextLabel(report.booking_id)} · Reported: ${report.reported_full_name}`
                    : reportContextLabel(report.booking_id),
                  `Reporter: ${report.reporter_full_name}`,
                  created,
                ]}
                trailing={<AppChip label={status} variant={reportStatusVariant(report.status)} />}
                onPress={() => {
                  router.push({
                    pathname: '/admin/report-details',
                    params: { reportId: report.report_id },
                  } as unknown as Href);
                }}
                accessibilityLabel={`${category}, ${status}. View report details`}
              />
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={ui.colors.accent}
          colors={[ui.colors.accent]}
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
        <InlineStatus variant="empty" icon={{ android: 'flag', ios: 'flag' }} message={COPY.adminEmpty} />
      ) : (
        <>
          {renderGroup('Open', open, 'No open reports.')}
          {renderGroup('Closed', closed, 'No closed reports.')}
        </>
      )}
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxxl },
    section: { gap: spacing.md },
    count: { ...type.label, color: colors.textSecondary },
    empty: { ...type.helper, color: colors.textSecondary },
  });
}
