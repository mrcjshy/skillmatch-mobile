import { StyleSheet, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { MAX_STRIKES } from '@/lib/admin-account-moderation';

/** Three outlined dots, filled in the error colour per no-show strike. Decorative: callers label it. */
export function StrikePips({ count }: { count: number }) {
  const styles = createStyles(useUiTheme());
  return (
    <View style={styles.pips} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: MAX_STRIKES }, (_, index) => (
        <View key={index} style={[styles.pip, index < count && styles.pipOn]} />
      ))}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, spacing } = ui;
  return StyleSheet.create({
    pips: { flexDirection: 'row', gap: spacing.xs },
    pip: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.controlBorder, backgroundColor: 'transparent' },
    pipOn: { backgroundColor: colors.error, borderColor: colors.error },
  });
}
