import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { InitialsAvatar } from '@/components/initials-avatar';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
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
  return <RefinementThemeProvider><AdminVerificationDetailsContent /></RefinementThemeProvider>;
}

function AdminVerificationDetailsContent() {
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
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {notice ? (
        <AppNotice
          variant={notice.tone === 'info' ? 'info' : notice.tone === 'success' ? 'success' : 'warning'}
          message={notice.headline}
        />
      ) : null}

      {/* 1. Who is asking to be verified. */}
      <View style={styles.identity}>
        <InitialsAvatar name={worker.fullName} accent={colors.accentSubtle} size={64} />
        <View style={styles.identityCopy}>
          <Text style={styles.name} accessibilityRole="header">{worker.fullName}</Text>
          {submittedAt ? <Text style={styles.meta}>Submitted {submittedAt}</Text> : null}
          <View style={styles.chips}>
            <AppChip
              label={submitted ? 'Review submitted' : 'Pending review'}
              variant={submitted ? 'neutral' : 'warning'}
            />
          </View>
        </View>
      </View>

      {/* 2. What they submitted. */}
      <View style={styles.section}>
        <SectionHeader title="Submitted information" />
        <SurfaceGroup>
          <FactRow label="ID type" value={identityTypeLabel(worker.idType)} />
          <FactRow label="Phone" value={worker.phone} selectable />
          <FactRow label="Location" value={location.length > 0 ? location : null} />
        </SurfaceGroup>
      </View>

      {/* 3. The authorised ID evidence. */}
      <View style={styles.section}>
        <SectionHeader title="ID photo" />
        <SurfaceGroup>
          <View style={styles.evidence}>
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
          </View>
        </SurfaceGroup>
      </View>

      {/* 4. Skills the Worker offers. */}
      <View style={styles.section}>
        <SectionHeader title="Skills" />
        {worker.skills.length > 0 ? (
          <View style={styles.chips}>
            {worker.skills.map((skill, index) => <AppChip key={`${index}-${skill}`} label={skill} />)}
          </View>
        ) : (
          <Text style={styles.body}>No skills added</Text>
        )}
      </View>

      {/* 5. The decision, last. */}
      <View style={styles.section}>
        <SectionHeader title="Decision" />
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
      </View>
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
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...type.screenTitle, color: colors.textPrimary },
  meta: { ...type.helper, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.md },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  evidence: { padding: spacing.md },
  idImage: {
    width: '100%',
    height: 240,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
  },
});
