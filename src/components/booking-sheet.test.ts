// @ts-expect-error -- Node-only component harness; native rendering is checked on emulators.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { SkillMatchTheme } from '@/constants/theme';
import { MotionTokens } from '@/constants/motion';
import * as geometry from '@/lib/booking-sheet';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (value: any) => value.android ?? value.default } }));

type Props = Record<string, any>;
type Node = { type: string; props: Props };
const nodes = (tree: any): Node[] => !tree || typeof tree !== 'object' ? []
  : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flat = (style: any): Props => Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style ?? {};
const body = (tree: Node) => nodes(tree).find(node => node.props.accessibilityElementsHidden !== undefined)!;
const panel = (tree: Node) => nodes(tree).find(node => node.props.accessibilityLabel?.startsWith('Booking details panel'))!;
const toggle = (tree: Node) => nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button')!;
const scroll = (tree: Node) => nodes(tree).find(node => node.type === 'ScrollView')!;

function harness(bottom = 24, extraProps: Props = {}) {
  const slots: any[] = [], effects: (() => void)[] = [];
  let cursor = 0;
  let reducedMotion = false;
  const timings: Props[] = [];
  const hook = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return index;
  };
  const memo = (fn: () => any, deps: any[]) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) slots[index] = { deps, value: fn() };
    return slots[index].value;
  };
  const jsx = (type: string, props: Props): Node => ({ type, props });
  const onCollapsedHeight = vi.fn(), action = vi.fn(), stop = vi.fn();
  const children = jsx('View', { children: [
    jsx('Text', { children: 'Booking reference' }),
    jsx('Button', { children: 'Booking action', onPress: action }),
  ] });
  const header = jsx('View', { children: ['Compact summary', jsx('Button', { children: 'Stop', onPress: stop })] });
  const refreshControl = jsx('RefreshControl', {});
  const modules: Props = {
    react: {
      useState: (initial: any) => {
        const index = hook(initial);
        return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
      },
      useRef: (value: any) => slots[hook({ current: value })],
      useMemo: memo,
      useEffect: (fn: () => any, deps: any[]) => {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) {
          effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable',
      StyleSheet: { create: (styles: Props) => styles, absoluteFill: {} },
      Easing: { bezier: () => 'easing' },
      PanResponder: { create: (handlers: Props) => ({ panHandlers: { gesture: handlers } }) },
      Animated: {
        View: 'Animated.View',
        Value: class {
          constructor(public value: number) {}
          setValue(value: number) { this.value = value; }
          interpolate() { return 0; }
        },
        timing: (value: { setValue: (next: number) => void }, config: Props) => {
          timings.push(config);
          return { start: () => value.setValue(config.toValue), stop() {} };
        },
      },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom, left: 0, right: 0 }) },
    '@/components/refinement-theme': { useUiTheme: () => SkillMatchTheme.ui },
    '@/constants/motion': { MotionTokens },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reducedMotion },
    '@/lib/booking-sheet': geometry,
  };
  const exports: Props = {};
  const source = ts.transpileModule(readFileSync('src/components/booking-sheet.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', source)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected native dependency: ${name}`);
    return modules[name];
  }, exports);
  const render = (): Node => {
    cursor = 0;
    const tree = exports.BookingSheet({ header, children, topReserve: 88, onCollapsedHeight, refreshControl, ...extraProps });
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
  const measure = (headerHeight = 180) => {
    const tree = render();
    tree.props.onLayout({ nativeEvent: { layout: { height: 900 } } });
    nodes(tree).find(node => node !== tree && node.props.onLayout)!.props.onLayout({ nativeEvent: { layout: { height: headerHeight } } });
    return render();
  };
  return { render, measure, children, header, refreshControl, onCollapsedHeight, action, stop, timings,
    setReducedMotion: (value: boolean) => { reducedMotion = value; } };
}

describe('collapsed booking sheet safe area', () => {
  it('settles a partial header drag immediately after reduced motion is enabled while mounted', () => {
    const h = harness();
    const tree = h.measure();
    // This is the installed native responder, retained through the live preference update.
    const gesture = nodes(tree).find(node => node.props.gesture?.onMoveShouldSetPanResponder)!.props.gesture;
    h.setReducedMotion(true); h.render(); h.timings.length = 0;
    gesture.onPanResponderGrant();
    gesture.onPanResponderMove({}, { dy: -40 });
    gesture.onPanResponderRelease({}, { dy: -40, vy: 0 });
    expect(toggle(h.render()).props.accessibilityLabel).toBe('Show booking details');
    expect(h.timings.map(config => config.duration)).toEqual([0]);
  });

  it.each([
    { target: 'header', position: 'collapsed', end: 'terminate', initial: false, next: true, immediate: true },
    { target: 'body', position: 'expanded', end: 'release', initial: false, next: true, immediate: true },
    { target: 'body', position: 'expanded', end: 'terminate', initial: false, next: true, immediate: true },
    { target: 'header', position: 'collapsed', end: 'release', initial: true, next: false, immediate: false },
    { target: 'header', position: 'collapsed', end: 'terminate', initial: true, next: false, immediate: false },
    { target: 'body', position: 'expanded', end: 'release', initial: true, next: false, immediate: false },
    { target: 'body', position: 'expanded', end: 'terminate', initial: true, next: false, immediate: false },
    { target: 'header', position: 'collapsed', end: 'release', initial: false, next: false, immediate: false },
    { target: 'body', position: 'expanded', end: 'release', initial: true, next: true, immediate: true },
  ])('uses the current motion preference for partial $target $end ($initial to $next)', ({ target, position, end, initial, next, immediate }) => {
    const h = harness(24, { initialPosition: position });
    h.setReducedMotion(initial);
    const tree = h.measure();
    const gesture = nodes(tree).find(node => target === 'header'
      ? node.props.gesture?.onMoveShouldSetPanResponder
      : node.props.gesture?.onMoveShouldSetPanResponderCapture)!.props.gesture;
    h.setReducedMotion(next); h.render(); h.timings.length = 0;
    const dy = position === 'collapsed' ? -40 : 40;
    gesture.onPanResponderGrant();
    gesture.onPanResponderMove({}, { dy });
    gesture[end === 'release' ? 'onPanResponderRelease' : 'onPanResponderTerminate']({}, { dy, vy: 0 });
    expect(toggle(h.render()).props.accessibilityLabel).toBe(position === 'expanded' ? 'Show map' : 'Show booking details');
    expect(h.timings).toHaveLength(1);
    if (immediate) expect(h.timings[0].duration).toBe(0);
    else expect(h.timings[0].duration).toBeGreaterThan(0);
  });

  it('retains an expanded detent when the tracking presentation becomes a Booking', () => {
    const onPositionChange = vi.fn();
    const h = harness(24, { initialPosition: 'expanded', onPositionChange });
    const tree = h.measure();
    expect(panel(tree).props.accessibilityLabel).toBe('Booking details panel, expanded');
    expect(body(tree).props.pointerEvents).toBe('auto');
    expect(onPositionChange).toHaveBeenCalledWith('expanded');
  });
  it.each([
    { bottom: 24, headerHeight: 180 },
    { bottom: 48, headerHeight: 248 },
    { bottom: 0, headerHeight: 180 },
  ])('hides the expanded body instead of painting it in the $bottom dp bottom inset', ({ bottom, headerHeight }) => {
    const h = harness(bottom), tree = h.measure(headerHeight);
    const sheetStyle = flat(panel(tree).props.style);
    const visibleHeight = sheetStyle.height - sheetStyle.transform[0].translateY.value;
    expect(visibleHeight).toBe(headerHeight + bottom);
    expect(h.onCollapsedHeight).toHaveBeenLastCalledWith(headerHeight + bottom);
    // The visible strip after the header belongs to the opaque sheet, never to Booking reference/actions.
    expect(flat(body(tree).props.style).opacity).toBe(0);
    expect(sheetStyle.backgroundColor).toBe('#FFFFFF');
    expect(body(tree).props.pointerEvents).toBe('none');
    expect(body(tree).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(body(tree).props.accessibilityElementsHidden).toBe(true);
    expect(scroll(tree).props.scrollEnabled).toBe(false);
    expect(scroll(tree).props.children).toBe(h.children);
    expect(h.action).not.toHaveBeenCalled();
    expect(h.stop).not.toHaveBeenCalled();
  });

  it('has no arrow control: the drag handle is the only (accessible) toggle', () => {
    const tree = harness().measure();
    expect(nodes(tree).some(node => node.type === 'IconButton' || /expand_(less|more)|chevron\.(up|down)/.test(JSON.stringify(node.props.icon ?? '')))).toBe(false);
    expect(toggle(tree).props.accessibilityHint).toMatch(/Swipe up or down/);
    expect(nodes(toggle(tree)).some(node => node.props.style && flat(node.props.style).height === 5)).toBe(true);
  });

  it('restores the same booking content, actions and scrolling through the accessible toggle', () => {
    const h = harness();
    let tree = h.measure();
    expect(toggle(tree).props.accessibilityLabel).toBe('Show booking details');
    toggle(tree).props.onPress();
    tree = h.render();
    expect(flat(body(tree).props.style).opacity ?? 1).toBe(1);
    expect(body(tree).props.pointerEvents ?? 'auto').toBe('auto');
    expect(body(tree).props.importantForAccessibility).toBe('auto');
    expect(body(tree).props.accessibilityElementsHidden).toBe(false);
    expect(scroll(tree).props.scrollEnabled).toBe(true);
    expect(scroll(tree).props.children).toBe(h.children);
    expect(scroll(tree).props.refreshControl).toBe(h.refreshControl);
    expect(flat(scroll(tree).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(24);
    nodes(tree).find(node => node.props.children === 'Booking action')!.props.onPress();
    expect(h.action).toHaveBeenCalledOnce();
    expect(toggle(tree).props.accessibilityLabel).toBe('Show map');
    toggle(tree).props.onPress();
    tree = h.render();
    expect(flat(body(tree).props.style).opacity).toBe(0);
    expect(scroll(tree).props.children).toBe(h.children);
    nodes(tree).find(node => node.props.children === 'Stop')!.props.onPress();
    expect(h.stop).toHaveBeenCalledOnce();
  });

  it('preserves map pans, header dragging and pull-down only at the top of expanded content', () => {
    const h = harness();
    let tree = h.measure();
    const headerGesture = nodes(tree).find(node => node.props.gesture?.onMoveShouldSetPanResponder)!.props.gesture;
    expect(tree.props.pointerEvents).toBe('box-none');
    expect(tree.props.gesture).toBeUndefined();
    expect(headerGesture.onMoveShouldSetPanResponder({}, { dx: 40, dy: 15 })).toBe(false);
    expect(headerGesture.onMoveShouldSetPanResponder({}, { dx: 0, dy: 4 })).toBe(false);
    expect(headerGesture.onMoveShouldSetPanResponder({}, { dx: 2, dy: -80 })).toBe(true);
    headerGesture.onPanResponderGrant();
    headerGesture.onPanResponderMove({}, { dy: -80 });
    headerGesture.onPanResponderRelease({}, { dy: -80, vy: -0.8 });
    tree = h.render();
    expect(body(tree).props.accessibilityElementsHidden).toBe(false);
    const bodyGesture = body(tree).props.gesture;
    scroll(tree).props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } });
    expect(bodyGesture.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: 80 })).toBe(false);
    scroll(tree).props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    expect(bodyGesture.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: 80 })).toBe(true);
    bodyGesture.onPanResponderGrant();
    bodyGesture.onPanResponderRelease({}, { dy: 80, vy: 0.8 });
    tree = h.render();
    expect(body(tree).props.accessibilityElementsHidden).toBe(true);
    expect(scroll(tree).props.children).toBe(h.children);
  });
});
