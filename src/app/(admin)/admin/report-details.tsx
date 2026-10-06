import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppDialog } from '@/components/app-dialog';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { reportStatusVariant } from '@/lib/status-presentation';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  AdminReportDetail,
  COPY,
  REPORT_DESCRIPTION_MAX,
  ReportBookingMessage,
  ReportError,
  ReportDisciplineState,
  ReviewStatus,
  allowedReviewStatuses,
  formatReportCategory,
  formatReportStatus,
  loadAdminReport,
  loadReportDisciplineState,
  loadAdminReportErrorCopy,
  loadReportBookingMessages,
  remainingReportCharacters,
  reviewErrorCopy,
  reviewReport,
  sendReportOutcomeEmail,
  resolveNoShowReportWithStrike,
  shouldShowStrikeAction,
  validateAdminResponse,
  isReportId,
  reportContextLabel,
} from '@/lib/reports';

const { colors, type, spacing } = SkillMatchTheme.ui;

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  under_review: COPY.markUnderReview,
  resolved: COPY.resolve,
  dismissed: COPY.dismiss,
};

export default function AdminReportDetails() {
  return <RefinementThemeProvider><AdminReportDetailsContent /></RefinementThemeProvider>;
}

function AdminReportDetailsContent() {
  const { reportId: rawReportId } = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = typeof rawReportId === 'string' ? rawReportId : null;
  const inFlight = useRef(false);

  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [discipline, setDiscipline] = useState<ReportDisciplineState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [reviewingStatus, setReviewingStatus] = useState<ReviewStatus | null>(null);
  const [isApplyingStrike, setIsApplyingStrike] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<ReportBookingMessage[] | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [strikeConfirm, setStrikeConfirm] = useState<{ response: string; body: string } | null>(null);

  const load = useCallback(async () => {
    if (!isReportId(reportId)) {
      setDetail(null);
      setLoadError(COPY.unavailable);
      return;
    }
    const row = await loadAdminReport(reportId);
    let nextDiscipline: ReportDisciplineState | null = null;
    try {
      nextDiscipline = await loadReportDisciplineState(reportId);
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[FT-05] discipline state read failed:', e.message);
      }
    }
    setDetail(row);
    setDiscipline(nextDiscipline);
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
      const emailDelivered = status === 'under_review'
        ? true
        : await sendReportOutcomeEmail(reportId);
      try {
        await load();
        setNotice(emailDelivered ? COPY.reviewSaved : COPY.emailFailed);
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

  function promptStrike() {
    if (
      inFlight.current ||
      isApplyingStrike ||
      reportId === null ||
      !shouldShowStrikeAction(discipline)
    ) {
      return;
    }
    const validated = validateAdminResponse('resolved', response);
    if (!validated.ok) {
      setReviewError(
        validated.reason === 'too_long' ? COPY.responseTooLong : COPY.responseRequired
      );
      return;
    }
    if (validated.response === null) {
      setReviewError(COPY.responseRequired);
      return;
    }
    // Same validated response and same RPC as before; only the confirmation is the shared dialog.
    setStrikeConfirm({
      response: validated.response,
      body: discipline.wouldSuspend ? COPY.strikeSuspendBody : COPY.strikeConfirmBody,
    });
  }

  async function applyStrike(adminResponse: string) {
    if (
      inFlight.current ||
      reportId === null ||
      !shouldShowStrikeAction(discipline)
    ) {
      return;
    }
    inFlight.current = true;
    setIsApplyingStrike(true);
    setReviewError(null);
    setNotice(null);
    try {
      await resolveNoShowReportWithStrike(reportId, adminResponse);
      const emailDelivered = await sendReportOutcomeEmail(reportId);
      try {
        await load();
        setNotice(emailDelivered ? COPY.strikeSaved : COPY.emailFailed);
        setResponse('');
      } catch (e: unknown) {
        if (e instanceof Error && e.message) {
          console.warn('[FT-05] post-strike refresh failed:', e.message);
        }
        setNotice(COPY.refreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[FT-05] strike RPC failed:', e.message);
      }
      setReviewError(reviewErrorCopy(e));
    } finally {
      inFlight.current = false;
      setIsApplyingStrike(false);
    }
  }

  async function retryOutcomeEmail() {
    if (inFlight.current || reportId === null) return;
    inFlight.current = true;
    setIsSendingEmail(true);
    setReviewError(null);
    setNotice(null);
    const delivered = await sendReportOutcomeEmail(reportId);
    setNotice(delivered ? COPY.emailSent : COPY.emailFailed);
    setIsSendingEmail(false);
    inFlight.current = false;
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
  const busy = reviewingStatus !== null || isApplyingStrike || isSendingEmail;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Status: where this report stands. */}
      <View style={styles.header}>
        <View style={styles.chips}>
          <AppChip label={formatReportStatus(detail.status)} variant={reportStatusVariant(detail.status)} />
        </View>
        <Text style={styles.title} accessibilityRole="header">{formatReportCategory(detail.category)}</Text>
        {created ? <Text style={styles.meta}>Submitted {created}</Text> : null}
        {reviewedAt ? <Text style={styles.meta}>Reviewed {reviewedAt}</Text> : null}
      </View>

      {notice ? (
        <AppNotice
          variant={
            notice === COPY.reviewSaved ||
            notice === COPY.strikeSaved ||
            notice === COPY.emailSent
              ? 'success'
              : 'warning'
          }
          message={notice}
        />
      ) : null}

      {/* 2. Booking or app context. */}
      <View style={styles.section}>
        <SectionHeader title="Context" />
        <SurfaceGroup>
          <FactRow label="Type" value={reportContextLabel(detail.booking_id)} />
          <FactRow label="Job" value={detail.job_title} />
          <FactRow label="Booking ID" value={detail.booking_id} selectable />
        </SurfaceGroup>
      </View>

      {/* 3. Who reported whom. */}
      <View style={styles.section}>
        <SectionHeader title="People" />
        <SurfaceGroup>
          <FactRow label="Reporter" value={detail.reporter_full_name} strong />
          <FactRow label="Reporter ID" value={detail.reporter_id} selectable />
          <FactRow label="Reported" value={detail.reported_full_name} strong />
          <FactRow label="Reported user ID" value={detail.reported_user_id} selectable />
        </SurfaceGroup>
      </View>

      {/* 4. What happened, with the booking's recorded messages as evidence. */}
      <View style={styles.section}>
        <SectionHeader title="Description" />
        <SurfaceGroup>
          <Text style={styles.prose}>{detail.description}</Text>
        </SurfaceGroup>
      </View>

      {detail.booking_id !== null ? (
        <View style={styles.section}>
          <SectionHeader title={COPY.evidenceTitle} />
          {evidenceLoading ? (
            <InlineStatus variant="loading" message={COPY.evidenceLoading} />
          ) : evidenceError ? (
            <InlineStatus variant="error" message={evidenceError} />
          ) : evidence === null || evidence.length === 0 ? (
            <InlineStatus variant="empty" icon={{ android: 'chat_bubble_outline', ios: 'bubble.left' }} message={COPY.evidenceEmpty} />
          ) : (
            <SurfaceGroup>
              {evidence.map((row) => {
                const sentAt = formatDetailDateTime(row.created_at);
                return (
                  <View key={row.message_id} style={styles.evidenceRow}>
                    <Text style={styles.evidenceSender}>
                      {row.sender_role === 'worker' ? COPY.evidenceWorker : COPY.evidenceClient}
                    </Text>
                    <Text style={styles.evidenceBody}>{row.content}</Text>
                    {sentAt ? <Text style={styles.meta}>{sentAt}</Text> : null}
                  </View>
                );
              })}
            </SurfaceGroup>
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Admin response" />
        <SurfaceGroup>
          <Text style={styles.prose}>{detail.admin_response ?? COPY.noAdminResponse}</Text>
        </SurfaceGroup>
      </View>

      {/* 5. The existing review actions, last. */}
      {reviewTargets.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Review" />
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
          {shouldShowStrikeAction(discipline) ? (
            <AppButton
              variant="destructive"
              label={isApplyingStrike ? COPY.striking : COPY.strikeAction}
              loading={isApplyingStrike}
              disabled={busy}
              onPress={promptStrike}
            />
          ) : null}
        </View>
      ) : null}

      {detail.status === 'resolved' || detail.status === 'dismissed' ? (
        <View style={styles.section}>
          <SectionHeader title="Outcome email" />
          <Text style={styles.body}>
            Send or retry the privacy-safe outcome email without changing this report review.
          </Text>
          <AppButton
            variant="secondary"
            label={isSendingEmail ? COPY.emailing : COPY.retryEmail}
            loading={isSendingEmail}
            disabled={busy}
            onPress={retryOutcomeEmail}
          />
        </View>
      ) : null}

      <AppDialog
        visible={strikeConfirm !== null}
        onRequestClose={() => setStrikeConfirm(null)}
        title={COPY.strikeConfirmTitle}
        message={strikeConfirm?.body}
        actions={
          <>
            <AppButton
              variant="destructive"
              label={COPY.strikeAction}
              onPress={() => {
                const confirmed = strikeConfirm;
                setStrikeConfirm(null);
                if (confirmed) void applyStrike(confirmed.response);
              }}
            />
            <AppButton variant="ghost" label="Not now" onPress={() => setStrikeConfirm(null)} />
          </>
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
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
  header: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.xs },
  title: { ...type.screenTitle, color: colors.textPrimary },
  meta: { ...type.helper, color: colors.textSecondary },
  section: { gap: spacing.md },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  prose: { ...type.body, color: colors.textPrimary, padding: spacing.lg },
  counter: {
    ...type.caption,
    color: colors.textSecondary,
  },
  counterOver: {
    ...type.caption,
    color: colors.error,
    fontWeight: '600',
  },
  evidenceRow: { gap: spacing.xxs, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  evidenceSender: { ...type.label, color: colors.textSecondary },
  evidenceBody: { ...type.body, color: colors.textPrimary },
});
