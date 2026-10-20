// @ts-expect-error -- Node-only component harness; Android geometry is verified separately.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (v: any) => v.default } }));

type Props = Record<string, any>;
const nodes = (tree: any): any[] => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s ?? {};
function harness() {
  const slots: any[] = []; let cursor = 0, reduced = false;
  const effects: (() => void)[] = [], keyboard: Props = {}, timing = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
  const hook = (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return i; };
  const jsx = (type: any, props: Props) => ({ type, props });
  const modules: Props = {
    react: { useState: (initial: any) => { const i = hook(initial); return [slots[i], (v: any) => { slots[i] = v; }]; }, useRef: (value: any) => slots[hook({ current: value })],
      useEffect: (fn: () => void) => { effects.push(fn); }, useMemo: (fn: () => any) => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
      StyleSheet: { create: (s: any) => s, absoluteFill: {} }, Easing: { bezier: () => 'easing' },
      AccessibilityInfo: { isReduceMotionEnabled: async () => reduced },
      Keyboard: { metrics: () => undefined, addListener: (name: string, fn: any) => { keyboard[name] = fn; return { remove: vi.fn() }; } },
      PanResponder: { create: (handlers: any) => ({ panHandlers: { gesture: handlers } }) },
      Animated: { View: 'Animated.View', timing, Value: class { interpolate() { return 0; } } },
      useWindowDimensions: () => ({ height: 900, width: 412 }),
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    '@/components/refinement-theme': { useUiTheme: () => SkillMatchTheme.ui },
    '@/components/app-icon-button': { AppIconButton: 'IconButton' },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
    '@/constants/motion': { MotionTokens: { duration: { large: 240, exit: 160 }, easing: { decelerate: [0, 0, 1, 1], accelerate: [0, 0, 1, 1] } } },
  };
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync('src/components/app-sheet.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; }, exports);
  const close = vi.fn();
  const render = (props: Props = {}) => { cursor = 0; const tree = exports.AppSheet({ visible: true, onClose: close, title: 'Active booking', swipeToClose: true, children: 'Content', ...props }); effects.splice(0).forEach(fn => fn()); return tree; };
  return { render, close, keyboard, timing, reduce: () => { reduced = true; } };
}
it('handles Android Back and a labelled tap alternative without navigating', () => {
  const h = harness(), tree = h.render(); tree.props.onRequestClose(); expect(h.close).toHaveBeenCalledTimes(1);
  nodes(tree).find(n => n.type === 'IconButton').props.onPress(); expect(h.close).toHaveBeenCalledTimes(2);
  expect(nodes(tree).find(n => n.type === 'IconButton').props.accessibilityLabel).toBe('Close Active booking');
  h.render({ dismissible: false }).props.onRequestClose(); expect(h.close).toHaveBeenCalledTimes(2);
});
it('collapses on downward swipe at the top while preserving vertical content scrolling elsewhere', () => {
  const h = harness(), tree = h.render(), gesture = nodes(tree).find(n => n.props.gesture)?.props.gesture;
  expect(gesture).toBeDefined();
  expect(gesture.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: 40 })).toBe(true);
  nodes(tree).find(n => n.type === 'ScrollView').props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } });
  expect(gesture.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: 40 })).toBe(false);
  nodes(tree).find(n => n.type === 'ScrollView').props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  gesture.onPanResponderRelease({}, { dx: 2, dy: 70 }); expect(h.close).toHaveBeenCalledTimes(1);
});
it('leaves existing non-gesture sheets and non-dismissible requests unchanged', () => {
  const h = harness();
  for (const props of [{ swipeToClose: false }, { dismissible: false }]) {
    const gesture = nodes(h.render(props)).find(n => n.props.gesture)?.props.gesture;
    expect(gesture?.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: 70 }) ?? false).toBe(false);
  }
});
it('lets the handle collapse a scrolled sheet without stealing the close-button tap', () => {
  const h = harness(), tree = h.render();
  nodes(tree).find(n => n.type === 'ScrollView').props.onScroll({ nativeEvent: { contentOffset: { y: 180 } } });
  const handle = nodes(tree).find(n => n.props.gesture?.onStartShouldSetPanResponder);
  expect(handle).toBeDefined();
  expect(handle.props.gesture.onStartShouldSetPanResponder()).toBe(true);
  handle.props.gesture.onPanResponderRelease({}, { dx: 0, dy: 75 }); expect(h.close).toHaveBeenCalledTimes(1);
  nodes(handle).find(n => n.type === 'IconButton').props.onPress(); expect(h.close).toHaveBeenCalledTimes(2);
});
it('uses live reduced motion and keeps all content inside a scrolling safe-area bounded sheet', () => {
  const h = harness(); h.reduce(); const tree = h.render();
  expect(h.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 0 }));
  expect(nodes(tree).filter(n => n.type === 'ScrollView')).toHaveLength(1);
  const style = flat(nodes(tree).find(n => n.props.accessibilityViewIsModal).props.style);
  expect(style.maxHeight).toBeLessThanOrEqual(900 - 24); expect(style.paddingBottom).toBeGreaterThanOrEqual(24);
});
it('reduces the available sheet height above the on-screen keyboard', () => {
  const h = harness(); h.render(); expect(h.keyboard.keyboardDidShow).toBeDefined();
  h.keyboard.keyboardDidShow({ endCoordinates: { screenY: 600, height: 300 } });
  const tree = h.render(), style = flat(nodes(tree).find(n => n.props.accessibilityViewIsModal).props.style);
  expect(style.maxHeight).toBeLessThanOrEqual(600 - 24);
  h.keyboard.keyboardDidHide(); expect(flat(nodes(h.render()).find(n => n.props.accessibilityViewIsModal).props.style).maxHeight).toBeGreaterThan(style.maxHeight);
});
