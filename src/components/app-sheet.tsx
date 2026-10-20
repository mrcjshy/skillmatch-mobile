import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIconButton } from '@/components/app-icon-button';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { MotionTokens } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

type AppSheetProps = {
  visible: boolean;
  /** Android Back and scrim tap (when `dismissible`) call this; the owner sets `visible` false. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Pinned below the scrolling content (e.g. one primary action). */
  footer?: ReactNode;
  /** Set false while a request is in flight. Back and scrim then do nothing. */
  dismissible?: boolean;
  /** Opt-in downward gesture; the close button and Android Back remain available. */
  swipeToClose?: boolean;
};

// Shared motion tokens: a whole surface travels in `large`, leaves in `exit`.
const { duration, easing } = MotionTokens;
const ENTER_MS = duration.large;
const EXIT_MS = duration.exit;
const ENTER_EASING = Easing.bezier(...easing.decelerate);
const EXIT_EASING = Easing.bezier(...easing.accelerate);

/**
 * Bottom sheet for multi-option choices (Work Status, filters). Sheets SLIDE; the scrim FADES.
 * Built on the existing platform Modal (no new dependency). The sheet is capped at 90% of the
 * window, scrolls when content or text size demands it, and pads for the system navigation bar.
 * Animation is skipped when the system asks for reduced motion.
 */
export function AppSheet({ visible, onClose, title, children, footer, dismissible = true, swipeToClose = false }: AppSheetProps) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [rendered, setRendered] = useState(visible);
  const reduced = useReducedMotion();
  const [keyboardTop, setKeyboardTop] = useState<number | null>(() => Keyboard.metrics()?.screenY ?? null);
  const scrollOffset = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const availableHeight = Math.min(windowHeight, keyboardTop ?? windowHeight);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores handlers; the scroll ref is read only during a gesture.
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) =>
      visible && dismissible && swipeToClose && scrollOffset.current <= 0 && dy > 12 && dy > Math.abs(dx) * 1.5,
    onPanResponderRelease: (_event, { dx, dy }) => {
      if (visible && dismissible && swipeToClose && dy > 48 && dy > Math.abs(dx) * 1.5) onClose();
    },
  }), [visible, dismissible, swipeToClose, onClose]);
  const handleGesture = useMemo(() => PanResponder.create({
    // The header owns its drag even when the body is scrolled. A child close button still owns its tap.
    onStartShouldSetPanResponder: () => visible && dismissible && swipeToClose,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, { dx, dy }) => {
      if (visible && dismissible && swipeToClose && dy > 48 && dy > Math.abs(dx) * 1.5) onClose();
    },
  }), [visible, dismissible, swipeToClose, onClose]);

  useEffect(() => {
    if (!visible) return;
    scrollOffset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [visible]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardTop(event.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Mount before the enter animation; unmount only after the exit animation finishes.
  if (visible && !rendered) setRendered(true);

  useEffect(() => {
    const toValue = visible ? 1 : 0;
    const animation = Animated.timing(progress, {
      toValue,
      duration: reduced ? 0 : visible ? ENTER_MS : EXIT_MS,
      easing: visible ? ENTER_EASING : EXIT_EASING,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !visible) setRendered(false); });
    return () => animation.stop();
  }, [visible, progress, reduced]);

  if (!rendered) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => { if (dismissible) onClose(); }}
    >
      <View style={[styles.root, { paddingBottom: Math.max(0, windowHeight - availableHeight) }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityState={{ disabled: !dismissible }}
            disabled={!dismissible}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          {...gesture.panHandlers}
          accessibilityViewIsModal
          style={[styles.sheet, { maxHeight: Math.max(0, Math.min(windowHeight * ui.size.sheetMaxHeightRatio, availableHeight - insets.top - ui.spacing.sm)), paddingBottom: (keyboardTop === null ? insets.bottom : 0) + ui.spacing.lg, transform: [{ translateY }] }]}
        >
          <View {...handleGesture.panHandlers}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.handle} />
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <AppIconButton icon={{ android: 'close', ios: 'xmark' }} accessibilityLabel={`Close ${title}`} disabled={!dismissible} onPress={onClose} />
            </View>
          </View>
          <ScrollView ref={scroll} style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}
            onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size, elevation } = ui;
  const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: colors.scrim },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      borderCurve: 'continuous',
      paddingTop: spacing.sm,
      ...elevation.sheet,
    },
    handle: {
      alignSelf: 'center',
      width: size.sheetHandleWidth,
      height: size.sheetHandleHeight,
      borderRadius: radius.pill,
      backgroundColor: colors.hairline,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingLeft: spacing.gutter,
      paddingRight: spacing.sm,
    },
    title: { ...type.sectionTitle, flex: 1, color: colors.textPrimary },
    body: { flexGrow: 0 },
    bodyContent: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, gap: spacing.sm },
    footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  });
  return { styles };
}
