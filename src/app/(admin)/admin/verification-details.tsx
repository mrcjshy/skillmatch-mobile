import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  IDENTITY_COPY,
  IDENTITY_ERROR,
  WorkerIdentityError,
  approveWorkerIdentity,
  createPendingIdentitySignedUrl,
  getWorkerIdentityForReview,
  identityTypeLabel,
  rejectWorkerIdentity,
  reviewErrorCopy,
  validateRejectionReason,
  type WorkerIdentityForReview,
} from '@/lib/worker-identity';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim() !== '') {
    return value[0].trim();
  }
  return null;
}

function detailsLoadErrorCopy(error: unknown): string {
  const code = error instanceof WorkerIdentityError ? error.code : null;
  if (code === IDENTITY_ERROR.FORBIDDEN || code === IDENTITY_ERROR.UNAVAILABLE) {
    return reviewErrorCopy(error);
  }
  return IDENTITY_COPY.reviewLoadFailed;
}

export default function AdminVerificationDetails() {
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = firstParam(params.userId);
  const inFlight = useRef(false);

  const [worker, setWorker] = useState<WorkerIdentityForReview | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'info' | 'warning'; headline: string } | null>(
    null
  );

  const load = useCallback(async () => {
    if (userId === null || !UUID_PATTERN.test(userId)) {
      setWorker(null);
      setImageUrl(null);
      setLoadError(IDENTITY_COPY.reviewUnavailable);
      return;
    }

    const match = await getWorkerIdentityForReview(userId);
    if (match === null) {
      setWorker(null);
      setImageUrl(null);
      setLoadError(IDENTITY_COPY.reviewUnavailable);
      return;
    }

    setWorker(match);
    setLoadError(null);

    try {
      setImageUrl(await createPendingIdentitySignedUrl(match.storagePath));
    } catch (error: unknown) {
      const code = error instanceof WorkerIdentityError ? error.code : null;
      if (code === IDENTITY_ERROR.FORBIDDEN) {
        setImageUrl(null);
        setLoadError(reviewErrorCopy(error));
        return;
      }
      setImageUrl(null);
    }
  }, [userId]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message) {
      console.warn('[V3-W1] identity review details failed:', error.message);
    }
    setLoadError(detailsLoadErrorCopy(error));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; N10-UI convention */
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
    if (isLoading || isRefreshing || inFlight.current) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refresh() {
    if (isLoading || isRefreshing || inFlight.current || submitted) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleApprove() {
    if (inFlight.current || submitted || userId === null) return;
    inFlight.current = true;
    setActing('approve');
    setNotice(null);
    try {
      await approveWorkerIdentity(userId);
      setSubmitted(true);
      setNotice({ tone: 'success', headline: IDENTITY_COPY.approvedNotice });
    } catch (error: unknown) {
      setNotice({ tone: 'warning', headline: reviewErrorCopy(error) });
    } finally {
      inFlight.current = false;
      setActing(null);
    }
  }

  async function handleReject() {
    if (inFlight.current || submitted || userId === null) return;
    const invalid = validateRejectionReason(reason);
    if (invalid !== null) {
      setNotice({ tone: 'warning', headline: invalid });
      return;
    }
    inFlight.current = true;
    setActing('reject');
    setNotice(null);
    try {
      await rejectWorkerIdentity(userId, reason);
      setSubmitted(true);
      setNotice({ tone: 'info', headline: IDENTITY_COPY.rejectedNotice });
    } catch (error: unknown) {
      setNotice({ tone: 'warning', headline: reviewErrorCopy(error, 'reject') });
    } finally {
      inFlight.current = false;
      setActing(null);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message="Loading identity review…" />
      </View>
    );
  }

  if (loadError || worker === null) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError ?? IDENTITY_COPY.reviewUnavailable}
          action={<AppButton label="Retry" variant="secondary" onPress={() => void retry()} />}
        />
      </View>
    );
  }

  const location = [worker.barangay, worker.city].filter((part): part is string => part !== null).join(', ');
  const submittedAt = formatDetailDateTime(worker.submittedAt);
  const busy = acting !== null || submitted;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {notice ? (
        notice.tone === 'info' ? (
          <AppCard variant="status">
            <Text style={styles.infoNotice}>{notice.headline}</Text>
          </AppCard>
        ) : (
          <AppNotice
            variant={notice.tone === 'success' ? 'success' : 'warning'}
            message={notice.headline}
          />
        )
      ) : null}

      <AppCard>
        <Text style={styles.sectionTitle}>Worker identity</Text>
        <DetailLine label="Name" value={worker.fullName} />
        <DetailLine label="Phone" value={worker.phone} />
        <DetailLine label="Location" value={location.length > 0 ? location : null} />
        <DetailLine label="ID type" value={identityTypeLabel(worker.idType)} />
        <DetailLine
          label="Skills"
          value={worker.skills.length > 0 ? worker.skills.join(' • ') : 'No skills added'}
        />
        <DetailLine label="Submitted" value={submittedAt} />
      </AppCard>

      <AppCard>
        <Text style={styles.sectionTitle}>ID preview</Text>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.idImage}
            contentFit="contain"
            accessibilityLabel={`${worker.fullName} identity document`}
          />
        ) : (
          <Text style={styles.body}>ID image is not available.</Text>
        )}
      </AppCard>

      <AppCard>
        <Text style={styles.sectionTitle}>Review</Text>
        <Text style={styles.body}>
          Approve reviews the ID and verifies the Worker. Reject leaves verification unchanged.
        </Text>
        <AppField
          label="Rejection reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Required to reject (1–500 characters)"
          multiline
          editable={!busy}
          accessibilityLabel={`Rejection reason for ${worker.fullName}`}
        />
        <AppButton
          variant="primary"
          label={acting === 'approve' ? 'Working…' : submitted ? 'Review submitted' : 'Approve ID'}
          loading={acting === 'approve'}
          disabled={busy}
          onPress={() => {
            void handleApprove();
          }}
          accessibilityLabel={`Approve identity for ${worker.fullName}`}
        />
        <AppButton
          variant="secondary"
          label="Reject ID"
          disabled={busy}
          onPress={() => {
            void handleReject();
          }}
          accessibilityLabel={`Reject identity for ${worker.fullName}`}
        />
      </AppCard>
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
  sectionTitle: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  infoNotice: {
    ...type.helper,
    color: colors.textPrimary,
  },
  idImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
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
