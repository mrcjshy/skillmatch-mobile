import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import {
  IDENTITY_COPY,
  IDENTITY_TYPE_OPTIONS,
  canResubmitIdentity,
  classifyWorkerIdentityFailure,
  getMyIdentitySubmission,
  identityErrorCopy,
  identityProfileStatusLabel,
  identityStatusLabel,
  identityTypeLabel,
  shouldShowWorkerIdentityForm,
  submitMyValidIdImage,
  type IdentityIdType,
  type WorkerIdentitySubmission,
  type WorkerIdentitySurface,
} from '@/lib/worker-identity';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

export function WorkerIdentitySection({
  disabled,
  surface = 'profile',
  onSubmitted,
}: {
  disabled: boolean;
  surface?: WorkerIdentitySurface;
  onSubmitted?: (row: WorkerIdentitySubmission) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<WorkerIdentitySubmission | null>(null);
  const [idType, setIdType] = useState<IdentityIdType | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);

  const load = useCallback(async (run: { cancelled: boolean }) => {
    try {
      const row = await getMyIdentitySubmission();
      if (run.cancelled) return;
      setSubmission(row);
      setError(null);
    } catch (caught: unknown) {
      if (run.cancelled) return;
      console.warn('[V3-W1] identity load failed:', classifyWorkerIdentityFailure(caught));
      setError(identityErrorCopy(caught));
    } finally {
      if (!run.cancelled) setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; same convention as resume-builder */
  useEffect(() => {
    const run = { cancelled: false };
    void load(run);
    return () => {
      run.cancelled = true;
    };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const status = submission?.status ?? null;
  const locked = status === 'approved' || submitting || disabled;
  const canResubmit = canResubmitIdentity(status);
  const showForm = shouldShowWorkerIdentityForm({
    surface,
    status,
    resubmitOpen,
  });
  const isResubmit = submission !== null;
  const statusText =
    surface === 'profile' ? identityProfileStatusLabel(status) : identityStatusLabel(status);

  async function handlePickImage() {
    if (locked || !canResubmit) return;
    setError(null);
    setSuccess(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(IDENTITY_COPY.invalidImage);
      return;
    }
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: false,
      });
      if (picked.canceled) return;
      const uri = picked.assets[0]?.uri;
      if (typeof uri !== 'string' || uri.length === 0) {
        setError(IDENTITY_COPY.invalidImage);
        return;
      }
      setImageUri(uri);
    } catch {
      setError(IDENTITY_COPY.invalidImage);
    }
  }

  async function handleSubmit() {
    if (locked || !canResubmit || submitting) return;
    if (idType === null) {
      setError(IDENTITY_COPY.invalidType);
      return;
    }
    if (imageUri === null) {
      setError(IDENTITY_COPY.invalidImage);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const row = await submitMyValidIdImage({ idType, imageUri });
      setSubmission(row);
      setImageUri(null);
      setResubmitOpen(false);
      setSuccess('ID submitted for review. Upload is not approval.');
      onSubmitted?.(row);
    } catch (caught: unknown) {
      console.warn('[V3-W1] identity submit failed:', classifyWorkerIdentityFailure(caught));
      setError(identityErrorCopy(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Valid ID" />
      {loading ? (
        <InlineStatus variant="loading" message="Loading your ID submission…" />
      ) : (
        <>
          <Text style={styles.status} accessibilityRole="text">
            {statusText}
          </Text>
          {submission ? (
            <Text style={styles.meta}>
              {identityTypeLabel(submission.idType)}
              {submission.submittedAt
                ? ` · Submitted ${formatCardDateTime(submission.submittedAt)}`
                : ''}
            </Text>
          ) : null}
          {submission?.status === 'rejected' && submission.rejectionReason ? (
            <AppNotice variant="warning" message={submission.rejectionReason} />
          ) : null}
          {submission?.status === 'approved' ? (
            <Text style={styles.help}>Your approved ID cannot be replaced.</Text>
          ) : null}
          {showForm ? (
            <>
              <Text style={styles.help}>
                {isResubmit
                  ? 'Upload a new photo to replace this submission. Administrators review it before verification. A submitted photo is not an approval.'
                  : 'Upload a photo of your ID. Administrators review it before verification. A submitted photo is not an approval.'}
              </Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="ID type" style={styles.types}>
                {IDENTITY_TYPE_OPTIONS.map((option) => {
                  const selected = idType === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.typeOption, selected && styles.typeOptionSelected]}
                      onPress={() => setIdType(option.value)}
                      disabled={locked}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: locked }}
                      accessibilityLabel={option.label}
                    >
                      <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <AppButton
                variant="secondary"
                label={imageUri ? 'Photo selected' : 'Choose ID photo'}
                onPress={() => {
                  void handlePickImage();
                }}
                disabled={locked}
              />
              <AppButton
                variant="primary"
                label={isResubmit ? 'Resubmit ID' : 'Submit ID'}
                onPress={() => {
                  void handleSubmit();
                }}
                loading={submitting}
                disabled={locked}
              />
            </>
          ) : null}
          {!showForm && canResubmit && submission !== null && surface === 'profile' ? (
            <AppButton
              variant="secondary"
              label="Resubmit"
              onPress={() => {
                setError(null);
                setSuccess(null);
                setResubmitOpen(true);
              }}
              disabled={locked}
            />
          ) : null}
          {error ? <AppNotice variant="danger" message={error} /> : null}
          {success ? <AppNotice variant="success" message={success} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  status: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  types: {
    gap: spacing.sm,
  },
  typeOption: {
    minHeight: size.ghostButton,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  typeOptionSelected: {
    backgroundColor: colors.surface,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  typeLabelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
});
