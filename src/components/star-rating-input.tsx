import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { RatingScore, RATING_SCORES } from '@/lib/ratings';

const { colors, type, spacing } = SkillMatchTheme.ui;

export const RATING_LABELS: Record<RatingScore, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export function StarRatingInput({ value, onChange, disabled = false }: {
  value: RatingScore | null;
  onChange: (value: RatingScore) => void;
  disabled?: boolean;
}) {
  return (
    <View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {RATING_SCORES.map((score) => {
          const filled = value !== null && score <= value;
          const selected = score === value;
          const label = RATING_LABELS[score];
          return (
            <Pressable
              key={score}
              style={styles.target}
              onPress={() => onChange(score)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={`${score} ${score === 1 ? 'star' : 'stars'} — ${label}`}
              accessibilityState={{ selected, disabled }}
            >
              <Text style={[styles.star, filled ? styles.filled : null]}>
                {filled ? '★' : '☆'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        style={[styles.selection, value === null ? styles.selectionEmpty : null]}
        accessibilityLiveRegion="polite"
      >
        {value === null ? 'Choose a rating' : `${value} — ${RATING_LABELS[value]}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 32, color: colors.textSecondary, lineHeight: 38 },
  filled: { color: colors.primary },
  selection: {
    marginTop: spacing.xs,
    ...type.helper,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  selectionEmpty: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
