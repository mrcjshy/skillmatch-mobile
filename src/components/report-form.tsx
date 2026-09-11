import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
        <Text style={styles.error}>{COPY.unavailable}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {props.variant === 'booking' ? (
        <>
          <Text style={styles.label}>{COPY.categoryLabel}</Text>
          <View style={styles.chipWrap}>
            {BOOKING_REPORT_CATEGORIES.map((value) => {
              const selected = category === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                  onPress={() => setCategory(value)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                    {formatReportCategory(value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>{COPY.descriptionLabel}</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder={COPY.descriptionPlaceholder}
        multiline
        editable={!isSubmitting}
        accessibilityLabel={COPY.descriptionLabel}
      />
      <Text style={remaining < 0 ? styles.counterOver : styles.counter}>
        {remaining} / {REPORT_DESCRIPTION_MAX}
      </Text>
      {remaining < 0 ? <Text style={styles.hint}>{COPY.tooLongDescription}</Text> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submitButton, !canSubmit ? styles.submitButtonDisabled : null]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting
            ? COPY.submitting
            : props.variant === 'booking'
              ? COPY.submitBooking
              : COPY.submitAppIssue}
        </Text>
      </Pressable>
    </ScrollView>
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
    padding: 24,
  },
  label: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: SkillMatchTheme.size.iconTarget,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
  },
  chipText: {
    color: SkillMatchTheme.text.primary,
    fontSize: 14,
  },
  chipTextSelected: {
    color: SkillMatchTheme.brand.primary,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    backgroundColor: SkillMatchTheme.surface.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 120,
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
  hint: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
  },
  error: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  submitButton: {
    minHeight: SkillMatchTheme.size.primaryCtaHeight,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: SkillMatchTheme.text.inverse,
    fontSize: 16,
    fontWeight: '700',
  },
});
