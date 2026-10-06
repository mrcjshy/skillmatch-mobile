import type { ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



type AppCardProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A self-contained object the user opens or manages (a portfolio item): one white surface with a
 * hairline edge. Related rows use SurfaceGroup instead, and notices use AppNotice; a card never
 * holds another card.
 */
export function AppCard({ children, style }: AppCardProps) {
  const { styles } = createStyles(useUiTheme());
  return <View style={[styles.base, styles.default, style]}>{children}</View>;
}

function createStyles(ui: UiTheme) {
  const { colors, spacing, radius } = ui;
const styles = StyleSheet.create({
  base: {
    gap: spacing.md,
  },
  default: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderCurve: 'continuous',
  },
});

  return { styles };
}
