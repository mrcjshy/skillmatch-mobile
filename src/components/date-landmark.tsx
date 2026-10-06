import { StyleSheet, Text, View } from 'react-native';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



/** Decorative landmark; the adjacent schedule retains the full localized value. */
export function DateLandmark({ value, compact = false }: { value: string | null; compact?: boolean }) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  const parsed = value === null ? null : new Date(value);
  if (parsed === null || Number.isNaN(parsed.getTime())) return null;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.tile, compact && styles.compact]}>
    <Text style={styles.month}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(parsed)}</Text>
    <Text style={styles.day}>{new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(parsed)}</Text>
  </View>;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
const styles = StyleSheet.create({
  tile: { minWidth: 56, minHeight: 64, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.control, backgroundColor: colors.accentSubtle },
  compact: { minWidth: 48, minHeight: 56 },
  month: { ...type.label, color: colors.accent },
  day: { ...type.screenTitle, fontVariant: ['tabular-nums'], color: colors.accent },
});

  return { styles };
}
