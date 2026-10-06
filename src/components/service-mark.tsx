import { type SymbolViewProps } from 'expo-symbols';
import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { StyleSheet, View } from 'react-native';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



export function serviceSymbol(subject: string): SymbolViewProps['name'] {
  if (/carpent|wood/i.test(subject)) return { android: 'carpenter', ios: 'hammer' };
  if (/plumb|pipe/i.test(subject)) return { android: 'plumbing', ios: 'wrench' };
  if (/electric|wir/i.test(subject)) return { android: 'electrical_services', ios: 'bolt' };
  if (/clean|laundry/i.test(subject)) return { android: 'cleaning_services', ios: 'sparkles' };
  if (/paint/i.test(subject)) return { android: 'format_paint', ios: 'paintbrush' };
  if (/garden|plant/i.test(subject)) return { android: 'yard', ios: 'leaf' };
  return { android: 'handyman', ios: 'wrench.and.screwdriver' };
}

export function ServiceMark({ subject, inverse = false, synchronousGlyph = false }: { subject: string; inverse?: boolean; synchronousGlyph?: boolean }) {
  const ui = useUiTheme();
  const { colors } = ui;
  const { styles } = createStyles(ui);

  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.tile, inverse && styles.inverse]}>
    <SymbolView name={serviceSymbol(subject)} size={24} tintColor={inverse ? colors.onAccent : colors.accent} synchronousGlyph={synchronousGlyph} />
  </View>;
}

function createStyles(ui: UiTheme) {
  const { colors, spacing, radius } = ui;
const styles = StyleSheet.create({
  tile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderRadius: radius.control, backgroundColor: colors.accentSubtle },
  inverse: { backgroundColor: colors.accentPressed },
});

  return { styles };
}
