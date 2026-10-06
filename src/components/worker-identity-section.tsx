import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/app-button';
import { FormMessage } from '@/components/form-message';
import { InlineStatus } from '@/components/inline-status';
import { RadioRow } from '@/components/radio-row';
import { SectionHeader } from '@/components/section-header';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
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



export function WorkerIdentitySection({
  disabled,
  surface = 'profile',
  onSubmitted,
  authoritativeSubmission,
}: {
  disabled: boolean;
  surface?: WorkerIdentitySurface;
  onSubmitted?: (row: WorkerIdentitySubmission) => void | Promise<void>;
  /** Onboarding uses the provider's already-loaded authoritative state. */
  authoritativeSubmission?: WorkerIdentitySubmission | null;
}) {
  const ui = useUiTheme();
  const styles = createStyles(ui);

  const providerOwnsLoad = authoritativeSubmission !== undefined;
  const [loading, setLoading] = useState(!providerOwnsLoad);
  const [submission, setSubmission] = useState<WorkerIdentitySubmission | null>(
    authoritativeSubmission ?? null
  );
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
    if (providerOwnsLoad) return;
    const run = { cancelled: false };
    void load(run);
    return () => {
      run.cancelled = true;
    };
  }, [load, providerOwnsLoad]);
  useEffect(() => {
    if (providerOwnsLoad) setSubmission(authoritativeSubmission ?? null);
  }, [authoritativeSubmission, providerOwnsLoad]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const status = submission?.status ?? null;
  const locked = status === 'approved' || status === 'pending' || submitting || disabled;
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
      await onSubmitted?.(row);
      setSuccess('ID submitted for review. Upload is not approval.');
    } catch (caught: unknown) {
      console.warn('[V3-W1] identity submit failed:', classifyWorkerIdentityFailure(caught));
      setError(identityErrorCopy(caught));
    } finally {
      setSubmitting(false);
    }
  }

  // The onboarding route already titles itself and states the status, so repeating "Valid ID" and
  // "Not submitted" there would only say the same thing twice. The profile surface keeps both.
  const onboarding = surface === 'onboarding';

  return (
    <View style={styles.wrap}>
      {onboarding ? null : <SectionHeader title="Valid ID" />}
      {loading ? (
        <InlineStatus variant="loading" message="Loading your ID submission…" />
      ) : (
        <>
          {onboarding && submission === null ? null : (
            <Text style={styles.status} accessibilityRole="text">
              {statusText}
            </Text>
          )}
          {submission ? (
            <Text style={styles.meta}>
              {identityTypeLabel(submission.idType)}
              {submission.submittedAt
                ? ` · Submitted ${formatCardDateTime(submission.submittedAt)}`
                : ''}
            </Text>
          ) : null}
          {submission?.status === 'rejected' && submission.rejectionReason ? (
            <FormMessage tone="warning" message={submission.rejectionReason} />
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
              <View style={styles.group}>
                <Text style={styles.groupLabel}>ID type (required)</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="ID type" style={styles.types}>
                  {IDENTITY_TYPE_OPTIONS.map((option) => (
                    <RadioRow
                      key={option.value}
                      label={option.label}
                      selected={idType === option.value}
                      disabled={locked}
                      onPress={() => setIdType(option.value)}
                      accessibilityLabel={option.label}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.group}>
                <Text style={styles.groupLabel}>ID photo (required)</Text>
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.preview}
                    resizeMode="contain"
                    accessibilityLabel="Preview of the ID photo you selected"
                  />
                ) : null}
                <Text style={styles.help}>
                  {imageUri ? 'Photo selected.' : 'No photo chosen yet.'} JPEG, PNG or WebP, up to 5 MB.
                </Text>
                <AppButton
                  variant="secondary"
                  label={imageUri ? 'Change ID photo' : 'Choose ID photo'}
                  onPress={() => {
                    void handlePickImage();
                  }}
                  disabled={locked}
                />
              </View>
              <AppButton
                variant="primary"
                label={isResubmit ? 'Submit another ID' : 'Submit ID'}
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
          {error ? <FormMessage tone="error" message={error} /> : null}
          {success ? <FormMessage tone="success" message={success} /> : null}
        </>
      )}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
  const styles = StyleSheet.create({
    wrap: {
      gap: spacing.lg,
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
    group: {
      gap: spacing.sm,
    },
    groupLabel: {
      ...type.label,
      color: colors.textPrimary,
    },
    types: {
      gap: spacing.sm,
    },
    preview: {
      width: '100%',
      height: 160,
      borderRadius: radius.control,
      backgroundColor: colors.surfaceSunken,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
  });

  return styles;
}
