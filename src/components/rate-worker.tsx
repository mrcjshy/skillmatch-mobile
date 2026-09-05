import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  COPY,
  RATING_COMMENT_MAX,
  RATING_SCORES,
  RatingScore,
  remainingCommentCharacters,
  submitErrorCopy,
  submitRating,
  validateComment,
} from '@/lib/ratings';

/**
 * The Client's rating control for one completed Booking (BL-01B-UI).
 *
 * Rendered only where the Bookings screen has already decided this Booking is
 * rateable and unrated. It is a small dedicated component rather than more
 * inline JSX because the Client Bookings card is already long, and because the
 * submit/validation state is per-Booking and would otherwise have to be keyed
 * by Booking id in the screen's own state.
 *
 * COLLAPSED BY DEFAULT
 * --------------------
 * A completed Booking shows one "Rate Worker" button; the score selector and
 * comment box only appear once that is pressed. That keeps a list of completed
 * Bookings readable instead of turning every card into a form.
 *
 * NOTHING IS OPTIMISTIC
 * ---------------------
 * On success this component does not mark itself rated. It calls `onRated()`,
 * and the screen performs an authoritative re-read of both the caller's own
 * rating rows and the Booking list. A rating can therefore never appear as
 * submitted locally unless the server actually wrote it.
 *
 * The score is required and has no default: there is no pre-selected 5, and
 * Submit stays disabled until the Client actually chooses. A default would
 * quietly bias the data this feature exists to collect.
 */
export default function RateWorker({ bookingId, onRated }: { bookingId: string; onRated: () => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [score, setScore] = useState<RatingScore | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setIsOpen(false);
    setScore(null);
    setComment('');
    setError(null);
  }

  const commentCheck = validateComment(comment);
  const remaining = remainingCommentCharacters(comment);
  const canSubmit = score !== null && commentCheck.ok && !isSubmitting;

  /**
   * Submit, then hand refresh back to the screen.
   *
   * `isSubmitting` is the in-flight guard, so a double tap cannot write twice
   * -- and even if it did, the server's UNIQUE (booking_id, rated_by) would
   * refuse the second one as a conflict rather than storing it.
   */
  async function handleSubmit() {
    if (!canSubmit || score === null) return;
    // Re-validated here rather than trusting the render-time check, so the
    // exact value being sent is the value that was measured.
    const validated = validateComment(comment);
    if (!validated.ok) {
      setError(COPY.invalidComment);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitRating(bookingId, score, validated.comment);
      try {
        await onRated();
        // Only closed after the authoritative re-read succeeded, so the card
        // never collapses into a state the server has not confirmed.
        close();
      } catch {
        // The rating IS written; only the refresh failed. This must not read
        // as a submission failure.
        setError(COPY.refreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[BL-01B-UI] rating submit failed:', e.message);
      }
      setError(submitErrorCopy(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <Pressable
        style={styles.openButton}
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.openButtonText}>{COPY.action}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{COPY.heading}</Text>

      <Text style={styles.label}>{COPY.scoreLabel}</Text>
      <View style={styles.scoreRow}>
        {RATING_SCORES.map((value) => {
          const selected = score === value;
          return (
            <Pressable
              key={value}
              style={[styles.scoreChip, selected ? styles.scoreChipSelected : null]}
              onPress={() => setScore(value)}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={`Score ${value} of 5`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.scoreText, selected ? styles.scoreTextSelected : null]}>
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{COPY.commentLabel}</Text>
      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={setComment}
        placeholder={COPY.commentPlaceholder}
        multiline
        editable={!isSubmitting}
        accessibilityLabel={COPY.commentLabel}
      />
      {/* Counts the trimmed length, matching what the server measures.
          Over-length is reported, never silently truncated. */}
      <Text style={remaining < 0 ? styles.counterOver : styles.counter}>
        {remaining} / {RATING_COMMENT_MAX}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actionRow}>
        <Pressable
          style={styles.cancelButton}
          onPress={close}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>{COPY.cancel}</Text>
        </Pressable>
        <Pressable
          style={[styles.submitButton, !canSubmit ? styles.submitButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? COPY.submitting : COPY.submit}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  openButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
  panel: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  heading: {
    fontSize: 15,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreChip: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  scoreChipSelected: {
    backgroundColor: '#1d4ed8',
  },
  scoreText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
  scoreTextSelected: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    minHeight: 60,
    maxHeight: 140,
  },
  counter: {
    fontSize: 12,
    opacity: 0.6,
  },
  counterOver: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
