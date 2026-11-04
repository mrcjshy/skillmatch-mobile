// @ts-expect-error -- Node-only composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const read = (p: string) => readFileSync(p, 'utf8');
const jsx = (type: any, props: Props) => ({ type, props });
const all = (n: any): any[] => Array.isArray(n) ? n.flatMap(all) : n?.props ? [n, ...all(n.props.children)] : [];
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s ?? {};
function compile(path: string, seams: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText)((id: string) => {
    if (id === '@/global.css') return {};
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === '@/assets/images/mascot/itik-worker-poses.png') return 'duck-atlas';
    if (id in seams) return seams[id];
    throw Error('Unexpected import: ' + id);
  }, exports);
  return exports;
}
const RN = { View: 'View', Text: 'Text', Image: 'Image', StyleSheet: { create: (s: Props) => s } };
const theme = compile('src/constants/theme.ts', { 'react-native': { Platform: { select: (s: Props) => s.android ?? s.default } } }).SkillMatchTheme.ui;

describe('Itik, the Pateros worker duck', () => {
  it('ships a square nine-cell PNG atlas, independent of a network or archive runtime', () => {
    const png = readFileSync('assets/images/mascot/itik-worker-poses.png');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
    expect(png.readUInt32BE(16) % 3).toBe(0);
    expect(png[25]).toBe(6); // RGBA asset: all nine poses now carry alpha transparency.
    expect(read('src/components/skillmatch-mascot.tsx')).not.toMatch(/https?:|mascot-(empty|success)\.svg/);
  });
  function harness(frame = 0, navigated = true, loaded = true) {
    let focused = true, cursor = 0;
    const slots = [true, loaded];
    let handler!: (s: string) => void;
    let cleanup!: () => void;
    const remove = vi.fn();
    const useDuckMotion = vi.fn(() => ({ pose: frame, style: { transform: [] } }));
    const module = compile('src/components/skillmatch-mascot.tsx', {
      react: { useCallback: (fn: any) => fn, useContext: () => navigated ? { isFocused: () => focused, addListener: () => () => {} } : undefined, useSyncExternalStore: (_subscribe: any, snapshot: any) => snapshot(), useState: () => { const slot = cursor++; return [slots[slot], (v: boolean) => { slots[slot] = v; }]; }, useEffect: (fn: () => () => void) => { cleanup = fn(); } },
      'expo-router/react-navigation': { NavigationContext: {} },
      'react-native': { ...RN, AppState: { currentState: 'active', addEventListener: (_: string, fn: typeof handler) => { handler = fn; return { remove }; } } },
      '@/components/motion': { MotionView: 'MotionView', useDuckMotion },
      '@/components/duck-fx': { DuckFxLayer: 'DuckFx' },
    });
    return { render: (props: Props = {}) => { cursor = 0; return module.SkillMatchMascot(props); }, emit: (s: string) => handler(s), focus: (value: boolean) => { focused = value; }, close: () => cleanup(), remove, useDuckMotion };
  }
  it('clips each expression to one atlas cell inside a fixed stage, with no crossfade', () => {
    for (let frame = 0; frame < 9; frame++) {
      const tree = harness(frame).render({ size: 96 });
      // The stage holds the layout place; effects may draw past it, the sprite never does.
      expect(flat(tree.props.style)).toMatchObject({ width: 96, height: 96, overflow: 'visible' });
      expect(flat(all(tree).find(n => n.type === 'MotionView').props.style)).toMatchObject({ width: 96, height: 96, overflow: 'hidden', transformOrigin: '50% 95.4%' });
      expect(flat(tree.props.style).backgroundColor).toBeUndefined();
      expect(flat(tree.props.style).borderRadius).toBeUndefined();
      const image = all(tree).find(n => n.type === 'Image');
      expect(image.props.source).toBe('duck-atlas');
      expect(image.props.fadeDuration).toBe(0);
      expect(image.props.style).toMatchObject({ width: 288, height: 288, left: -(frame % 3) * 96, top: -Math.floor(frame / 3) * 96 });
    }
  });
  it('is decorative and never captures a tap or duplicates state announcements', () => {
    const tree = harness().render();
    expect(tree.props).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' });
    expect(all(tree).some(n => n.props.accessibilityLabel || n.props.accessibilityRole)).toBe(false);
  });
  it('pauses in background or hidden sheets and removes its AppState listener', () => {
    const h = harness(); h.render({ expression: 'hello' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('hello', true, 96);
    h.emit('background'); h.render();
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('sleep', false, 96);
    h.emit('active'); h.render({ active: false });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('sleep', false, 96);
    h.close(); expect(h.remove).toHaveBeenCalled();
  });
  it('starts the greeting only after its image has loaded so the wing motion can be seen', () => {
    const h = harness(0, true, false); const tree = h.render({ expression: 'hello' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('hello', false, 96);
    all(tree).find(n => n.type === 'Image').props.onLoad();
    h.render({ expression: 'hello' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('hello', true, 96);
  });
  it('pauses retained tabs on blur and is safe outside navigation during bootstrap', () => {
    const h = harness(); h.render({ expression: 'hello' });
    h.focus(false); h.render({ expression: 'hello' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('hello', false, 96);
    h.focus(true); h.render({ expression: 'hello' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('hello', true, 96);
    const bootstrap = harness(4, false); bootstrap.render({ expression: 'think' });
    expect(bootstrap.useDuckMotion).toHaveBeenLastCalledWith('think', true, 96);
  });
  it('maps existing success to celebration and an empty state to sleep', () => {
    const h = harness(); h.render({ pose: 'success' });
    expect(h.useDuckMotion).toHaveBeenLastCalledWith('celebrate', true, 96);
    h.render({ pose: 'empty' }); expect(h.useDuckMotion).toHaveBeenLastCalledWith('sleep', true, 96);
  });
  it('plays the effect layer for the same move, size and pause state as the body', () => {
    const h = harness(); let fx = all(h.render({ expression: 'love', size: 88 })).find(n => n.type === 'DuckFx');
    expect(fx.props).toMatchObject({ expression: 'love', active: true, size: 88 });
    h.emit('background'); fx = all(h.render({ expression: 'love', size: 88 })).find(n => n.type === 'DuckFx');
    expect(fx.props.active).toBe(false);
  });
});

describe('shared empty states', () => {
  const { InlineStatus } = compile('src/components/inline-status.tsx', {
    'react-native': RN, '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/components/skeleton': { Skeleton: 'Skeleton' },
    '@/components/skillmatch-mascot': { SkillMatchMascot: 'Duck' },
    '@/components/refinement-theme': { useUiTheme: () => theme },
  });
  it('uses one duck as the default empty illustration and retains words and recovery action', () => {
    const tree = InlineStatus({ variant: 'empty', message: 'No bookings yet.', action: jsx('Retry', {}) });
    expect(all(tree).filter(n => n.type === 'Duck')).toHaveLength(1);
    expect(all(tree).some(n => n.type === 'Text' && n.props.children === 'No bookings yet.')).toBe(true);
    expect(all(tree).some(n => n.type === 'Retry')).toBe(true);
  });
  it('lets Itik sleep through a default empty state, or take the mood a screen asks for', () => {
    expect(all(InlineStatus({ variant: 'empty', message: 'No bookings yet.' })).find(n => n.type === 'Duck').props.expression).toBe('sleep');
    expect(all(InlineStatus({ variant: 'empty', mascot: 'hello', message: 'You have not posted a job yet.' })).find(n => n.type === 'Duck').props.expression).toBe('hello');
  });
  it('respects supplied artwork or semantic icons without another mascot', () => {
    for (const props of [{ illustration: jsx('Art', {}) }, { icon: { android: 'work' } }]) {
      expect(all(InlineStatus({ variant: 'empty', message: 'Nothing here', ...props })).some(n => n.type === 'Duck')).toBe(false);
    }
  });
  it('preserves skeleton loading and compact error/note semantics', () => {
    expect(InlineStatus({ variant: 'loading', message: 'Loading', skeleton: 'detail' }).props).toMatchObject({ shape: 'detail', label: 'Loading' });
    for (const variant of ['note', 'error']) expect(all(InlineStatus({ variant, message: 'x' })).some(n => n.type === 'Duck')).toBe(false);
    const error = all(InlineStatus({ variant: 'error', message: 'Try again.' })).find(n => n.type === 'Text');
    expect(error.props).toMatchObject({ accessibilityRole: 'alert', accessibilityLiveRegion: 'polite' });
  });
});
