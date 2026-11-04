import { act, createContext, createElement, useContext, useId, useLayoutEffect } from 'react';
// @ts-expect-error -- Node-only source guard; the app tsconfig carries no Node types.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobPhotoGallery } from './job-photo-gallery';
import { JobPhotoViewer } from './job-photo-viewer';
import { SkillMatchTheme } from '@/constants/theme';

/**
 * Job photo viewer: the real gallery and viewer rendered by React with inert native seams. The
 * gesture handlers are called directly with gesture events. This proves wiring, maths, labels and
 * close paths; gesture feel and the Modal window on Android need a device.
 */
const h = vi.hoisted(() => ({
  nodes: new Map<string, any>(),
  log: [] as string[],
  announcements: [] as string[],
  springs: [] as any[],
  timings: [] as any[],
  decays: [] as any[],
  reduced: false,
  pressScale: 0,
  press: { style: { transform: [{ scale: 1 }] }, onPressIn: () => {}, onPressOut: () => {} },
}));

const Parent = createContext<string | null>(null);
/** A native view: records its committed props and renders its children. */
function Host({ kind, children, ...props }: any) {
  const id = useId(), parentId = useContext(Parent);
  useLayoutEffect(() => { h.nodes.set(id, { id, parentId, kind, children, ...props }); return () => { h.nodes.delete(id); }; });
  useLayoutEffect(() => { if (kind === 'Modal') h.log.push('mount:Modal'); }, [kind]);
  return kind === 'Text' || kind === 'Image' ? null : createElement(Parent.Provider, { value: id }, children);
}
// A declaration, not a const: the hoisted vi.mock factories below call it before the module body runs.
function host(kind: string) {
  return function NativeView(props: any) { return createElement(Host, { ...props, kind }); };
}

vi.mock('react-native', () => ({
  View: host('View'), Text: host('Text'), Pressable: host('Pressable'), Modal: host('Modal'),
  StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  Platform: { OS: 'android', select: (choices: any) => choices.android ?? choices.default },
  AccessibilityInfo: { announceForAccessibility: (message: string) => { h.announcements.push(message); } },
  useWindowDimensions: () => ({ width: 400, height: 800, fontScale: 1, scale: 1 }),
}));
vi.mock('expo-image', () => ({ Image: host('Image') }));
vi.mock('expo-status-bar', () => ({ StatusBar: Object.assign(() => null, { setStyle: (style: string) => { h.log.push(`status:${style}`); } }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: host('AppSymbol') }));
vi.mock('@/components/inline-status', () => ({ InlineStatus: host('InlineStatus') }));
vi.mock('@/components/motion', () => ({ MotionView: host('MotionView'), usePressScale: (scale: number) => { h.pressScale = scale; return h.press; } }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => h.reduced }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...args: any[]) => void, ...args: any[]) => fn(...args) }));
vi.mock('react-native-reanimated', async () => {
  const { useState } = await import('react');
  const shared = (initial: any) => {
    let value = initial;
    // A decay is left running on the device; here the value stays where the finger let go.
    return { get: () => value, set: (next: any) => { if (!(next && typeof next === 'object' && 'decay' in next)) value = next; } };
  };
  return {
    __esModule: true,
    default: { View: host('Animated.View') },
    ReduceMotion: { System: 'system', Never: 'never' },
    cancelAnimation: () => {},
    useSharedValue: (initial: any) => useState(() => shared(initial))[0],
    // Live: reading the style later gives the values the UI thread would draw now.
    useAnimatedStyle: (updater: () => any) => ({ live: updater }),
    useAnimatedReaction: () => {},
    withSpring: (to: number, config: any) => { h.springs.push({ to, config }); return to; },
    withTiming: (to: number, config: any, done?: (finished: boolean) => void) => { h.timings.push({ to, config }); done?.(true); return to; },
    withDecay: (config: any) => { h.decays.push(config); return { decay: config }; },
  };
});
vi.mock('react-native-gesture-handler', () => {
  const builder = (kind: string) => () => {
    const handlers: any = { kind };
    const gesture: any = new Proxy({}, { get: (_target, name) => name === 'handlers' ? handlers : (value: any) => { handlers[name as string] = value; return gesture; } });
    return gesture;
  };
  return {
    GestureHandlerRootView: host('GestureHandlerRootView'),
    GestureDetector: ({ gesture, children }: any) => createElement(Host, { kind: 'GestureDetector', gesture }, children),
    Gesture: { Pinch: builder('pinch'), Pan: builder('pan'), Tap: builder('tap'), Simultaneous: (...gestures: any[]) => ({ simultaneous: gestures.map((g) => g.handlers) }) },
  };
});

const { colors } = SkillMatchTheme.ui;
const PHOTOS = [
  { slot: 3 as const, signedUrl: 'https://signed.example/3' },
  { slot: 1 as const, signedUrl: 'https://signed.example/1' },
  { slot: 2 as const, signedUrl: 'https://signed.example/2' },
];
const SORTED = [PHOTOS[1], PHOTOS[2], PHOTOS[0]];

const all = () => [...h.nodes.values()];
const nodes = (kind: string) => all().filter((n) => n.kind === kind);
const labelled = (label: string) => all().find((n) => n.accessibilityLabel === label);
const texts = () => nodes('Text').map((n) => [n.children].flat(Infinity).join(''));
const flat = (style: any): any => {
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flat));
  if (style && typeof style === 'object' && typeof style.live === 'function') return style.live();
  return style ?? {};
};
const ancestors = (node: any) => { const kinds: string[] = []; let at = h.nodes.get(node.parentId); while (at) { kinds.push(at.kind); at = h.nodes.get(at.parentId); } return kinds; };
const modal = () => nodes('Modal')[0];
const photo = () => all().find((n) => n.kind === 'Animated.View' && n.accessibilityRole === 'image' && n.accessible === true);
const strip = () => nodes('Animated.View').find((n) => flat(n.style).flexDirection === 'row' && flat(n.style).height === '100%');
const transform = (node: any) => Object.assign({}, ...flat(node.style).transform);
const gestures = () => {
  const [pinch, pan, tap] = nodes('GestureDetector').at(-1).gesture.simultaneous;
  return { pinch, pan, tap };
};
const actionNames = () => photo().accessibilityActions.map((action: any) => action.name);
const fire = async (fn: () => void) => { await act(async () => { fn(); }); };
async function drag(dx: number, dy: number, velocity = { x: 0, y: 0 }, success = true) {
  const { pan } = gestures();
  const start = { translationX: Math.sign(dx) * 10, translationY: Math.sign(dy) * 10, numberOfPointers: 1 };
  await fire(() => {
    pan.onStart(start);
    pan.onUpdate({ translationX: start.translationX + dx, translationY: start.translationY + dy, numberOfPointers: 1 });
    pan.onEnd({ translationX: start.translationX + dx, translationY: start.translationY + dy, velocityX: velocity.x, velocityY: velocity.y, numberOfPointers: 1 }, success);
    pan.onFinalize({}, success);
  });
}
const action = (actionName: string) => fire(() => photo().onAccessibilityAction({ nativeEvent: { actionName } }));

const roots: any[] = [];
async function mount(element: any) {
  const doc: any = { nodeType: 9, activeElement: null, documentElement: {}, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, HTMLIFrameElement: class {}, event: undefined }; doc.defaultView = win;
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const name: string = 'react-dom/client'; const renderer = await import(/* @vite-ignore */ name);
  const root = renderer.createRoot({ nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} });
  roots.push(root);
  await act(async () => root.render(element));
  return { render: (next: any) => act(async () => root.render(next)), unmount: () => act(async () => root.unmount()) };
}
const viewer = (props: Partial<Parameters<typeof JobPhotoViewer>[0]> = {}) =>
  mount(createElement(JobPhotoViewer, { photos: SORTED, initialIndex: 0, onClose: vi.fn(), ...props }));

beforeEach(() => {
  h.nodes.clear(); h.log = []; h.announcements = []; h.springs = []; h.timings = []; h.decays = []; h.reduced = false; h.pressScale = 0;
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe('Job photo gallery thumbnails', () => {
  it('shows each photo, in slot order, as a button that names its place', async () => {
    await mount(createElement(JobPhotoGallery, { photos: [...PHOTOS, { slot: 2 as const, signedUrl: '  ' }] }));
    const buttons = nodes('Pressable');
    expect(buttons.map((b) => b.accessibilityLabel)).toEqual(['Open job photo 1 of 3', 'Open job photo 2 of 3', 'Open job photo 3 of 3']);
    expect(buttons.every((b) => b.accessibilityRole === 'button')).toBe(true);
    const images = nodes('Image');
    expect(images.map((i) => i.source.uri)).toEqual(SORTED.map((p) => p.signedUrl));
    // The button carries the name; the image inside is not a second screen-reader stop.
    expect(images.every((i) => i.accessible === false && i.contentFit === 'cover')).toBe(true);
    expect(texts()).toContain('Job photos');
    expect(modal()).toBeUndefined();
  });

  it('gives the app\'s press feedback: scale-on-hold and an accent ring, never an opacity change', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    const button = labelled('Open job photo 1 of 3');
    expect(h.pressScale).toBe(0.96);
    expect(button.onPressIn).toBe(h.press.onPressIn);
    expect(button.onPressOut).toBe(h.press.onPressOut);
    expect(ancestors(button)[0]).toBe('MotionView');
    expect(nodes('MotionView')[0].style).toBe(h.press.style);
    const rest = flat(button.style({ pressed: false })), held = flat(button.style({ pressed: true }));
    expect(held.borderColor).toBe(colors.accent);
    expect(rest.borderColor).not.toBe(colors.accent);
    expect(rest.borderWidth).toBe(held.borderWidth);
    expect(rest.opacity).toBeUndefined(); expect(held.opacity).toBeUndefined();
    expect([rest.width, rest.height]).toEqual([104, 104]);
  });

  it('keeps the loading, error and empty states unchanged', async () => {
    const view = await mount(createElement(JobPhotoGallery, { photos: PHOTOS, loading: true }));
    expect(nodes('InlineStatus').map((n) => [n.variant, n.message, n.skeleton])).toEqual([['loading', 'Loading job photos…', 'lines']]);
    await view.render(createElement(JobPhotoGallery, { photos: PHOTOS, error: true }));
    expect(nodes('InlineStatus').map((n) => [n.variant, n.message])).toEqual([['error', 'Job photos are unavailable.']]);
    await view.render(createElement(JobPhotoGallery, { photos: [] }));
    expect(all()).toHaveLength(0);
  });
});

describe('opening and closing the viewer from the gallery', () => {
  it('opens the tapped photo full screen with the same sources, after lightening the status bar', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 2 of 3').onPress());
    expect(modal()).toMatchObject({ visible: true, transparent: true, animationType: 'fade', statusBarTranslucent: true, navigationBarTranslucent: true });
    // Android copies the status-bar look into the Modal window as it opens, so light comes first.
    expect(h.log.slice(0, 2)).toEqual(['status:light', 'mount:Modal']);
    expect(texts()).toContain('2 / 3');
    expect(photo().accessibilityLabel).toBe('Job photo 2 of 3');
    expect(h.announcements).toEqual(['Job photo 2 of 3']);
    const viewed = nodes('Image').filter((i) => i.contentFit === 'contain');
    expect(viewed.map((i) => i.source.uri)).toEqual(SORTED.map((p) => p.signedUrl));
    expect(strip() && transform(strip()).translateX).toBe(-400);
  });

  it('wraps the Modal content in its own gesture root and keeps the photo inside the gesture area', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 1 of 3').onPress());
    const root = nodes('GestureHandlerRootView')[0];
    expect(ancestors(root)).toContain('Modal');
    expect(ancestors(nodes('GestureDetector')[0])).toContain('GestureHandlerRootView');
    expect(ancestors(photo())).toContain('GestureDetector');
    const { pan, tap } = gestures();
    expect(tap.numberOfTaps).toBe(2);
    expect(pan.minDistance).toBe(8);
  });

  it('closes with the Close button and returns the dark status bar', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 3 of 3').onPress());
    const close = labelled('Close photo');
    expect(close.accessibilityRole).toBe('button');
    expect(flat(close.style({ pressed: false }))).toMatchObject({ width: 48, height: 48 });
    expect(flat(close.style({ pressed: true })).backgroundColor).toBe(colors.inverseSurface);
    expect(nodes('AppSymbol')[0].name).toEqual({ android: 'close', ios: 'xmark' });
    await fire(() => close.onPress());
    expect(modal()).toBeUndefined();
    expect(h.log.at(-1)).toBe('status:dark');
    expect(nodes('Pressable').map((b) => b.accessibilityLabel)).toContain('Open job photo 3 of 3');
  });

  it('closes on Android Back (onRequestClose)', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 1 of 3').onPress());
    await fire(() => modal().onRequestClose());
    expect(modal()).toBeUndefined();
  });

  it('closes on a swipe down and lets the photo leave the screen first', async () => {
    await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 1 of 3').onPress());
    await drag(0, 240);
    expect(h.timings).toEqual([{ to: 800, config: { duration: 160, reduceMotion: 'never' } }]);
    expect(modal()).toBeUndefined();
  });

  it('closes when the gallery reloads or errors, and never reopens by itself', async () => {
    const view = await mount(createElement(JobPhotoGallery, { photos: PHOTOS }));
    await fire(() => labelled('Open job photo 2 of 3').onPress());
    await view.render(createElement(JobPhotoGallery, { photos: PHOTOS, loading: true }));
    expect(modal()).toBeUndefined();
    await view.render(createElement(JobPhotoGallery, { photos: PHOTOS }));
    expect(modal()).toBeUndefined();
    await fire(() => labelled('Open job photo 2 of 3').onPress());
    await view.render(createElement(JobPhotoGallery, { photos: PHOTOS, error: true }));
    expect(modal()).toBeUndefined();
    expect(h.log.at(-1)).toBe('status:dark');
  });
});

describe('viewer gestures', () => {
  it('a short swipe down springs back instead of closing', async () => {
    const onClose = vi.fn();
    await viewer({ onClose });
    await drag(0, 60);
    expect(onClose).not.toHaveBeenCalled();
    expect(h.springs.at(-1).to).toBe(0);
    expect(modal()).toBeDefined();
  });

  it('pages to the next photo after a quarter-page drag, updating the counter and the announcement', async () => {
    await viewer();
    const { pan } = gestures();
    await fire(() => {
      pan.onStart({ translationX: -10, translationY: 0, numberOfPointers: 1 });
      pan.onUpdate({ translationX: -150, translationY: 2, numberOfPointers: 1 });
    });
    expect(transform(strip()).translateX).toBe(-140);
    await fire(() => pan.onEnd({ translationX: -150, translationY: 2, velocityX: -200, velocityY: 0 }, true));
    expect(texts()).toContain('2 / 3');
    expect(photo().accessibilityLabel).toBe('Job photo 2 of 3');
    expect(h.announcements).toEqual(['Job photo 1 of 3', 'Job photo 2 of 3']);
    expect(h.springs.at(-1)).toMatchObject({ to: -400, config: { velocity: -200, dampingRatio: 1 } });
  });

  it('stays on the first photo when pulled right, and on a small drag', async () => {
    await viewer();
    await drag(150, 0);
    await drag(-60, 0);
    expect(texts()).toContain('1 / 3');
    expect(h.announcements).toEqual(['Job photo 1 of 3']);
  });

  it('double tap zooms 2x around the tap point, then back to 1x', async () => {
    await viewer();
    const { tap } = gestures();
    await fire(() => tap.onEnd({ x: 300, y: 300 }, true));
    expect(transform(photo())).toEqual({ translateX: -100, translateY: 100, scale: 2 });
    await fire(() => tap.onEnd({ x: 10, y: 10 }, true));
    expect(transform(photo())).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    await fire(() => tap.onEnd({ x: 300, y: 300 }, false));
    expect(transform(photo()).scale).toBe(1);
  });

  it('pinch zooms between 1x and 4x and settles back at 1x', async () => {
    await viewer();
    const { pinch } = gestures();
    await fire(() => { pinch.onStart({ focalX: 200, focalY: 400 }); pinch.onUpdate({ focalX: 200, focalY: 400, scale: 10 }); });
    expect(transform(photo()).scale).toBe(4);
    await fire(() => pinch.onUpdate({ focalX: 200, focalY: 400, scale: 0.1 }));
    expect(transform(photo()).scale).toBe(1);
    await fire(() => { pinch.onEnd({}, true); pinch.onFinalize({}, true); });
    expect(transform(photo())).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });

  it('pans a zoomed photo, clamped to the screen, and never pages or closes while zoomed', async () => {
    const onClose = vi.fn();
    await viewer({ onClose });
    await fire(() => gestures().tap.onEnd({ x: 200, y: 400 }, true));
    await drag(-900, 0, { x: -1500, y: 0 });
    // 400 dp wide at 2x overflows by 400: the photo may move 200 dp each way.
    expect(transform(photo())).toEqual({ translateX: -200, translateY: 0, scale: 2 });
    expect(texts()).toContain('1 / 3');
    expect(transform(strip()).translateX).toBeCloseTo(0);
    expect(h.decays.map((d) => d.clamp)).toEqual([[-200, 200], [-400, 400]]);
    await drag(0, 700);
    expect(onClose).not.toHaveBeenCalled();
    expect(transform(photo()).translateY).toBe(400);
  });

  it('snaps instead of springing under reduced motion, and opens without a fade', async () => {
    h.reduced = true;
    const onClose = vi.fn();
    await viewer({ onClose });
    expect(modal().animationType).toBe('none');
    await fire(() => gestures().tap.onEnd({ x: 300, y: 300 }, true));
    expect(transform(photo()).scale).toBe(2);
    await action('nextPhoto');
    await drag(-150, 0);
    expect(texts()).toContain('3 / 3');
    await drag(0, 240);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.springs).toEqual([]);
    expect(h.timings).toEqual([]);
    expect(h.decays).toEqual([]);
  });
});

describe('viewer accessibility', () => {
  it('names the photo and offers zoom and paging actions instead of gestures', async () => {
    await viewer({ initialIndex: 1 });
    expect(photo()).toMatchObject({ accessibilityRole: 'image', accessibilityLabel: 'Job photo 2 of 3' });
    expect(photo().accessibilityActions).toEqual([
      { name: 'activate', label: 'Zoom in' }, { name: 'zoomIn', label: 'Zoom in' },
      { name: 'nextPhoto', label: 'Next photo' }, { name: 'previousPhoto', label: 'Previous photo' },
    ]);
    // Off-screen photos are hidden from screen readers; the counter repeats the photo's own label.
    const pages = nodes('View').filter((n) => n.importantForAccessibility === 'no-hide-descendants' && n.accessibilityElementsHidden === true);
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });

  it('activate toggles zoom; zoom in and out step it, with an announcement each time', async () => {
    await viewer();
    await action('activate');
    expect(transform(photo()).scale).toBe(2);
    expect(photo().accessibilityActions[0]).toEqual({ name: 'activate', label: 'Zoom out' });
    expect(actionNames()).toEqual(['activate', 'zoomIn', 'zoomOut', 'nextPhoto']);
    await action('zoomIn');
    expect(transform(photo()).scale).toBe(4);
    expect(actionNames()).toEqual(['activate', 'zoomOut', 'nextPhoto']);
    await action('zoomOut');
    await action('zoomOut');
    expect(transform(photo()).scale).toBe(1);
    await action('activate');
    await action('activate');
    expect(h.announcements.slice(1)).toEqual(['Zoomed in, 2x', 'Zoomed in, 4x', 'Zoomed in, 2x', 'Zoomed out', 'Zoomed in, 2x', 'Zoomed out']);
  });

  it('pages with next and previous, resetting zoom, and announces each photo', async () => {
    await viewer();
    await action('activate');
    await action('nextPhoto');
    expect(texts()).toContain('2 / 3');
    expect(transform(photo())).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    await action('nextPhoto');
    expect(actionNames()).not.toContain('nextPhoto');
    await action('previousPhoto');
    expect(photo().accessibilityLabel).toBe('Job photo 2 of 3');
    expect(h.announcements.filter((m) => m.startsWith('Job photo'))).toEqual(['Job photo 1 of 3', 'Job photo 2 of 3', 'Job photo 3 of 3', 'Job photo 2 of 3']);
  });

  it('a single photo has no counter and no paging', async () => {
    await viewer({ photos: [SORTED[0]] });
    expect(texts().some((t) => t.includes(' / '))).toBe(false);
    expect(actionNames()).toEqual(['activate', 'zoomIn']);
    expect(h.announcements).toEqual(['Job photo 1 of 1']);
  });

  it('says so when a photo cannot be shown', async () => {
    await viewer();
    await fire(() => nodes('Image').find((i) => i.source.uri === SORTED[0].signedUrl).onError());
    expect(photo().accessibilityLabel).toBe('Job photo 1 of 3. This photo could not be shown.');
    expect(texts()).toContain('This photo could not be shown.');
  });

  it('clamps an out-of-range start to a real photo', async () => {
    await viewer({ initialIndex: 7 });
    expect(texts()).toContain('3 / 3');
  });
});

describe('viewer source guards', () => {
  const source = readFileSync('src/components/job-photo-viewer.tsx', 'utf8');
  const gallery = readFileSync('src/components/job-photo-gallery.tsx', 'utf8');
  it('keeps worklets free of default parameters and runs no endless animation or spinner', () => {
    const worklets = [...source.matchAll(/function (\w+)\(([^)]*)\)[^{]*\{\s*'worklet';/g)];
    expect(worklets.map((match) => match[1])).toEqual(['settle', 'settleZoom']);
    for (const [, , params] of worklets) expect(params).not.toContain('=');
    expect(source).not.toMatch(/withRepeat|useFrameCallback|setInterval|ActivityIndicator/);
    expect(gallery).not.toMatch(/ActivityIndicator|opacity:/);
    for (const file of [source, gallery]) expect(file).not.toMatch(/allowFontScaling|maxFontSizeMultiplier|elevation:/);
  });
});
