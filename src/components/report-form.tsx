import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import {
  BOOKING_REPORT_CATEGORIES,
  BookingReportCategory,
  COPY,
  REPORT_DESCRIPTION_MAX,
  formatReportCategory,
  isReportId,
  remainingReportCharacters,
  submitAppIssue,
  submitAppIssueErrorCopy,
  submitBookingErrorCopy,
  submitBookingReport,
  validateReportDescription,
} from '@/lib/reports';

const { colors, type, spacing } = SkillMatchTheme.ui;

type BookingProps = { variant: 'booking'; bookingId: string | null };
type AppIssueProps = { variant: 'app_issue' };
type Props = BookingProps | AppIssueProps;

export default function ReportForm(props: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<BookingReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionCheck = validateReportDescription(description);
  const remaining = remainingReportCharacters(description);
  const bookingReady =
    props.variant === 'booking' &&
    props.bookingId !== null &&
    isReportId(props.bookingId) &&
    category !== null;
  const inFlight = useRef(false);
  const canSubmit =
    !isSubmitting &&
    descriptionCheck.ok &&
    (props.variant === 'app_issue' || bookingReady);

  async function handleSubmit() {
    if (inFlight.current || !canSubmit) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setError(null);
    let submitted = false;
    try {
      const validated = validateReportDescription(description);
      if (!validated.ok) {
        setError(validated.reason === 'too_long' ? COPY.tooLongDescription : COPY.emptyDescription);
        return;
      }
      if (props.variant === 'booking') {
        if (!isReportId(props.bookingId) || category === null) {
          setError(COPY.bookingConflict);
          return;
        }
        await submitBookingReport(props.bookingId, category, validated.description);
        submitted = true;
        Alert.alert(COPY.bookingSubmittedTitle, COPY.bookingSubmitted, [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      await submitAppIssue(validated.description);
      submitted = true;
      Alert.alert(COPY.appIssueSubmittedTitle, COPY.appIssueSubmitted, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[R3-UI] report submit failed:', e.message);
      }
      setError(props.variant === 'booking' ? submitBookingErrorCopy(e) : submitAppIssueErrorCopy(e));
    } finally {
      if (!submitted) {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    }
  }

  if (props.variant === 'booking' && !isReportId(props.bookingId)) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="error" message={COPY.unavailable} />
      </View>
    );
  }

  const submitLabel = isSubmitting
    ? COPY.submitting
    : props.variant === 'booking'
      ? COPY.submitBooking
      : COPY.submitAppIssue;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {props.variant === 'booking' ? (
        <View style={styles.section}>
          <SectionHeader title={COPY.categoryLabel} />
          <View style={styles.chipWrap}>
            {BOOKING_REPORT_CATEGORIES.map((value) => {
              const selected = category === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setCategory(value)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <AppChip
                    label={formatReportCategory(value)}
                    variant={selected ? 'selected' : 'neutral'}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <AppField
        label={COPY.descriptionLabel}
        value={description}
        onChangeText={setDescription}
        placeholder={COPY.descriptionPlaceholder}
        multiline
        editable={!isSubmitting}
        accessibilityLabel={COPY.descriptionLabel}
        errorText={remaining < 0 ? COPY.tooLongDescription : undefined}
      />
      <Text style={remaining < 0 ? styles.counterOver : styles.counter}>
        {remaining} / {REPORT_DESCRIPTION_MAX}
      </Text>

      {error ? <AppNotice variant="danger" message={error} /> : null}

      <AppButton
        label={submitLabel}
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={isSubmitting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
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
  section: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
});
