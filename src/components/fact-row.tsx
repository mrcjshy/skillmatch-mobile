import { StyleSheet, Text, View } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

type FactRowProps = {
  /** Small, decorative leading glyph; the label and value carry the meaning. */
  icon?: SymbolViewProps['name'];
  label: string;
  value: string | null;
  /** Selectable for values people copy (phone, reference). */
  selectable?: boolean;
  /** Emphasise the value (money, schedule). */
  strong?: boolean;
  /** Short values (amounts, methods): label left, value right. Long text drops below the label. */
  inline?: boolean;
};

/**
 * One labelled fact: quiet label above a full-weight value, wrapping freely (nothing truncates).
 * Returns null when there is no value so callers never render an empty row.
 */
export function FactRow({ icon, label, value, selectable = false, strong = false, inline = false }: FactRowProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const styles = createStyles(ui);
  if (value === null || value === '') return null;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      {icon ? (
        <View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants">
          <AppSymbol name={icon} size={size.icon} tintColor={colors.accent} />
        </View>
      ) : null}
      <View style={[styles.copy, inline ? styles.copyInline : null]}>
        <Text style={[styles.label, inline ? styles.labelInline : null]}>{label}</Text>
        <Text selectable={selectable} style={[styles.value, strong ? styles.strong : null, inline ? styles.valueInline : null, inline && strong ? styles.amount : null]}>{value}</Text>
      </View>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: size.listRowMinHeight - spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    icon: { width: size.icon, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xxs },
    copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
    label: { ...type.helper, color: colors.textSecondary },
    value: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
    strong: { ...type.bodyEmphasis },
    copyInline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.md },
    labelInline: { flexShrink: 1 },
    amount: { ...type.money },
    valueInline: { textAlign: 'right', flexShrink: 1 },
  });
}
