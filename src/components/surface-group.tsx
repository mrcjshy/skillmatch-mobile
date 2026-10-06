import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppDivider } from '@/components/app-divider';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

/** Nested arrays flatten and empty slots (null, undefined, booleans) are dropped, like React's own children list. */
function items(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node.flatMap(items);
  return node === null || node === undefined || typeof node === 'boolean' ? [] : [node];
}

/**
 * One white surface with a hairline edge whose children are separated by dividers. The structure of
 * choice for related rows (details, settings-like lists, summary facts): one container, never a card
 * per row and never a card inside a card.
 */
export function SurfaceGroup({ children, style, inset = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const styles = createStyles(useUiTheme());
  const rows = items(children);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.group, style]}>
      {rows.map((child, index) => (
        <View key={index}>
          {index > 0 ? <AppDivider inset={inset} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, radius } = ui;
  return StyleSheet.create({
    group: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      overflow: 'hidden',
      borderCurve: 'continuous',
    },
  });
}
