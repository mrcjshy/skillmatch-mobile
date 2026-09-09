import { StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

export function StarRatingDisplay({ average, count, showNumeric = true }: {
  average: number | null;
  count?: number | null;
  showNumeric?: boolean;
}) {
  const hasRating =
    average !== null && Number.isFinite(average) && average > 0 &&
    (count === undefined || (count !== null && count > 0));
  if (!hasRating) return <Text style={styles.empty}>No ratings yet</Text>;

  const normalized = Math.min(5, Math.max(1, average));
  const filled = Math.round(normalized);
  const stars = `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
  const numeric = normalized.toFixed(1);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${numeric} out of 5 stars${count ? ` from ${count} ${count === 1 ? 'rating' : 'ratings'}` : ''}`}
    >
      <Text style={styles.stars} accessibilityElementsHidden>{stars}</Text>
      {showNumeric ? <Text style={styles.numeric}>{numeric}</Text> : null}
      {count ? <Text style={styles.count}>({count})</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stars: { color: SkillMatchTheme.brand.primary, fontSize: 18, letterSpacing: 1 },
  numeric: { fontSize: 14, fontWeight: '600' },
  count: { color: SkillMatchTheme.text.secondary, fontSize: 13 },
  empty: { color: SkillMatchTheme.text.secondary, fontSize: 14 },
});
