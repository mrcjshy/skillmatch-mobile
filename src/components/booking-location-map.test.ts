// @ts-expect-error -- Node-only component lifecycle harness; native QA verifies MapLibre rendering.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
type Element = { type: any; props: Props };
type Frame = { values: any[]; effects: { deps: any[]; cleanup?: () => void }[]; cursor: number };

/** Runs the actual component and map callback props; framework/native/network boundaries are seams. */
function harness(runtimeAvailable = true) {
  const frames = new Map<any, Frame>();
  let frame: Frame;
  let writes = 0;
  let map: Element | null = null;
  let output: Element;
  let sharingReady = false;
  const pending: (() => void)[] = [];
  const element = (type: any, props: Props) => ({ type, props });
  const effect = (run: () => (() => void) | undefined, deps: any[]) => {
    const owner = frame, index = owner.cursor++, previous = owner.effects[index];
    if (previous && deps.length === previous.deps.length && deps.every((dep, i) => dep === previous.deps[i])) return;
    pending.push(() => { previous?.cleanup?.(); owner.effects[index] = { deps, cleanup: run() }; });
  };
  const modules: Props = {
    react: {
      Component: class {},
      useState: (initial: any) => {
        const owner = frame, index = owner.cursor++;
        if (!(index in owner.values)) owner.values[index] = initial;
        return [owner.values[index], (next: any) => {
          writes++;
          owner.values[index] = typeof next === 'function' ? next(owner.values[index]) : next;
        }];
      },
      useRef: (initial: any) => { const index = frame.cursor++; return frame.values[index] ??= { current: initial }; },
      useEffect: effect,
      useMemo: (run: () => any) => run(),
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Alert: {}, Linking: {}, PixelRatio: { getFontScale: () => 1 }, StyleSheet: { create: (styles: Props) => styles } },
    '@/components/app-button': { AppButton: 'AppButton' },
    '@/components/map-pin-label': { MapPinLabel: 'MapPinLabel' },
    '@/components/share-location-fab': { ShareLocationFab: 'ShareLocationFab' },
    '@/components/refinement-theme': { useUiTheme: () => ({ colors: {}, type: {}, spacing: {} }) },
    '@/hooks/use-location-sharing': { useLocationSharing: (_booking: string, _account: string, ready: boolean) => {
      sharingReady = ready;
      return { shareId: null, state: { status: 'off' }, stop: () => {}, start: () => {} };
    } },
    '@/hooks/use-booking-pins': { useBookingPins: () => ({ now: 0, view: { status: 'ready', counterpart: null } }) },
    '@/lib/native-job-map': { JOB_MAP_STYLE: {}, jobMapRuntime: runtimeAvailable ? { Map: 'NativeMap', Camera: 'NativeCamera', Marker: 'NativeMarker' } : null },
    '@/lib/location-pins': { mergeOverlap: () => [], pinFreshness: () => 'expired' },
    '@/lib/location-map-view': {
      bookingMapMarkers: () => [], frameMarkers: () => ({ center: [121, 14], zoom: 15 }),
      framedMarkers: () => ({}), mapAccessibilityLabel: () => 'Booking map', markerPadding: () => ({}),
      needsReframe: () => false, sharingStatusCopy: () => 'Location sharing is off', workerLocationStatusCopy: () => '',
    },
  };
  const exported: Props = {};
  const source = ts.transpileModule(readFileSync('src/components/booking-location-map.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', source)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected import ${id}`);
    return modules[id];
  }, exported);
  const run = (component: any, props: Props): Element => {
    frame = frames.get(component) ?? { values: [], effects: [], cursor: 0 };
    frames.set(component, frame); frame.cursor = 0;
    return component(props);
  };
  const visit = (node: any): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'NativeMap') map = node;
    visit(node.props?.children);
  };
  const render = () => {
    const role = exported.BookingLocationMap({ role: 'worker', bookingId: 'booking', accountId: 'worker', destination: null,
      insets: { top: 0, bottom: 0 }, renderPanel: () => null });
    const worker = run(role.type, role.props);
    const inline = worker.props.children[0];
    output = run(inline.type, inline.props);
    map = null; visit(output);
    pending.splice(0).forEach(commit => commit());
    return output;
  };
  return {
    render,
    advance: (ms: number) => { vi.advanceTimersByTime(ms); render(); },
    get map() { return map; },
    get output() { return JSON.stringify(output); },
    get ready() { return sharingReady; },
    get writes() { return writes; },
    unmount: () => { frames.forEach(owner => owner.effects.forEach(item => item?.cleanup?.())); },
  };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('confirmed booking map initial render deadline', () => {
  it('shows the existing fallback after twenty seconds without a fully rendered map', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    h.advance(19_999);
    expect(h.map).not.toBeNull(); expect(h.ready).toBe(false);
    h.advance(1);
    expect(h.map).toBeNull(); expect(h.ready).toBe(false);
    expect(h.output).toContain('Map unavailable in this installation.');
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it('cancels the deadline after full render and keeps sharing eligible through later map interaction', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    h.advance(10_000);
    h.map!.props.onDidFinishRenderingMapFully(); h.render();
    expect(h.ready).toBe(true); expect(vi.getTimerCount()).toBe(0);
    h.map!.props.onRegionDidChange(); h.render(); h.advance(60_000);
    expect(h.map).not.toBeNull(); expect(h.ready).toBe(true);
    h.unmount();
  });

  it('settles a timeout even if an already queued full-render callback arrives afterward', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    const loaded = h.map!.props.onDidFinishRenderingMapFully;
    h.advance(20_000); loaded(); h.render();
    expect(h.map).toBeNull(); expect(h.ready).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it('cancels the deadline on native failure and ignores a later full-render callback', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    const callbacks = h.map!.props;
    callbacks.onDidFailLoadingMap(); h.render();
    expect(h.map).toBeNull(); expect(h.ready).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    callbacks.onDidFinishRenderingMapFully(); h.render(); h.advance(20_000);
    expect(h.map).toBeNull(); expect(h.ready).toBe(false);
    h.unmount();
  });

  it('cleans up on unmount and ignores late native callbacks without writing state', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    const callbacks = h.map!.props;
    h.unmount(); const before = h.writes;
    expect(vi.getTimerCount()).toBe(0);
    callbacks.onDidFinishRenderingMapFully(); callbacks.onDidFailLoadingMap(); vi.advanceTimersByTime(20_000);
    expect(h.writes).toBe(before);
  });

  it('does not restart the initial deadline after ordinary rerenders or map pans', () => {
    vi.useFakeTimers(); const h = harness(); h.render();
    h.advance(10_000); h.render(); h.map!.props.onRegionDidChange(); h.render();
    h.advance(9_999); expect(h.map).not.toBeNull();
    h.advance(1); expect(h.map).toBeNull();
    h.unmount();
  });

  it('shows the fallback immediately without scheduling a timer when this installation has no map runtime', () => {
    vi.useFakeTimers(); const h = harness(false); h.render();
    expect(h.map).toBeNull(); expect(h.ready).toBe(false);
    expect(h.output).toContain('Map unavailable in this installation.');
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });
});
