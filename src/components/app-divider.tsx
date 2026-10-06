import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useUiTheme } from '@/components/refinement-theme';

type AppDividerProps = {
  /** Left inset, e.g. to align with row text after a leading avatar. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Hairline separator between rows inside one surface. Decorative: hidden from accessibility. */
export function AppDivider({ inset = 0, style }: AppDividerProps) {
  const { colors } = useUiTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.line, { backgroundColor: colors.hairline, marginLeft: inset }, style]}
    />
  );
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
