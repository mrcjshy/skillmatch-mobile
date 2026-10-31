import { createElement } from 'react';
// @ts-expect-error -- Node-only SSR gesture harness; native compilation omits DOM declarations.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { SwipeConfirmation } from './swipe-confirmation';
const native = vi.hoisted(() => ({ nodes: [] as any[], gestures: [] as any[], springs: [] as any[], alerts: [] as any[], rnCalls: 0, reduced: false }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  const host = (props: any) => { native.nodes.push(props); return createElement('div', null, props.children); };
  return { View: host, Text: host, StyleSheet: { create: (s: any) => s }, Alert: { alert: (...args: any[]) => native.alerts.push(args) } };
});
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => ({ colors: { accent: '#1C3AA6', accentSubtle: '#E9EEFC', onAccent: '#fff', surfaceSunken: '#EFEEEA', textPrimary: '#1B1F24', textSecondary: '#59606B', controlBorder: '#7A818C' }, type: { button: { fontSize: 15 } }, spacing: { sm: 8 }, radius: { pill: 999 } }) }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => native.reduced }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => { native.rnCalls++; fn(); } }));
vi.mock('react-native-reanimated', async () => {
  const rn = await import('react-native');
  return { default: { View: rn.View }, useSharedValue: (initial: any) => { let value = initial; return { get: () => value, set: (next: any) => { value = next; } }; },
    useAnimatedStyle: (fn: () => any) => fn(), cancelAnimation: () => {}, ReduceMotion: { System: 'system', Never: 'never' }, Extrapolation: { CLAMP: 'clamp' }, Easing: { bezier: () => 'curve' }, interpolate: () => 1, withTiming: (value: number) => value, withDelay: (_ms: number, value: any) => value, withSequence: (...steps: any[]) => steps.at(-1), withRepeat: (value: any) => value,
    withSpring: (value: number, config: any) => { native.springs.push({ value, config }); return value; } };
});
vi.mock('react-native-gesture-handler', async () => {
  const rn = await import('react-native');
  return { GestureHandlerRootView: rn.View, GestureDetector: ({ children }: any) => children, Gesture: { Pan: () => {
    const handlers: any = {}; native.gestures.push(handlers);
    const builder = new Proxy({}, { get: (_target, name) => (value: any) => { handlers[name] = value; return builder; } });
    return builder;
  } } };
});
beforeEach(() => { native.nodes = []; native.gestures = []; native.springs = []; native.alerts = []; native.rnCalls = 0; native.reduced = false; });
function mount(disabled = false) {
  let commits = 0;
  const html = renderToStaticMarkup(createElement(SwipeConfirmation, { label: 'Swipe to Confirm Arrival', confirmationTitle: 'Confirm arrival?', confirmationMessage: 'Only at the job site.', disabled, resetKey: 'one', onConfirm: () => { commits++; } }));
  expect(native.gestures).toHaveLength(1);
  const layout = native.nodes.find(n => n.onLayout);
  expect(layout).toBeDefined();
  layout.onLayout({ nativeEvent: { layout: { width: 344, height: 72 } } });
  return { html, gesture: native.gestures[0], commits: () => commits };
}
function drag(gesture: any, distance: number, velocity = 0, success = true) {
  gesture.onStart(); gesture.onUpdate({ translationX: distance }); gesture.onEnd({ velocityX: velocity }, success); gesture.onFinalize();
}
it('renders the action with no ordinary tap-to-confirm handler', () => {
  const result = mount(); expect(result.html).toContain('Swipe to Confirm Arrival');
  expect(native.nodes.some(n => n.onPress)).toBe(false);
});
it.each([[0, 3000], [120, 0], [-200, 3000], [150, 2000]])('rejects a tap, short/start-edge flick or reverse drag (%s,%s)', (distance, velocity) => {
  const h = mount(); drag(h.gesture, distance, velocity); expect(h.commits()).toBe(0);
});
it('commits a full deliberate swipe exactly once, off the frame callback', () => {
  const h = mount(); h.gesture.onStart(); h.gesture.onUpdate({ translationX: 260 });
  expect(native.rnCalls).toBe(0); expect(h.commits()).toBe(0);
  h.gesture.onEnd({ velocityX: 0 }, true); h.gesture.onFinalize(); drag(h.gesture, 272);
  expect(h.commits()).toBe(1); expect(native.rnCalls).toBe(1);
});
it('accepts forward momentum only after substantial deliberate travel', () => {
  const h = mount(); drag(h.gesture, 180, 900); expect(h.commits()).toBe(1);
});
it('cancellation at the far edge never commits', () => {
  const h = mount(); drag(h.gesture, 272, 200, false); expect(h.commits()).toBe(0);
});
it('disabled cannot commit even through a stale native callback', () => {
  const h = mount(true); drag(h.gesture, 272); expect(h.commits()).toBe(0);
});
it('passes release velocity into a clamped spring on snap back', () => {
  const h = mount(); drag(h.gesture, 80, -400);
  expect(native.springs.some(s => s.value === 0 && s.config.velocity === -400 && s.config.duration === 400 && s.config.dampingRatio === 0.8 && s.config.overshootClamping === true)).toBe(true);
});
it('reduced motion keeps deliberate confirmation without a settle animation', () => {
  native.reduced = true; const h = mount(); drag(h.gesture, 260);
  expect(h.commits()).toBe(1); expect(native.springs).toHaveLength(0);
});
it('screen-reader activation opens a separate explicit confirmation; cancel does not submit', () => {
  const h = mount(); const accessible = native.nodes.find(n => n.onAccessibilityAction);
  expect(accessible).toBeDefined(); accessible.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  expect(h.commits()).toBe(0); expect(native.alerts).toHaveLength(1);
  const buttons = native.alerts[0][2]; expect(buttons[0].style).toBe('cancel');
  buttons[1].onPress(); buttons[1].onPress(); expect(h.commits()).toBe(1);
});
