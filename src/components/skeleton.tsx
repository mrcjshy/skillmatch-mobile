import type { ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { MotionView, useKeyboardRoom, useLoadingDots, useLoadingPulse } from '@/components/motion';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

/** What is about to appear, so the placeholder holds the same place on screen as the content. */
export type SkeletonShape = 'lines' | 'line' | 'rows' | 'jobs' | 'bookings' | 'detail' | 'chat' | 'fill';

type SkeletonProps = {
  shape?: SkeletonShape;
  /** The loading message. Screen readers announce it; the placeholder itself is the visual cue. */
  label: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The app's one loading state. A placeholder of the content on its way replaces every spinner: the
 * screen keeps its shape, so the content settles in instead of jumping. It is a single busy region
 * for screen readers, and its bones are hidden from them.
 */
export function Skeleton({ shape = 'lines', label, style }: SkeletonProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const pulse = useLoadingPulse();
  return (
    <MotionView
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[shape === 'fill' ? styles.fill : styles.region, pulse, style]}
    >
      <View style={shape === 'fill' ? styles.fill : styles.region} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Bones shape={shape} ui={ui} />
      </View>
    </MotionView>
  );
}

function Bone({ ui, width = '100%', height = 14, radius }: { ui: UiTheme; width?: DimensionValue; height?: number; radius?: number }) {
  return <View style={{ width, height, borderRadius: radius ?? ui.radius.sm, backgroundColor: ui.colors.hairline }} />;
}

function Lines({ ui, widths }: { ui: UiTheme; widths: readonly DimensionValue[] }) {
  return <View style={createStyles(ui).lines}>{widths.map((width, index) => <Bone key={index} ui={ui} width={width} />)}</View>;
}

function Bones({ shape, ui }: { shape: SkeletonShape; ui: UiTheme }): ReactNode {
  const styles = createStyles(ui);
  if (shape === 'fill') return <View style={[styles.fill, styles.fillBone]} />;
  if (shape === 'line') return <Bone ui={ui} width="60%" />;
  if (shape === 'lines') return <Lines ui={ui} widths={['100%', '86%', '60%']} />;
  if (shape === 'rows') {
    return [0, 1, 2, 3].map(row => <View key={row} style={styles.row}>
      <Bone ui={ui} width={48} height={48} radius={ui.radius.control} />
      <View style={styles.rowCopy}><Lines ui={ui} widths={['70%', '45%']} /></View>
    </View>);
  }
  if (shape === 'jobs') {
    return <View style={styles.group}>{[0, 1, 2].map(row => <View key={row} style={[styles.row, styles.groupRow, row > 0 && styles.groupDivider]}>
      <Bone ui={ui} width={48} height={48} radius={ui.radius.control} />
      <View style={styles.rowCopy}>
        <Bone ui={ui} width="55%" height={16} />
        <Lines ui={ui} widths={['100%', '82%']} />
        <Bone ui={ui} width="40%" />
      </View>
    </View>)}</View>;
  }
  if (shape === 'bookings') {
    return [0, 1, 2].map(row => <View key={row} style={[styles.row, styles.card]}>
      <Bone ui={ui} width={56} height={64} radius={ui.radius.control} />
      <View style={styles.rowCopy}><Lines ui={ui} widths={['60%', '80%', '45%']} /></View>
    </View>);
  }
  if (shape === 'chat') {
    return ([['flex-start', '68%'], ['flex-end', '52%'], ['flex-start', '74%'], ['flex-end', '44%']] as const).map(([alignSelf, width], row) =>
      <View key={row} style={{ alignSelf, width }}><Bone ui={ui} height={64} radius={ui.radius.card} /></View>);
  }
  return <>
    <View style={styles.row}>
      <Bone ui={ui} width={88} height={32} radius={ui.radius.pill} />
      <View style={styles.rowCopy}><Bone ui={ui} width="60%" height={20} /></View>
    </View>
    <View style={styles.card}><Lines ui={ui} widths={['40%', '90%', '70%', '55%']} /></View>
    <Bone ui={ui} width="45%" height={20} />
    <View style={[styles.row, styles.card]}>
      <Bone ui={ui} width={48} height={48} radius={ui.radius.pill} />
      <View style={styles.rowCopy}><Lines ui={ui} widths={['65%', '40%']} /></View>
    </View>
  </>;
}

/** A button-sized wait: three dots, in the colour the button's label would have. */
export function PulseDots({ color }: { color: string }) {
  const dots = useLoadingDots();
  return (
    <View style={staticStyles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
      {dots.map((dot, index) => <MotionView key={index} style={[staticStyles.dot, { backgroundColor: color }, dot]} />)}
    </View>
  );
}

/**
 * The last child of a column whose bottom is the bottom of the screen: it takes the keyboard's
 * height frame by frame, so everything above rises with the keyboard instead of jumping after it.
 * `bottomOffset` is space below the column that the keyboard already covers.
 */
export function KeyboardSpacer({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const room = useKeyboardRoom(bottomOffset);
  return <MotionView pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={room} />;
}

const staticStyles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

function createStyles(ui: UiTheme) {
  const { colors, spacing, radius } = ui;
  return StyleSheet.create({
    region: { alignSelf: 'stretch', gap: spacing.md },
    fill: { flex: 1, alignSelf: 'stretch' },
    fillBone: { backgroundColor: colors.hairline },
    lines: { gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rowCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
    card: {
      padding: spacing.lg, gap: spacing.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline, backgroundColor: colors.surface,
    },
    group: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, backgroundColor: colors.surface },
    groupRow: { alignItems: 'flex-start', padding: spacing.md },
    groupDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  });
}
