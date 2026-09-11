import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  AdminReportDetail,
  COPY,
  REPORT_DESCRIPTION_MAX,
  ReportError,
  ReviewStatus,
  allowedReviewStatuses,
  formatReportCategory,
  formatReportStatus,
  loadAdminReport,
  loadAdminReportErrorCopy,
  remainingReportCharacters,
  reviewErrorCopy,
  reviewReport,
  validateAdminResponse,
  isReportId,
} from '@/lib/reports';

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  under_review: COPY.markUnderReview,
  resolved: COPY.resolve,
  dismissed: COPY.dismiss,
};

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
        <ActivityIndicator />
        <Text style={styles.note}>Loading report…</Text>
      </View>
    );
  }

  if (loadError || detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError ?? COPY.unavailable}</Text>
        <Pressable style={styles.outlineButton} onPress={retry} accessibilityRole="button">
          <Text style={styles.outlineButtonText}>Retry</Text>
        </Pressable>
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
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <View style={styles.statusCard}>
        <Text style={styles.eyebrow}>STATUS</Text>
        <Text style={styles.status}>{formatReportStatus(detail.status)}</Text>
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <DetailLine label="Category" value={formatReportCategory(detail.category)} />
        <DetailLine label="Reporter" value={detail.reporter_full_name} />
        <DetailLine label="Reporter ID" value={detail.reporter_id} />
        <DetailLine label="Reported" value={detail.reported_full_name} />
        <DetailLine label="Reported user ID" value={detail.reported_user_id} />
        <DetailLine label="Job" value={detail.job_title} />
        <DetailLine label="Booking ID" value={detail.booking_id} />
        <DetailLine label="Created" value={created} />
        <DetailLine label="Reviewed" value={reviewedAt} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.body}>{detail.description}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Admin response</Text>
        <Text style={styles.body}>{detail.admin_response ?? COPY.noAdminResponse}</Text>
      </View>

      {reviewTargets.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Review</Text>
          <Text style={styles.label}>{COPY.responseLabel}</Text>
          <TextInput
            style={styles.input}
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
          {reviewError ? <Text style={styles.error}>{reviewError}</Text> : null}
          {reviewTargets.map((status) => {
            const disabled = busy;
            return (
              <Pressable
                key={status}
                style={[
                  status === 'resolved' ? styles.primaryButton : styles.outlineAction,
                  disabled ? styles.buttonDisabled : null,
                ]}
                onPress={() => handleReview(status)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled, busy: reviewingStatus === status }}
              >
                <Text
                  style={status === 'resolved' ? styles.primaryButtonText : styles.outlineActionText}
                >
                  {reviewingStatus === status ? COPY.reviewing : REVIEW_LABEL[status]}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  label: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    backgroundColor: SkillMatchTheme.surface.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 96,
    color: SkillMatchTheme.text.primary,
  },
  counter: {
    fontSize: 12,
    color: SkillMatchTheme.text.secondary,
  },
  counterOver: {
    fontSize: 12,
    color: SkillMatchTheme.feedback.danger,
    fontWeight: '600',
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
  notice: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.feedback.success,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
  },
  noticeText: {
    fontSize: 15,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
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
  outlineAction: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineActionText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: SkillMatchTheme.size.primaryCtaHeight,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: SkillMatchTheme.text.inverse,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
