import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminCountRow, AdminRow } from '@/components/admin-rows';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import {
  BOOKING_KEYS, BOOKING_LABELS, JOB_KEYS, JOB_LABELS,
  PAYMENT_METHOD_KEYS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_KEYS, PAYMENT_STATUS_LABELS,
  REPORT_KEYS, REPORT_LABELS, sumBucket, type AdminAnalyticsView,
} from '@/lib/admin-analytics';
import { idReviewAttention, plural, reportAttention } from '@/lib/admin-presentation';
import { formatDetailDateTime } from '@/lib/date-time';

/** QR Ph is the PayMongo method, which runs in TEST mode; say so wherever it is counted. */
function paymentMethodTitle(method: (typeof PAYMENT_METHOD_KEYS)[number]): string {
  return method === 'qrph' ? `${PAYMENT_METHOD_LABELS.qrph} (PayMongo TEST)` : PAYMENT_METHOD_LABELS[method];
}

/** "Pending 1 · Paid 2 · Refunded 0 · Not set 0" in the summary's fixed status order. */
function paymentStatusLine(bucket: Record<(typeof PAYMENT_STATUS_KEYS)[number], number>): string {
  return PAYMENT_STATUS_KEYS.map((key) => `${PAYMENT_STATUS_LABELS[key]} ${bucket[key].toLocaleString()}`).join(' · ');
}

/**
 * Admin Home below its sticky header: what needs attention first (always reachable, even while the
 * counts load), then the existing analytics summary as plain counted rows. Every number comes from
 * the one `get_admin_analytics_summary` read; there are no charts, tiles or derived metrics.
 */
export function AdminAnalyticsDashboard({
  view, onRefresh, onRetry, onIdentityReviews, onReports, footer,
}: {
  view: AdminAnalyticsView;
  onRefresh: () => void;
  onRetry: () => void;
  onIdentityReviews: () => void;
  onReports: () => void;
  footer: ReactNode;
}) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const summary = view.snapshot;
  const updated = summary ? formatDetailDateTime(summary.asOf) : null;
  const pendingIds = summary?.pendingWorkerVerifications ?? 0;
  const openReports = summary?.reportsNeedingAttention ?? 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={view.refreshing} onRefresh={onRefresh} tintColor={ui.colors.accent} colors={[ui.colors.accent]} />
      }
    >
      <View style={styles.section}>
        <SectionHeader title="Needs attention" />
        <SurfaceGroup inset={ui.spacing.lg}>
          <AdminRow
            icon={{ android: 'badge', ios: 'person.text.rectangle' }}
            title="ID reviews"
            lines={[idReviewAttention(summary)]}
            trailing={pendingIds > 0 ? <AppChip label={`${pendingIds.toLocaleString()} waiting`} variant="warning" /> : undefined}
            onPress={onIdentityReviews}
            accessibilityLabel={`ID reviews, ${idReviewAttention(summary)}`}
          />
          <AdminRow
            icon={{ android: 'flag', ios: 'flag' }}
            title="Reports"
            lines={[reportAttention(summary)]}
            trailing={openReports > 0 ? <AppChip label={`${openReports.toLocaleString()} open`} variant="warning" /> : undefined}
            onPress={onReports}
            accessibilityLabel={`Reports, ${reportAttention(summary)}`}
          />
        </SurfaceGroup>
        <Text style={styles.note}>Opening a list does not complete a review.</Text>
      </View>

      {view.error ? (
        <View style={styles.errorGroup}>
          <AppNotice variant="danger" message={summary ? `${view.error} Showing the previous snapshot.` : view.error} />
          <AppButton label="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}

      {summary ? (
        <>
          <View style={styles.section}>
            <SectionHeader title="Platform summary" subtitle={updated ? `Updated ${updated}` : undefined} />
            <SurfaceGroup>
              <AdminCountRow label="Workers" value={summary.totalWorkers} detail={`${summary.verifiedWorkers.toLocaleString()} verified`} />
              <AdminCountRow label="Clients" value={summary.totalClients} />
              <AdminCountRow label="Jobs" value={sumBucket(summary.jobsByStatus)} />
              <AdminCountRow label="Bookings" value={sumBucket(summary.bookingsByStatus)} detail={`${summary.completedBookings.toLocaleString()} completed`} />
              <AdminCountRow label="Reports" value={sumBucket(summary.reportsByStatus)} />
            </SurfaceGroup>
            <Text style={styles.note}>Current retained-data snapshot, including inactive accounts and retained test data.</Text>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Bookings by status" />
            <SurfaceGroup>
              {BOOKING_KEYS.map((key) => <AdminCountRow key={key} label={BOOKING_LABELS[key]} value={summary.bookingsByStatus[key]} />)}
            </SurfaceGroup>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Jobs by status" />
            <SurfaceGroup>
              {JOB_KEYS.map((key) => <AdminCountRow key={key} label={JOB_LABELS[key]} value={summary.jobsByStatus[key]} />)}
            </SurfaceGroup>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Payments"
              subtitle="Counts of Bookings by payment method, not money. PayMongo runs in TEST mode, so no real money moves. GCash and Maya are retained legacy categories."
            />
            <SurfaceGroup>
              {PAYMENT_METHOD_KEYS.map((method) => {
                const bucket = summary.paymentsByMethodStatus[method];
                return (
                  <AdminCountRow
                    key={method}
                    label={paymentMethodTitle(method)}
                    value={sumBucket(bucket)}
                    detail={paymentStatusLine(bucket)}
                  />
                );
              })}
            </SurfaceGroup>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Reports by status" subtitle={plural(summary.reportsNeedingAttention, 'report') + ' open'} />
            <SurfaceGroup>
              {REPORT_KEYS.map((key) => <AdminCountRow key={key} label={REPORT_LABELS[key]} value={summary.reportsByStatus[key]} />)}
            </SurfaceGroup>
          </View>
        </>
      ) : view.loading ? (
        <InlineStatus variant="loading" message="Loading Admin analytics…" />
      ) : !view.error ? (
        <InlineStatus variant="loading" message="Preparing Admin analytics…" />
      ) : null}

      {footer}
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxxxl, gap: spacing.xl },
    section: { gap: spacing.md },
    note: { ...type.helper, color: colors.textSecondary },
    errorGroup: { gap: spacing.sm },
  });
}
