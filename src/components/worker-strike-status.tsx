import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { StrikePips } from '@/components/strike-pips';
import { SurfaceGroup } from '@/components/surface-group';
import { MAX_STRIKES } from '@/lib/admin-account-moderation';
import { loadMyStrikeCount, workerStrikeMessage } from '@/lib/worker-strikes';

/**
 * "No-show strikes N of 3" on the Worker's own profile, refreshed on focus. Hidden while loading,
 * on error and without a profile, so it never blocks or clutters the profile.
 */
export function WorkerStrikeStatus({ userId }: { userId: string }) {
  const styles = createStyles(useUiTheme());
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadMyStrikeCount(userId)
      .then((value) => { if (!cancelled) setCount(value); })
      .catch(() => { if (!cancelled) setCount(null); });
    return () => { cancelled = true; };
  }, [userId]));

  if (count === null) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Account standing" />
      <SurfaceGroup>
        <View style={styles.row} accessible accessibilityLabel={`No-show strikes, ${count} of ${MAX_STRIKES}. ${workerStrikeMessage(count)}`}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.label}>No-show strikes</Text>
              <Text style={styles.value}>{count} of {MAX_STRIKES}</Text>
            </View>
            <StrikePips count={count} />
          </View>
          <Text style={styles.note}>{workerStrikeMessage(count)}</Text>
        </View>
      </SurfaceGroup>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    section: { gap: spacing.sm },
    row: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    label: { ...type.helper, color: colors.textSecondary },
    value: { ...type.body, color: colors.textPrimary, fontWeight: '700' },
    note: { ...type.helper, color: colors.textSecondary },
  });
}
