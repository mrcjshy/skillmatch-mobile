import { View, useWindowDimensions } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme } from '@/components/refinement-theme';

/**
 * A list row's leading glyph, centred on the first line of the row's title instead of on the whole
 * row, so it stays beside the title when supporting lines, a status chip or 130% text make the row
 * taller. Avatars and chevrons are not glyphs: they stay centred on the row. Decorative; the title
 * carries the meaning.
 *
 * `titleLineHeight` is the title style's line height at 100% text. Android scales a text line with
 * the system font scale, so the box scales by the same factor and keeps matching the title's line.
 */
export function RowGlyph({ name, titleLineHeight }: { name: SymbolViewProps['name']; titleLineHeight: number }) {
  const ui = useUiTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ minWidth: ui.size.icon, minHeight: titleLineHeight * fontScale, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppSymbol name={name} size={ui.size.icon} tintColor={ui.colors.accent} />
    </View>
  );
}
