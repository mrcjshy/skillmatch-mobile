import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard, type AppCardTone } from '@/components/app-card';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  AdminReportDetail,
  COPY,
  REPORT_DESCRIPTION_MAX,
  ReportBookingMessage,
  ReportError,
  ReviewStatus,
  allowedReviewStatuses,
  formatReportCategory,
  formatReportStatus,
  loadAdminReport,
  loadAdminReportErrorCopy,
  loadReportBookingMessages,
  remainingReportCharacters,
  reviewErrorCopy,
  reviewReport,
  validateAdminResponse,
  isReportId,
} from '@/lib/reports';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  under_review: COPY.markUnderReview,
  resolved: COPY.resolve,
  dismissed: COPY.dismiss,
};

function reportStatusTone(status: string): AppCardTone | undefined {
  if (status === 'resolved') return 'success';
  if (status === 'dismissed') return 'danger';
  if (status === 'under_review') return 'warning';
  return undefined;
}

export default function AdminReportDetails() {
  const { reportId: rawReportId } = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = typeof rawReportId === 'string' ? rawReportId : null;
  const inFlight = useRef(false);

  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [reviewingStatus, setReviewingStatus] = useState<ReviewStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<ReportBookingMessage[] | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isReportId(reportId)) {
      setDetail(null);
      setLoadError(COPY.unavailable);
      return;
    }
    const row = await loadAdminReport(reportId);
    setDetail(row);
    setLoadError(null);
  }, [reportId]);

  const applyError = useCallback((e: unknown) => {
    if (e instanceof ReportError) {
      console.warn('[R3-UI] get_report failed:', e.code, e.message);
    } else if (e instanceof Error && e.message) {
      console.warn('[R3-UI] get_report failed:', e.message);
    }
    setLoadError(loadAdminReportErrorCopy(e));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount */
  useEffect(() => {
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
  }, [load, applyError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const evidenceBookingId = detail?.booking_id ?? null;

  /* eslint-disable react-hooks/set-state-in-effect -- evidence fetch is report-scoped */
  useEffect(() => {
    if (evidenceBookingId === null || !isReportId(reportId)) {
      setEvidence(null);
      setEvidenceError(null);
      setEvidenceLoading(false);
      return;
    }
    const run = { cancelled: false };
    setEvidenceLoading(true);
    setEvidenceError(null);
    loadReportBookingMessages(reportId)
      .then((rows) => {
        if (run.cancelled) return;
        setEvidence(rows);
        setEvidenceError(null);
      })
      .catch((e: unknown) => {
        if (run.cancelled) return;
        if (e instanceof ReportError) {
          console.warn('[R3B-UI] get_report_booking_messages failed:', e.code, e.message);
        } else if (e instanceof Error && e.message) {
          console.warn('[R3B-UI] get_report_booking_messages failed:', e.message);
        }
        setEvidence(null);
        setEvidenceError(loadAdminReportErrorCopy(e));
      })
      .finally(() => {
        if (!run.cancelled) setEvidenceLoading(false);
      });
    return () => {
      run.cancelled = true;
    };
  }, [evidenceBookingId, reportId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function retry() {
    if (isLoading || isRefreshing || inFlight.current) return;
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
    if (isLoading || isRefreshing || inFlight.current) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleReview(status: ReviewStatus) {
    if (inFlight.current || detail === null || reportId === null) return;
    const allowed = allowedReviewStatuses(detail.status);
    if (!allowed.includes(status)) return;
    const validated = validateAdminResponse(status, response);
    if (!validated.ok) {
      setReviewError(validated.reason === 'too_long' ? COPY.responseTooLong : COPY.responseRequired);
      return;
    }

    inFlight.current = true;
    setReviewingStatus(status);
    setReviewError(null);
    setNotice(null);
    try {
      await reviewReport(reportId, status, validated.response);
      try {
        await load();
        setNotice(COPY.reviewSaved);
        setResponse('');
      } catch (e: unknown) {
        if (e instanceof Error && e.message) {
          console.warn('[R3-UI] post-review refresh failed:', e.message);
        }
        setNotice(COPY.refreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[R3-UI] review_report failed:', e.message);
      }
      setReviewError(reviewErrorCopy(e));
    } finally {
      inFlight.current = false;
      setReviewingStatus(null);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message="Loading report…" />
      </View>
    );
  }

  if (loadError || detail === null) {
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

  const created = formatDetailDateTime(detail.created_at);
  const reviewedAt = formatDetailDateTime(detail.reviewed_at);
  const reviewTargets = allowedReviewStatuses(detail.status);
  const remaining = remainingReportCharacters(response);
  const busy = reviewingStatus !== null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <AppCard variant="status" tone={reportStatusTone(detail.status)}>
        <Text style={styles.eyebrow}>STATUS</Text>
        <Text style={styles.status}>{formatReportStatus(detail.status)}</Text>
      </AppCard>

      {notice ? (
        <AppNotice
          variant={notice === COPY.reviewSaved ? 'success' : 'warning'}
          message={notice}
        />
      ) : null}

      <AppCard>
        <DetailLine label="Category" value={formatReportCategory(detail.category)} />
        <DetailLine label="Reporter" value={detail.reporter_full_name} />
        <DetailLine label="Reporter ID" value={detail.reporter_id} />
        <DetailLine label="Reported" value={detail.reported_full_name} />
        <DetailLine label="Reported user ID" value={detail.reported_user_id} />
        <DetailLine label="Job" value={detail.job_title} />
        <DetailLine label="Booking ID" value={detail.booking_id} />
        <DetailLine label="Created" value={created} />
        <DetailLine label="Reviewed" value={reviewedAt} />
      </AppCard>

      <AppCard>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.body}>{detail.description}</Text>
      </AppCard>

      {detail.booking_id !== null ? (
        <AppCard>
          <Text style={styles.sectionTitle}>{COPY.evidenceTitle}</Text>
          {evidenceLoading ? (
            <InlineStatus variant="loading" message={COPY.evidenceLoading} />
          ) : evidenceError ? (
            <InlineStatus variant="error" message={evidenceError} />
          ) : evidence === null || evidence.length === 0 ? (
            <InlineStatus variant="empty" message={COPY.evidenceEmpty} />
          ) : (
            evidence.map((row) => {
              const sentAt = formatDetailDateTime(row.created_at);
              return (
                <View key={row.message_id} style={styles.evidenceRow}>
                  <Text style={styles.detailLabel}>
                    {row.sender_role === 'worker' ? COPY.evidenceWorker : COPY.evidenceClient}
                  </Text>
                  <Text style={styles.body}>{row.content}</Text>
                  {sentAt ? <Text style={styles.evidenceTime}>{sentAt}</Text> : null}
                </View>
              );
            })
          )}
        </AppCard>
      ) : null}

      <AppCard>
        <Text style={styles.sectionTitle}>Admin response</Text>
        <Text style={styles.body}>{detail.admin_response ?? COPY.noAdminResponse}</Text>
      </AppCard>

      {reviewTargets.length > 0 ? (
        <AppCard>
          <Text style={styles.sectionTitle}>Review</Text>
          <AppField
            label={COPY.responseLabel}
            value={response}
            onChangeText={setResponse}
            placeholder={COPY.responsePlaceholder}
            multiline
            editable={!busy}
            accessibilityLabel={COPY.responseLabel}
          />
          <Text style={remaining < 0 ? styles.counterOver : styles.counter}>
            {remaining} / {REPORT_DESCRIPTION_MAX}
          </Text>
          {reviewError ? <AppNotice variant="danger" message={reviewError} /> : null}
          {reviewTargets.map((status) => {
            const disabled = busy;
            const isReviewingThis = reviewingStatus === status;
            return (
              <AppButton
                key={status}
                variant={status === 'resolved' ? 'primary' : 'secondary'}
                label={isReviewingThis ? COPY.reviewing : REVIEW_LABEL[status]}
                loading={isReviewingThis}
                disabled={disabled}
                onPress={() => handleReview(status)}
              />
            );
          })}
        </AppCard>
      ) : null}
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
  content: {
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
  status: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  sectionTitle: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  counter: {
    ...type.caption,
    color: colors.textSecondary,
  },
  counterOver: {
    ...type.caption,
    color: colors.danger,
    fontWeight: '600',
  },
  evidenceRow: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  evidenceTime: {
    ...type.caption,
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
