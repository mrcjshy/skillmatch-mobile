import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { RowGlyph } from '@/components/row-glyph';

type AdminRowProps = {
  /** Small accent glyph for navigation rows. Decorative: the title carries the meaning. */
  icon?: SymbolViewProps['name'];
  /** An avatar or other leading element (directory and queue rows). */
  leading?: ReactNode;
  title: string;
  /** Supporting lines, quiet, each wrapping freely. Empty entries are skipped. */
  lines?: (string | null | undefined)[];
  /** One status chip or short value. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /**
   * The row's visible status (the trailing chip's words), read after the label as the row's value
   * so a screen reader hears identity, action and status together, e.g. "View worker details for
   * Ana, Verified". The label stays the row's name.
   */
  accessibilityValue?: string;
  /** Grouped-list chrome (see grouped-row.ts) when the row is not inside a SurfaceGroup. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The Admin list row: the same grammar as the Worker and Client rows (title, quiet lines, one
 * status, chevron), with a denser vertical rhythm. A row with `onPress` is one 48dp+ button.
 */
export function AdminRow({ icon, leading, title, lines = [], trailing, onPress, accessibilityLabel, accessibilityValue, style }: AdminRowProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const visible = lines.filter((line): line is string => typeof line === 'string' && line.length > 0);
  const value = accessibilityValue ? { text: accessibilityValue } : undefined;
  const body = (
    <>
      {leading ? <View accessible={false} importantForAccessibility="no-hide-descendants">{leading}</View> : null}
      {/* The glyph labels the title, so it sits on the title's first line however tall the row grows. */}
      <View style={styles.main}>
        {icon ? <RowGlyph name={icon} titleLineHeight={ui.type.bodyEmphasis.lineHeight} /> : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {visible.map((line, index) => <Text key={index} style={styles.line}>{line}</Text>)}
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
      </View>
      {onPress ? (
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={ui.size.icon} tintColor={ui.colors.textSecondary} />
        </View>
      ) : null}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, style]} accessible accessibilityLabel={accessibilityLabel} accessibilityValue={value}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityValue={value}
      onPress={onPress}
      style={({ pressed }) => [styles.row, style, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

/** One counted fact: label (and an optional quiet detail) left, the count right in tabular figures. */
export function AdminCountRow({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const formatted = value.toLocaleString();
  return (
    <View style={styles.count} accessible accessibilityLabel={`${label}: ${formatted}${detail ? `, ${detail}` : ''}`}>
      <View style={styles.countCopy}>
        <Text style={styles.countLabel}>{label}</Text>
        {detail ? <Text style={styles.line}>{detail}</Text> : null}
      </View>
      <Text style={styles.countValue}>{formatted}</Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, maxWidth: '100%',
      minHeight: size.listRowMinHeight, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
    title: { ...type.bodyEmphasis, color: colors.textPrimary, flexShrink: 1 },
    line: { ...type.helper, color: colors.textSecondary, flexShrink: 1 },
    trailing: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
    count: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      columnGap: spacing.md, rowGap: spacing.xxs, minHeight: size.minTarget,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    },
    countCopy: { flexShrink: 1, minWidth: 0, gap: spacing.xxs },
    countLabel: { ...type.body, color: colors.textPrimary },
    countValue: { ...type.numeric, color: colors.textPrimary },
  });
}
