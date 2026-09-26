import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import {
  BOOKING_KEYS, BOOKING_LABELS, JOB_KEYS, JOB_LABELS,
  PAYMENT_METHOD_KEYS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_KEYS, PAYMENT_STATUS_LABELS,
  REPORT_KEYS, REPORT_LABELS, sumBucket, type AdminAnalyticsView,
} from '@/lib/admin-analytics';
import { formatDetailDateTime } from '@/lib/date-time';

const { colors, type, spacing } = SkillMatchTheme.ui;

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <AppCard style={styles.metric}>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </AppCard>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <AppCard>{children}</AppCard>
    </View>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowCount}>{value.toLocaleString()}</Text>
    </View>
  );
}

export function AdminAnalyticsDashboard({
  view, onRefresh, onRetry, onNotifications, onIdentityReviews, onReports, onWorkers, onClients,
  footer,
}: {
  view: AdminAnalyticsView;
  onRefresh: () => void;
  onRetry: () => void;
  onNotifications: () => void;
  onIdentityReviews: () => void;
  onReports: () => void;
  onWorkers: () => void;
  onClients: () => void;
  footer: ReactNode;
}) {
  const summary = view.snapshot;
  const updated = summary ? formatDetailDateTime(summary.asOf) : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={view.refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={styles.heading}>Admin Dashboard</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inbox</Text>
        <AppButton label="Notifications" variant="secondary" onPress={onNotifications} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Directories</Text>
        <View style={styles.directoryButtons}>
          <AppButton label="Workers" variant="secondary" onPress={onWorkers} />
          <AppButton label="Clients" variant="secondary" onPress={onClients} />
        </View>
      </View>
      <Text style={styles.context}>
        Current retained-data snapshot, including inactive accounts and retained test data.
      </Text>
      {summary && updated ? <Text style={styles.updated}>Updated {updated}</Text> : null}

      {view.loading && !summary ? (
        <InlineStatus variant="loading" message="Loading Admin analytics…" />
      ) : null}
      {view.error ? (
        <View style={styles.errorGroup}>
          <AppNotice
            variant="danger"
            message={summary ? `${view.error} Showing the previous snapshot.` : view.error}
          />
          <AppButton label="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}

      {summary ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.metricGrid}>
              <Metric label="Total Workers" value={summary.totalWorkers} />
              <Metric label="Verified Workers" value={summary.verifiedWorkers} />
              <Metric label="Total Clients" value={summary.totalClients} />
              <Metric label="Total Jobs" value={sumBucket(summary.jobsByStatus)} />
              <Metric label="Total Bookings" value={sumBucket(summary.bookingsByStatus)} />
              <Metric label="Completed Bookings" value={summary.completedBookings} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <AppCard>
              <CountRow label="Pending ID reviews" value={summary.pendingWorkerVerifications} />
              <AppButton label="Open ID reviews" variant="secondary" onPress={onIdentityReviews} />
              <CountRow label="Reports needing attention" value={summary.reportsNeedingAttention} />
              <AppButton label="Open Reports" variant="secondary" onPress={onReports} />
              <Text style={styles.helper}>These counts describe review work. Opening a list does not complete a review.</Text>
            </AppCard>
          </View>

          <Section title="Jobs by status">
            {JOB_KEYS.map((key) => <CountRow key={key} label={JOB_LABELS[key]} value={summary.jobsByStatus[key]} />)}
          </Section>
          <Section title="Bookings by status">
            {BOOKING_KEYS.map((key) => <CountRow key={key} label={BOOKING_LABELS[key]} value={summary.bookingsByStatus[key]} />)}
          </Section>
          <Section title="Payments by method and status">
            <Text style={styles.helper}>Counts of Bookings, not money. GCash and Maya are retained legacy categories.</Text>
            {PAYMENT_METHOD_KEYS.map((method) => (
              <View key={method} style={styles.paymentGroup}>
                <Text style={styles.paymentTitle}>{PAYMENT_METHOD_LABELS[method]}</Text>
                {PAYMENT_STATUS_KEYS.map((status) => (
                  <CountRow
                    key={status}
                    label={PAYMENT_STATUS_LABELS[status]}
                    value={summary.paymentsByMethodStatus[method][status]}
                  />
                ))}
              </View>
            ))}
          </Section>
          <Section title="Reports by status">
            {REPORT_KEYS.map((key) => <CountRow key={key} label={REPORT_LABELS[key]} value={summary.reportsByStatus[key]} />)}
          </Section>
        </>
      ) : !view.loading && !view.error ? (
        <InlineStatus variant="loading" message="Preparing Admin analytics…" />
      ) : null}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.gutter, paddingBottom: spacing.xxxl + spacing.sm, gap: spacing.lg },
  heading: { ...type.screenTitle, color: colors.textPrimary },
  context: { ...type.helper, color: colors.textSecondary },
  updated: { ...type.caption, color: colors.textSecondary },
  section: { gap: spacing.md },
  directoryButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionTitle: { ...type.sectionTitle, color: colors.textPrimary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { flexBasis: '46%', flexGrow: 1, minWidth: 128, padding: spacing.md },
  metricValue: { ...type.screenTitle, color: colors.textPrimary },
  metricLabel: { ...type.helper, color: colors.textSecondary },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { ...type.helper, color: colors.textSecondary, flexShrink: 1 },
  rowCount: { ...type.bodyEmphasis, color: colors.textPrimary },
  helper: { ...type.caption, color: colors.textSecondary },
  paymentGroup: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  paymentTitle: { ...type.cardTitle, color: colors.textPrimary },
  errorGroup: { gap: spacing.sm },
});
