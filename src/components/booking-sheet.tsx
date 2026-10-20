import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIconButton } from '@/components/app-icon-button';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { MotionTokens } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { clampOffset, isPanelDrag, sheetGeometry, snapPanel, type SheetPosition } from '@/lib/booking-sheet';

type BookingSheetProps = {
  /** Always visible: concise summary and the location status/controls. */
  header: ReactNode;
  /** The full booking, shown when expanded. */
  children: ReactNode;
  /** Space kept clear above the expanded sheet (the floating header). */
  topReserve: number;
  /** Reports the visible collapsed height so the map can frame markers above it. */
  onCollapsedHeight?: (height: number) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
};

const { duration, easing } = MotionTokens;

/**
 * Draggable booking panel over the full-screen map (React Native PanResponder +
 * Animated: no gesture-handler or new native code). Only the handle/header area
 * starts a drag, so panning the map never moves the panel and a tap on a header
 * button stays a tap. When expanded, pulling down from the top of the content
 * returns to the map. The expand/collapse button is the accessible equivalent.
 */
export function BookingSheet({ header, children, topReserve, onCollapsedHeight, refreshControl }: BookingSheetProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [containerHeight, setContainerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [position, setPosition] = useState<SheetPosition>('collapsed');
  const collapsedHeight = headerHeight + insets.bottom;
  const { sheetHeight, collapsedOffset } = sheetGeometry({ containerHeight, topReserve, collapsedHeight });
  const [offset] = useState(() => new Animated.Value(0));
  const current = useRef({ position, collapsedOffset, dragStart: 0 });
  const scrollTop = useRef(0);
  // eslint-disable-next-line react-hooks/refs -- the gesture reads the latest geometry only while it runs.
  current.current = { ...current.current, position, collapsedOffset };

  useEffect(() => { if (headerHeight > 0) onCollapsedHeight?.(collapsedHeight); }, [collapsedHeight, headerHeight, onCollapsedHeight]);
  const placed = useRef(false);
  useEffect(() => {
    const toValue = position === 'expanded' ? 0 : collapsedOffset;
    // The first measured position is applied directly: the panel appears collapsed instead of sliding down.
    if (!placed.current) {
      if (containerHeight > 0 && headerHeight > 0) { placed.current = true; offset.setValue(toValue); }
      return;
    }
    const animation = Animated.timing(offset, {
      toValue, duration: reduced ? 0 : duration.large, easing: Easing.bezier(...easing.standard), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [position, collapsedOffset, offset, reduced, containerHeight, headerHeight]);

  const release = (dy: number, vy: number) => {
    const next = snapPanel({ from: current.current.position, dy, vy, collapsedOffset: current.current.collapsedOffset });
    // Same position: the effect will not re-run, so settle back explicitly.
    if (next === current.current.position) {
      Animated.timing(offset, { toValue: next === 'expanded' ? 0 : current.current.collapsedOffset, duration: reduced ? 0 : duration.standard,
        useNativeDriver: true }).start();
    }
    setPosition(next);
  };
  const drag = (dy: number) => offset.setValue(clampOffset(current.current.dragStart + dy, current.current.collapsedOffset));
  const begin = () => {
    current.current.dragStart = current.current.position === 'expanded' ? 0 : current.current.collapsedOffset;
  };
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores handlers; refs are read only during a gesture.
  const headerGesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, { dx, dy }) => isPanelDrag(dx, dy),
    onPanResponderGrant: begin,
    onPanResponderMove: (_event, { dy }) => drag(dy),
    onPanResponderRelease: (_event, { dy, vy }) => release(dy, vy),
    onPanResponderTerminate: (_event, { dy, vy }) => release(dy, vy),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/refs -- as above.
  const bodyGesture = useMemo(() => PanResponder.create({
    // Pull down from the top of the expanded content to return to the map.
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) =>
      current.current.position === 'expanded' && scrollTop.current <= 0 && dy > 0 && isPanelDrag(dx, dy),
    onPanResponderGrant: begin,
    onPanResponderMove: (_event, { dy }) => drag(Math.max(0, dy)),
    onPanResponderRelease: (_event, { dy, vy }) => release(Math.max(0, dy), vy),
    onPanResponderTerminate: (_event, { dy, vy }) => release(Math.max(0, dy), vy),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const expanded = position === 'expanded';
  const scrim = containerHeight > 0 && collapsedOffset > 0
    ? offset.interpolate({ inputRange: [0, collapsedOffset], outputRange: [0.32, 0], extrapolate: 'clamp' }) : 0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]} />
      {/* Hidden until measured, so it never flashes open before the collapsed position is known. */}
      <Animated.View style={[styles.sheet, { height: sheetHeight, opacity: containerHeight > 0 && headerHeight > 0 ? 1 : 0, transform: [{ translateY: offset }] }]}
        accessibilityLabel={expanded ? 'Booking details panel, expanded' : 'Booking details panel, collapsed'}>
        <View {...headerGesture.panHandlers} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)} style={styles.headerArea}>
          <View style={styles.handleRow}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <View style={styles.headerContent}>{header}</View>
            <AppIconButton variant="tonal" icon={{ android: expanded ? 'expand_more' : 'expand_less', ios: expanded ? 'chevron.down' : 'chevron.up' }}
              accessibilityLabel={expanded ? 'Show map' : 'Show booking details'} onPress={() => setPosition(expanded ? 'collapsed' : 'expanded')} />
          </View>
        </View>
        {/* Keep booking state mounted; the bottom inset shows only the sheet background when collapsed. */}
        <View {...bodyGesture.panHandlers} style={[styles.body, { opacity: expanded ? 1 : 0 }]}
          pointerEvents={expanded ? 'auto' : 'none'}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!expanded}>
          <ScrollView contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + ui.spacing.xxxxl }]}
            keyboardShouldPersistTaps="handled" refreshControl={refreshControl} scrollEnabled={expanded}
            onScroll={event => { scrollTop.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, spacing, radius, elevation } = ui;
  return StyleSheet.create({
    scrim: { backgroundColor: '#000000' },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
      ...elevation.sheet,
    },
    headerArea: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md },
    handleRow: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    headerContent: { flex: 1, minWidth: 0, gap: spacing.sm },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: spacing.gutter, gap: spacing.xl, paddingTop: spacing.sm },
  });
}
