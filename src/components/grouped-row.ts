import { StyleSheet, type ViewStyle } from 'react-native';

import { type UiTheme } from '@/components/refinement-theme';

export type GroupPosition = 'only' | 'first' | 'middle' | 'last';

export function groupPosition(index: number, count: number): GroupPosition {
  if (count <= 1) return 'only';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

/**
 * Chrome for one row of a list that reads as a single grouped surface, without a wrapping view.
 * Every row draws its own hairline top edge (the divider between rows, the group's top edge for the
 * first), the last also closes the bottom, and the outer corners are rounded. This lets a
 * virtualised FlatList look like one surface while each row stays its own pressable.
 */
export function groupedRowStyle(ui: UiTheme, position: GroupPosition): ViewStyle {
  const { colors, radius } = ui;
  const first = position === 'first' || position === 'only';
  const last = position === 'last' || position === 'only';
  return {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: last ? StyleSheet.hairlineWidth : 0,
    borderTopLeftRadius: first ? radius.card : 0,
    borderTopRightRadius: first ? radius.card : 0,
    borderBottomLeftRadius: last ? radius.card : 0,
    borderBottomRightRadius: last ? radius.card : 0,
    overflow: 'hidden',
    borderCurve: 'continuous',
  };
}
