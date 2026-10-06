import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
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
export function AppSheet({ visible, onClose, title, children, footer, dismissible = true }: AppSheetProps) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [rendered, setRendered] = useState(visible);

  // Mount before the enter animation; unmount only after the exit animation finishes.
  if (visible && !rendered) setRendered(true);

  useEffect(() => {
    let live = true;
    const toValue = visible ? 1 : 0;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!live) return;
        Animated.timing(progress, {
          toValue,
          duration: reduced ? 0 : visible ? ENTER_MS : EXIT_MS,
          easing: visible ? ENTER_EASING : EXIT_EASING,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && !visible) setRendered(false);
        });
      });
    return () => { live = false; };
  }, [visible, progress]);

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
      <View style={styles.root}>
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
          accessibilityViewIsModal
          style={[styles.sheet, { maxHeight: windowHeight * ui.size.sheetMaxHeightRatio, paddingBottom: insets.bottom + ui.spacing.lg, transform: [{ translateY }] }]}
        >
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <AppIconButton icon={{ android: 'close', ios: 'xmark' }} accessibilityLabel={`Close ${title}`} disabled={!dismissible} onPress={onClose} />
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" bounces={false}>
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
