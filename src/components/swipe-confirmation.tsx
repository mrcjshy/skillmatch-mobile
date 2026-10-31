import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme } from '@/components/refinement-theme';
import { MotionTokens } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export type SwipeConfirmationProps = { label: string; confirmationTitle: string; confirmationMessage: string; disabled?: boolean; resetKey: string; onConfirm: () => void };

const { swipeHint, duration, easing } = MotionTokens;
const THUMB_TRAVEL_MARGIN = 72;
/** The words are gone by the time the thumb is this far along the track. */
const LABEL_GONE_AT = 0.55;
const PRESSED_SCALE = 1.06;

/** A short flick at the start cannot commit a consequential booking confirmation. */
function shouldCommit(distance: number, span: number, velocity: number) {
  'worklet';
  return span > 0 && (distance >= span * 0.9 || (distance >= span * 0.6 && velocity > 0 && distance + velocity * 0.12 >= span * 0.9));
}
export function SwipeConfirmation({ label, confirmationTitle, confirmationMessage, disabled = false, resetKey, onConfirm }: SwipeConfirmationProps) {
  const ui = useUiTheme();
  const reduced = useReducedMotion();
  const x = useSharedValue(0), start = useSharedValue(0), span = useSharedValue(0);
  const hint = useSharedValue(0), pressed = useSharedValue(1), done = useSharedValue(0);
  const latched = useSharedValue(false), ended = useSharedValue(false);
  const [committedKey, setCommittedKey] = useState<string | null>(null);
  const jsLock = useRef(false), mounted = useRef(true);
  const scope = useMemo(() => ({ disabled, resetKey, onConfirm }), [disabled, resetKey, onConfirm]);
  const committedScope = useRef<typeof scope | null>(scope);
  // Retire retained dialogs and queued releases at commit, including disable/re-enable cycles.
  useLayoutEffect(() => { committedScope.current = scope; return () => { committedScope.current = null; }; }, [scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { jsLock.current = false; latched.set(false); done.set(0); cancelAnimation(x); x.set(0); }, [resetKey, latched, done, x]);
  // Once, as the control appears: the thumb leans the way it travels, so the swipe explains itself.
  useEffect(() => {
    if (reduced || disabled) return;
    const curve = Easing.bezier(...easing.standard);
    hint.set(withDelay(swipeHint.delay, withRepeat(withSequence(
      withTiming(swipeHint.lean, { duration: swipeHint.leg, easing: curve, reduceMotion: ReduceMotion.Never }),
      withTiming(0, { duration: swipeHint.leg, easing: curve, reduceMotion: ReduceMotion.Never }),
    ), swipeHint.times, false, undefined, ReduceMotion.Never), ReduceMotion.Never));
    return () => { cancelAnimation(hint); hint.set(0); };
  }, [reduced, disabled, resetKey, hint]);
  const confirm = useCallback(() => {
    if (!mounted.current || committedScope.current !== scope || scope.disabled || jsLock.current) {
      // A rejected old release must not leave the current action visually latched.
      if (mounted.current && !jsLock.current) { latched.set(false); done.set(0); cancelAnimation(x); x.set(0); }
      return;
    }
    jsLock.current = true;
    setCommittedKey(scope.resetKey);
    scope.onConfirm();
  }, [scope, latched, done, x]);
  const settle = useCallback((target: number, velocity: number) => {
    'worklet';
    x.set(reduced ? target : withSpring(target, { duration: 400, dampingRatio: 0.8, velocity, overshootClamping: true, reduceMotion: ReduceMotion.System }));
  }, [reduced, x]);
  const hold = useCallback((scale: number) => {
    'worklet';
    pressed.set(reduced ? 1 : withTiming(scale, { duration: duration.micro, reduceMotion: ReduceMotion.Never }));
  }, [reduced, pressed]);
  const pan = useMemo(() => Gesture.Pan().enabled(!disabled).maxPointers(1).activeOffsetX(8).failOffsetY([-12, 12])
    .onStart(() => {
      ended.set(false);
      cancelAnimation(hint); hint.set(0);
      if (latched.get()) return;
      hold(PRESSED_SCALE);
      cancelAnimation(x); start.set(x.get());
    })
    .onUpdate(event => {
      if (disabled || latched.get()) return;
      x.set(Math.min(span.get(), Math.max(0, start.get() + event.translationX)));
    })
    // eslint-disable-next-line react-hooks/refs -- Gesture registration stores this UI-runtime callback; the RN ref guard is scheduled only on release, never read during render.
    .onEnd((event, success) => {
      ended.set(true);
      hold(1);
      if (latched.get()) return;
      if (success && !disabled && shouldCommit(x.get(), span.get(), event.velocityX)) {
        latched.set(true); settle(span.get(), event.velocityX);
        done.set(reduced ? 1 : withTiming(1, { duration: duration.standard, reduceMotion: ReduceMotion.Never }));
        scheduleOnRN(confirm);
      } else settle(0, event.velocityX);
    })
    .onFinalize(() => { hold(1); if (!ended.get() && !latched.get()) settle(0, 0); }),
  [disabled, ended, latched, done, x, start, span, hint, reduced, settle, hold, confirm]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() + hint.get() }, { scale: pressed.get() }] }));
  // The fill is a full-width layer slid from the left, so the drag never commits a layout per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() + hint.get() - span.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: latched.get() ? 1 : interpolate(x.get(), [0, span.get() * LABEL_GONE_AT], [1, 0], Extrapolation.CLAMP),
  }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: 1 - done.get(), transform: [{ scale: 1 - done.get() * 0.4 }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: done.get(), transform: [{ scale: 0.6 + done.get() * 0.4 }] }));
  const thumbColor = disabled && committedKey !== resetKey ? ui.colors.controlBorder : ui.colors.accent;
  return <GestureHandlerRootView>
    <View accessible accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint="Drag the arrow to the end. Screen readers: activate to review a separate confirmation."
      accessibilityState={{ disabled }} accessibilityActions={[{ name: 'activate', label: 'Review confirmation' }]}
      onAccessibilityAction={event => {
        if (disabled || event.nativeEvent.actionName !== 'activate') return;
        Alert.alert(confirmationTitle, confirmationMessage, [{ text: 'Not yet', style: 'cancel' }, { text: 'Confirm', onPress: confirm }]);
      }}
      onLayout={event => { span.set(Math.max(0, event.nativeEvent.layout.width - THUMB_TRAVEL_MARGIN)); }}
      style={[styles.track, { borderColor: ui.colors.controlBorder, backgroundColor: ui.colors.surfaceSunken }]}>
      <Animated.View pointerEvents="none" accessible={false} style={[styles.fill, { backgroundColor: ui.colors.accentSubtle }, fillStyle]} />
      <Animated.View pointerEvents="none" accessible={false} style={labelStyle}>
        <Text style={[ui.type.button, styles.label, { color: ui.colors.textPrimary }]}>{label}</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View accessible={false} style={[styles.thumb, { backgroundColor: thumbColor }, thumbStyle]}>
          <Animated.View style={[styles.glyph, arrowStyle]}><AppSymbol synchronousGlyph accessible={false} name={{ android: 'arrow_forward', ios: 'arrow.right' }} size={26} tintColor={ui.colors.onAccent} /></Animated.View>
          <Animated.View style={[styles.glyph, checkStyle]}><AppSymbol synchronousGlyph accessible={false} name={{ android: 'check', ios: 'checkmark' }} size={26} tintColor={ui.colors.onAccent} /></Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  track: { minHeight: 72, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingVertical: 20, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  label: { marginLeft: 76, marginRight: 22, textAlign: 'center', flexShrink: 1 },
  thumb: { position: 'absolute', left: 8, top: 8, bottom: 8, width: 56, minHeight: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
