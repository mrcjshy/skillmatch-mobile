import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppSymbol } from '@/components/app-symbol';
import { MotionTokens } from '@/constants/motion';
import { SkillMatchTheme } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  clampTranslation,
  dismissProgress,
  doubleTapZoom,
  fitContain,
  isZoomed,
  pagerOffset,
  panBounds,
  pinchZoom,
  restingZoom,
  settlePage,
  shouldDismiss,
  stepZoom,
  zoomStage,
  type Size,
  type ZoomState,
} from '@/lib/photo-zoom';

const { colors, type, spacing, size, radius } = SkillMatchTheme.ui;
const { duration } = MotionTokens;

/** The viewer is a dark room for the photo, whatever the screen behind it. */
const BACKDROP = '#000000';
/** Travel (dp) before a one-finger drag starts panning, paging or dismissing. */
const DRAG_SLOP = 8;
/** What the one-finger drag in progress is doing. */
const IDLE = 0;
const PAN = 1;
const PAGE = 2;
const DISMISS = 3;
const FAILED_COPY = 'This photo could not be shown.';

export type JobPhotoViewerItem = { slot: number; signedUrl: string };

type JobPhotoViewerProps = {
  /** The gallery's visible photos in display order, with the same signed sources (no refetch). */
  photos: readonly JobPhotoViewerItem[];
  /** The tapped photo. */
  initialIndex: number;
  onClose: () => void;
};

function photoLabel(position: number, count: number): string {
  return `Job photo ${position + 1} of ${count}`;
}

function zoomAnnouncement(scale: number): string {
  return isZoomed(scale) ? `Zoomed in, ${Math.round(scale * 10) / 10}x` : 'Zoomed out';
}

/**
 * Call before mounting the viewer. Android gives a Modal its own window and copies the activity's
 * status-bar appearance into it once, as it opens, so white status-bar icons must be set first.
 * The viewer sets them again on mount and returns the app's dark icons when it closes.
 */
export function lightenStatusBarForPhotoViewer(): void {
  StatusBar.setStyle('light', true);
}

/** A critically damped spring to `to`, or a snap under reduced motion. */
function settle(value: SharedValue<number>, to: number, velocity: number, reduced: boolean) {
  'worklet';
  value.set(reduced ? to : withSpring(to, { duration: duration.large, dampingRatio: 1, velocity, reduceMotion: ReduceMotion.Never }));
}

function settleZoom(scale: SharedValue<number>, x: SharedValue<number>, y: SharedValue<number>, target: ZoomState, reduced: boolean) {
  'worklet';
  cancelAnimation(x);
  cancelAnimation(y);
  settle(scale, target.scale, 0, reduced);
  settle(x, target.x, 0, reduced);
  settle(y, target.y, 0, reduced);
}

/**
 * Full-screen job photo viewer: swipe between photos, pinch (1x to 4x) or double-tap (2x around
 * the tap) to zoom, drag a zoomed photo (kept on screen; paging waits until it is back at 1x), and
 * swipe down, tap Close or press Back to leave. Screen-reader users zoom and page through the
 * photo's actions instead of gestures. Every settle is a spring that snaps under reduced motion.
 */
export function JobPhotoViewer({ photos, initialIndex, onClose }: JobPhotoViewerProps) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const count = photos.length;
  const last = Math.max(0, count - 1);
  const first = Math.min(last, Math.max(0, Math.trunc(initialIndex) || 0));
  const [index, setIndex] = useState(first);
  // 0 at rest, 1 zoomed, 2 at 4x: labels the screen-reader zoom actions.
  const [stage, setStage] = useState(0);
  const [viewport, setViewport] = useState<Size>({ width: screen.width, height: screen.height });
  const [natural, setNatural] = useState<Readonly<Record<number, Size>>>({});
  const [failed, setFailed] = useState<Readonly<Record<number, boolean>>>({});
  // The gallery's photos can change while open; never point past the last one.
  const current = Math.min(index, last);

  const page = useSharedValue(first);
  const pagerX = useSharedValue(-first * screen.width);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const area = useSharedValue<Size>(viewport);
  const content = useSharedValue<Size>(viewport);
  const mode = useSharedValue(IDLE);
  const pinching = useSharedValue(false);
  const pinchStart = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  const dragStart = useSharedValue({ x: 0, y: 0, offsetX: 0, offsetY: 0, pointers: 1 });

  useEffect(() => {
    StatusBar.setStyle('light', true);
    return () => { StatusBar.setStyle('dark', true); };
  }, []);

  useEffect(() => {
    if (count > 0) AccessibilityInfo.announceForAccessibility(photoLabel(current, count));
  }, [current, count]);

  // A new viewport (first layout, rotation) or fewer photos re-place the strip on the current photo.
  useLayoutEffect(() => {
    area.set(viewport);
    const target = Math.min(page.get(), last);
    page.set(target);
    cancelAnimation(pagerX);
    pagerX.set(-target * viewport.width);
  }, [viewport, last, area, page, pagerX]);

  // Zoom limits follow the photo's fitted size once its pixels are known.
  const activeSlot = photos[current]?.slot;
  const activeNatural = activeSlot === undefined ? undefined : natural[activeSlot];
  useLayoutEffect(() => {
    content.set(fitContain(activeNatural ?? viewport, viewport));
  }, [activeNatural, viewport, content]);

  useAnimatedReaction(() => zoomStage(scale.get()), (now, previous) => {
    if (now !== previous) scheduleOnRN(setStage, now);
  });

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        pinching.set(true);
        // Two fingers take over from a one-finger page or dismiss drag.
        if (mode.get() === PAGE) settle(pagerX, -page.get() * area.get().width, 0, reduced);
        if (mode.get() === DISMISS) settle(dismissY, 0, 0, reduced);
        if (mode.get() !== IDLE) mode.set(PAN);
        cancelAnimation(scale);
        cancelAnimation(x);
        cancelAnimation(y);
        const box = area.get();
        pinchStart.set({ scale: scale.get(), x: x.get(), y: y.get(), focalX: event.focalX - box.width / 2, focalY: event.focalY - box.height / 2 });
      })
      .onUpdate((event) => {
        const box = area.get();
        const from = pinchStart.get();
        const next = pinchZoom({ scale: from.scale, x: from.x, y: from.y }, { x: from.focalX, y: from.focalY },
          { x: event.focalX - box.width / 2, y: event.focalY - box.height / 2 }, event.scale, content.get(), box);
        scale.set(next.scale);
        x.set(next.x);
        y.set(next.y);
      })
      .onEnd(() => {
        if (!isZoomed(scale.get())) settleZoom(scale, x, y, restingZoom(), reduced);
      })
      .onFinalize(() => {
        pinching.set(false);
      });

    const pan = Gesture.Pan()
      .minDistance(DRAG_SLOP)
      .onStart((event) => {
        dragStart.set({ x: event.translationX, y: event.translationY, offsetX: x.get(), offsetY: y.get(), pointers: event.numberOfPointers });
        if (pinching.get() || isZoomed(scale.get())) {
          // Zoomed: the drag moves the photo, never to another photo.
          mode.set(PAN);
          cancelAnimation(x);
          cancelAnimation(y);
        } else if (Math.abs(event.translationX) > Math.abs(event.translationY)) {
          mode.set(PAGE);
          cancelAnimation(pagerX);
        } else {
          mode.set(DISMISS);
          cancelAnimation(dismissY);
        }
      })
      .onUpdate((event) => {
        const from = dragStart.get();
        if (pinching.get() || event.numberOfPointers !== from.pointers) {
          // Two fingers belong to the pinch; re-anchor so lifting one does not make the photo jump.
          dragStart.set({ x: event.translationX, y: event.translationY, offsetX: x.get(), offsetY: y.get(), pointers: event.numberOfPointers });
          return;
        }
        const dx = event.translationX - from.x;
        const dy = event.translationY - from.y;
        const box = area.get();
        const drag = mode.get();
        if (drag === PAN) {
          const kept = clampTranslation(from.offsetX + dx, from.offsetY + dy, scale.get(), content.get(), box);
          x.set(kept.x);
          y.set(kept.y);
        } else if (drag === PAGE) {
          pagerX.set(pagerOffset(page.get(), count, dx, box.width));
        } else if (drag === DISMISS) {
          dismissY.set(dy);
        }
      })
      .onEnd((event, success) => {
        const from = dragStart.get();
        const box = area.get();
        const drag = mode.get();
        mode.set(IDLE);
        if (drag === PAN) {
          if (!success || reduced || pinching.get()) return;
          // A zoomed photo glides to a stop, still inside the screen.
          const bounds = panBounds(scale.get(), content.get(), box);
          if (bounds.x > 0) x.set(withDecay({ velocity: event.velocityX, clamp: [-bounds.x, bounds.x], reduceMotion: ReduceMotion.Never }));
          if (bounds.y > 0) y.set(withDecay({ velocity: event.velocityY, clamp: [-bounds.y, bounds.y], reduceMotion: ReduceMotion.Never }));
        } else if (drag === PAGE) {
          const startPage = page.get();
          const target = success ? settlePage(startPage, count, event.translationX - from.x, event.velocityX, box.width) : startPage;
          settle(pagerX, -target * box.width, success ? event.velocityX : 0, reduced);
          if (target !== startPage) {
            page.set(target);
            scheduleOnRN(setIndex, target);
          }
        } else if (drag === DISMISS) {
          if (success && shouldDismiss(event.translationY - from.y, event.velocityY, box.height)) {
            if (reduced) scheduleOnRN(onClose);
            else {
              dismissY.set(withTiming(box.height, { duration: duration.exit, reduceMotion: ReduceMotion.Never }, (finished) => {
                'worklet';
                if (finished) scheduleOnRN(onClose);
              }));
            }
          } else {
            settle(dismissY, 0, success ? event.velocityY : 0, reduced);
          }
        }
      })
      .onFinalize(() => {
        // A drag cancelled before it ended settles back where it started.
        if (mode.get() === PAGE) settle(pagerX, -page.get() * area.get().width, 0, reduced);
        if (mode.get() === DISMISS) settle(dismissY, 0, 0, reduced);
        mode.set(IDLE);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((event, success) => {
        if (!success) return;
        const box = area.get();
        const target = doubleTapZoom({ x: event.x - box.width / 2, y: event.y - box.height / 2 },
          { scale: scale.get(), x: x.get(), y: y.get() }, content.get(), box);
        settleZoom(scale, x, y, target, reduced);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [count, reduced, onClose, area, content, dismissY, dragStart, mode, page, pagerX, pinchStart, pinching, scale, x, y]);

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pagerX.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.8 * dismissProgress(dismissY.get(), area.get().height) }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - dismissProgress(dismissY.get(), area.get().height) }));

  const applyZoom = (target: ZoomState) => {
    settleZoom(scale, x, y, target, reduced);
    setStage(zoomStage(target.scale));
    AccessibilityInfo.announceForAccessibility(zoomAnnouncement(target.scale));
  };
  const goTo = (target: number) => {
    if (target < 0 || target > last || target === current) return;
    settleZoom(scale, x, y, restingZoom(), reduced);
    setStage(0);
    page.set(target);
    settle(pagerX, -target * viewport.width, 0, reduced);
    setIndex(target);
  };
  // Screen readers: activate toggles zoom like a double tap; the other actions step zoom or page.
  const onImageAction = (event: AccessibilityActionEvent) => {
    const now = { scale: scale.get(), x: x.get(), y: y.get() };
    const name = event.nativeEvent.actionName;
    if (name === 'activate') applyZoom(doubleTapZoom({ x: 0, y: 0 }, now, content.get(), area.get()));
    else if (name === 'zoomIn') applyZoom(stepZoom(now, 1, content.get(), area.get()));
    else if (name === 'zoomOut') applyZoom(stepZoom(now, -1, content.get(), area.get()));
    else if (name === 'nextPhoto') goTo(current + 1);
    else if (name === 'previousPhoto') goTo(current - 1);
  };
  const imageActions: AccessibilityActionInfo[] = [
    { name: 'activate', label: stage > 0 ? 'Zoom out' : 'Zoom in' },
    ...(stage < 2 ? [{ name: 'zoomIn', label: 'Zoom in' }] : []),
    ...(stage > 0 ? [{ name: 'zoomOut', label: 'Zoom out' }] : []),
    ...(current < last ? [{ name: 'nextPhoto', label: 'Next photo' }] : []),
    ...(current > 0 ? [{ name: 'previousPhoto', label: 'Previous photo' }] : []),
  ];

  const onStageLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== viewport.width || height !== viewport.height)) setViewport({ width, height });
  };
  const onSize = (slot: number, next: Size) => {
    if (!(next.width > 0) || !(next.height > 0)) return;
    setNatural((known) => (known[slot]?.width === next.width && known[slot]?.height === next.height ? known : { ...known, [slot]: next }));
    setFailed((known) => (known[slot] ? { ...known, [slot]: false } : known));
  };
  const onFail = (slot: number) => {
    setFailed((known) => (known[slot] ? known : { ...known, [slot]: true }));
  };

  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Android: gestures inside a Modal need their own root, the Modal being a separate window. */}
      <GestureHandlerRootView style={styles.root} onAccessibilityEscape={onClose}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.stage} onLayout={onStageLayout} collapsable={false}>
            <Animated.View style={[styles.strip, { width: viewport.width * Math.max(1, count) }, stripStyle]}>
              {photos.map((photo, position) => (
                <ViewerPage
                  key={photo.slot}
                  photo={photo}
                  position={position}
                  count={count}
                  active={position === current}
                  viewport={viewport}
                  failed={failed[photo.slot] === true}
                  page={page}
                  scale={scale}
                  x={x}
                  y={y}
                  dismissY={dismissY}
                  actions={imageActions}
                  onAction={onImageAction}
                  onSize={onSize}
                  onFail={onFail}
                />
              ))}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        <Animated.View
          pointerEvents="box-none"
          style={[styles.chrome, { paddingTop: insets.top + spacing.sm, paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.sm }, chromeStyle]}
        >
          {count > 1 ? (
            // The photo's own label carries the position for screen readers.
            <View pointerEvents="none" style={styles.counterPill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Text style={styles.counter}>{`${current + 1} / ${count}`}</Text>
            </View>
          ) : <View />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed ? styles.closePressed : null]}
          >
            <AppSymbol name={{ android: 'close', ios: 'xmark' }} size={size.tabIcon} tintColor={colors.inverseOnSurface} accessible={false} />
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

type ViewerPageProps = {
  photo: JobPhotoViewerItem;
  position: number;
  count: number;
  active: boolean;
  viewport: Size;
  failed: boolean;
  page: SharedValue<number>;
  scale: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  dismissY: SharedValue<number>;
  actions: readonly AccessibilityActionInfo[];
  onAction: (event: AccessibilityActionEvent) => void;
  onSize: (slot: number, size: Size) => void;
  onFail: (slot: number) => void;
};

/** One photo, fitted (contain) at 1x. Only the current photo carries the zoom and dismiss transform. */
function ViewerPage({ photo, position, count, active, viewport, failed, page, scale, x, y, dismissY, actions, onAction, onSize, onFail }: ViewerPageProps) {
  const zoomStyle = useAnimatedStyle(() => (page.get() === position
    ? { transform: [{ translateX: x.get() }, { translateY: y.get() + dismissY.get() }, { scale: scale.get() }] }
    : { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] }));
  const label = photoLabel(position, count);
  return (
    <View
      style={{ width: viewport.width, height: viewport.height }}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!active}
    >
      <Animated.View
        style={[styles.fill, zoomStyle]}
        accessible={active}
        accessibilityRole="image"
        accessibilityLabel={failed ? `${label}. ${FAILED_COPY}` : label}
        accessibilityActions={active ? actions : undefined}
        onAccessibilityAction={active ? onAction : undefined}
      >
        <Image
          source={{ uri: photo.signedUrl }}
          style={styles.fill}
          contentFit="contain"
          accessible={false}
          onLoad={(event) => onSize(photo.slot, { width: event.source.width, height: event.source.height })}
          onError={() => onFail(photo.slot)}
        />
      </Animated.View>
      {failed ? (
        <View pointerEvents="none" style={styles.failure} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.failureText}>{FAILED_COPY}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: BACKDROP },
  stage: { flex: 1, overflow: 'hidden' },
  strip: { flexDirection: 'row', height: '100%' },
  fill: { width: '100%', height: '100%' },
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  counterPill: {
    minHeight: size.chipHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  counter: { ...type.label, color: colors.inverseOnSurface, fontVariant: ['tabular-nums'] },
  close: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  closePressed: { backgroundColor: colors.inverseSurface },
  failure: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  failureText: { ...type.body, color: colors.inverseOnSurface, textAlign: 'center' },
});
