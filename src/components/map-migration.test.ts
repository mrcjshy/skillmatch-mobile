// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { resolve } from 'node:path';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as coordinates from '../lib/map-coordinates';
import * as canonical from '../lib/canonical-job-location';
import * as location from '../lib/job-location';
import { PICKER_MAP_STYLE } from '../lib/picker-map-style';
import * as snap from '../lib/job-location-snap';
import * as permission from '../lib/location-permission';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN as pin } from '../lib/santa-ana-service-area';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

// Source-level event wiring harness. Native modules, React rendering, and the
// operating-system geocoder are mocked; this is explicitly not native proof.
type Props = Record<string, any>;
type Element = { type: string | ((props: Props) => Element); props: Props };
function harness(file: string, nativeAvailable = true, dev = false) {
  const slots: unknown[] = [];
  let cursor = 0;
  const effects: (() => unknown)[] = [];
  const layoutEffects: (() => unknown)[] = [];
  const timers: { callback: () => void; milliseconds: number; cancelled?: boolean }[] = [];
  const userId = '11111111-1111-4111-8111-111111111111';
  const authority: Props = {
    session: { session: { user: { id: userId } }, sessionLifetime: { ownerId: userId, isCurrent: () => true }, sessionRevision: 1, isSessionRevisionCurrent: () => true, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle', subscribeSessionLifecycle: vi.fn(() => () => undefined) },
    account: { account: { id: userId, role: 'client', is_active: true }, status: 'resolved', hasCurrentConsent: true },
  };
  const appState = { currentState: 'active', addEventListener: vi.fn((_event: string, _listener: (state: string) => void) => ({ remove: vi.fn() })) };
  const geocoder = {
    Accuracy: { High: 4 },
    reverseGeocodeAsync: vi.fn().mockResolvedValue([{ formattedAddress: 'Canonical selected address' }]),
    getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
    requestForegroundPermissionsAsync: vi.fn(),
    getCurrentPositionAsync: vi.fn().mockResolvedValue({ coords: pin }),
  };
  const runtime = { Map: 'Map', Camera: 'Camera', Marker: 'Marker', ViewAnnotation: 'ViewAnnotation' };
  const jsx = (type: Element['type'], props: Props) => ({ type, props });
  const ui = { colors: {}, type: {}, spacing: { sm: 8, md: 16, gutter: 20 }, radius: {}, size: {} };
  const modules: Record<string, unknown> = {
    react: {
      Component: class {},
      useState(initial: unknown) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (value: unknown) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
      },
      useRef(initial: unknown) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
      useCallback(callback: unknown, dependencies: unknown[]) {
        const slot = cursor++;
        const previous = slots[slot] as { dependencies: unknown[]; callback: unknown } | undefined;
        if (!previous || dependencies.some((value, index) => value !== previous.dependencies[index])) slots[slot] = { dependencies, callback };
        return (slots[slot] as { callback: unknown }).callback;
      },
      useEffect(effect: () => unknown, dependencies?: unknown[]) {
        const slot = cursor++;
        const previous = slots[slot] as { dependencies?: unknown[]; cleanup?: () => void } | undefined;
        if (!previous || !dependencies || dependencies.some((value, index) => value !== previous.dependencies?.[index])) {
          const current = { dependencies, cleanup: undefined as (() => void) | undefined };
          slots[slot] = current;
          effects.push(() => { previous?.cleanup?.(); current.cleanup = effect() as (() => void) | undefined; });
        }
      },
      useLayoutEffect(effect: () => unknown) { layoutEffects.push(effect); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Keyboard: { dismiss: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) }, AppState: appState, Linking: { openSettings: vi.fn().mockResolvedValue(undefined) }, View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', useWindowDimensions: () => ({ width: 400, height: 900 }), StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 } },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => false },
    tamagui: { Text: 'Text', YStack: 'YStack' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '@/constants/theme': { SkillMatchTheme: { ui, border: {}, surface: {}, text: {}, feedback: {} } },
    '@/lib/native-job-map': { jobMapRuntime: nativeAvailable ? runtime : null, JOB_MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty' },
    '@/lib/picker-map-style': { PICKER_MAP_STYLE },
    '@/lib/map-coordinates': coordinates,
    '@/lib/canonical-job-location': canonical,
    '@/lib/job-location': location,
    '@/lib/job-location-snap': snap,
    '@/lib/location-permission': permission,
    '@/lib/location-search': { LOCATION_SEARCH_DEBOUNCE_MS: 400, LOCATION_SEARCH_MIN_LENGTH: 3, searchPhoton: vi.fn() },
    '@/lib/recent-locations': { loadRecentLocations: vi.fn().mockResolvedValue([]), clearRecentLocations: vi.fn().mockResolvedValue(undefined) },
    '@/providers/session-provider': { useSession: () => authority.session },
    '@/providers/account-provider': { useAccount: () => authority.account },
    '@/lib/bookings': { formatLocation: () => 'Santa Ana, Pateros' },
    '@/components/app-button': { AppButton: 'AppButton' },
    '@/components/map-pin-label': { MapPinLabel: 'MapPinLabel' },
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/components/app-notice': { AppNotice: 'AppNotice' },
    '@/components/worker-job-location-map': { WorkerJobLocationMapLibre: 'WorkerMap' },
    '@maplibre/maplibre-react-native': runtime,
    'expo-location': geocoder,
    'expo-linking': { openURL: vi.fn() },
  };
  const exports: Props = {};
  const compiled = ts.transpileModule(readFileSync(resolve('src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, { exports, AbortController, setTimeout: (callback: () => void, milliseconds: number) => { const timer = { callback, milliseconds }; timers.push(timer); return timer; }, clearTimeout: (timer: { cancelled?: boolean }) => { if (timer) timer.cancelled = true; }, __DEV__: dev, require: (name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => (modules['@/constants/theme'] as { SkillMatchTheme: { ui: unknown } }).SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
    if (!nativeAvailable && name === '@maplibre/maplibre-react-native') throw new Error('Native module unavailable');
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  } });
  return { exports, geocoder, effects, appState, modules, authority, flushEffects: () => { effects.splice(0).forEach(effect => effect()); }, runMapTimers: () => { timers.filter(timer => timer.milliseconds === 20000 && !timer.cancelled).forEach(timer => timer.callback()); }, runSearchTimers: () => { timers.splice(0).filter(timer => timer.milliseconds === 400 && !timer.cancelled).forEach(timer => timer.callback()); }, render: (component: (props: Props) => Element, props: Props) => { cursor = 0; const tree = component(props); layoutEffects.splice(0).forEach(effect => effect()); return tree; } };
}

function all(tree: Element | null, predicate: (node: Element) => boolean): Element[] {
  if (!tree || typeof tree !== 'object') return [];
  const children = [tree.props?.children].flat(Infinity) as Element[];
  return [...(predicate(tree) ? [tree] : []), ...children.flatMap(child => all(child, predicate))];
}
const byType = (tree: Element, type: string) => all(tree, n => n.type === type)[0];
function openSearch(render: () => Element): Element {
  const button = all(render(), n => n.props.accessibilityLabel === 'Search locations')[0];
  if (button) button.props.onPress();
  return byType(render(), 'TextInput');
}
const confirmButton = (tree: Element) => all(tree, n => n.type === 'AppButton' && /^(Choose this location|Confirm location)$/.test(n.props.label))[0];
const region = (center: { longitude: number; latitude: number }, userInteraction = true, zoom = 14) => ({
  nativeEvent: { center: [center.longitude, center.latitude], userInteraction, zoom },
});

describe('migrated map source event contracts', () => {
  it('ignores a pin-tip projection from an older drag after the next gesture settles', async () => {
    const h = harness('components/job-location-picker.tsx');
    const next = { ...pin, longitude: pin.longitude + .0003 };
    let reply!: (coordinate: number[]) => void;
    const unproject = vi.fn().mockImplementationOnce(() => new Promise(resolve => { reply = resolve; })).mockResolvedValue([next.longitude, next.latitude]);
    const onConfirm = vi.fn(), easeTo = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = { unproject, project: async () => [200, 323], queryRenderedFeatures: async () => [] };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    byType(render(), 'Map').props.onRegionWillChange(region(next, true, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(next, true, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    reply([pin.longitude, pin.latitude]);
    await Promise.resolve(); await Promise.resolve();
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin: next, address: 'Canonical selected address' });
    expect(easeTo).not.toHaveBeenCalled();
  });
  it.each(['search', 'recent'])('keeps an explicit %s coordinate despite a nearby automatic target and native rounding', async origin => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + .0001 };
    const onConfirm = vi.fn(), easeTo = vi.fn();
    (h.modules['@/lib/recent-locations'] as Props).loadRecentLocations.mockResolvedValue([{ pin, address: 'Chosen public place', timestamp: Date.now() }]);
    (h.modules['@/lib/location-search'] as Props).searchPhoton.mockResolvedValue([{ pin, label: 'Chosen public place' }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = {
      project: async ([lng, lat]: number[]) => [200 + (lng - pin.longitude) * 100000, 200 + (lat - pin.latitude) * 100000],
      queryRenderedFeatures: async () => [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Other public landmark' } }],
    };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    render(); h.flushEffects();
    openSearch(render).props.onChangeText('Chosen public');
    render(); h.flushEffects(); h.runSearchTimers();
    const label = origin === 'search' ? 'Search result Chosen public place' : 'Recent location Chosen public place';
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === label)).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === label)[0].props.onPress();
    byType(render(), 'Map').props.onRegionDidChange(region({ ...pin, longitude: pin.longitude + 1e-9 }, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    byType(render(), 'Map').props.onRegionDidChange(region(target, true, 16.6));
    expect(easeTo).toHaveBeenCalledTimes(1);
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: 'Canonical selected address' });
  });
  it('captures the raw coordinate beneath the actual padded pin tip before choosing or geocoding', async () => {
    const h = harness('components/job-location-picker.tsx');
    const actual = { ...pin, longitude: pin.longitude + .0001 };
    const onConfirm = vi.fn(), unproject = vi.fn().mockResolvedValue([actual.longitude, actual.latitude]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = { unproject, project: async () => [200, 323], queryRenderedFeatures: async () => [] };
    byType(render(), 'Camera').props.ref.current = { easeTo: vi.fn() };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(unproject).toHaveBeenCalledWith([200, 323]);
    expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(actual);
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledWith({ pin: actual, address: 'Canonical selected address' });
  });
  it.each([false, true])('automatically moves to and confirms a named POI after drag release without a row tap (reduced motion: %s)', async reduced => {
    const h = harness('components/job-location-picker.tsx');
    (h.modules['@/hooks/use-reduced-motion'] as { useReducedMotion: () => boolean }).useReducedMotion = () => reduced;
    const target = { ...pin, longitude: pin.longitude + .0002 };
    const easeTo = vi.fn(), onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = {
      project: async ([longitude, latitude]: number[]) => [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000],
      queryRenderedFeatures: async () => [{ id: 99, geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Public hall' } }],
    };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    h.flushEffects();
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, 16.6));
    expect(easeTo).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [target.longitude, target.latitude], duration: reduced ? 0 : 200 })));
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.props.children === 'Public hall')).toHaveLength(2);
    expect(all(render(), n => n.props.message === 'Adjusted to Public hall')).toHaveLength(1);
    expect(onConfirm).not.toHaveBeenCalled();
    // Duplicate idle callbacks (even one retaining the last gesture flag) are
    // not a new deliberate move and cannot overwrite the raw point or resnap.
    byType(render(), 'Map').props.onRegionDidChange(region(target, true, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(easeTo).toHaveBeenCalledTimes(1);
    all(render(), n => n.props.label === 'Use exact pin instead')[0].props.onPress();
    expect(easeTo.mock.calls.at(-1)?.[0].center).toEqual([pin.longitude, pin.latitude]);
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const change = h.appState.addEventListener.mock.calls[0][1];
    change('background'); change('active');
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(easeTo).toHaveBeenCalledTimes(2);
    // A new actual gesture renews assisted selection after the exact override.
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, 16.6));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledTimes(3));
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin: target, address: 'Canonical selected address' });
    expect(onConfirm.mock.calls[0][0].pin).not.toEqual(pin);
  });
  it('hides mapped context immediately when the authenticated lifetime changes before cleanup effects', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + .0005 };
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    byType(render(), 'Map').props.ref.current = {
      project: async ([longitude, latitude]: number[]) => [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000],
      queryRenderedFeatures: async () => [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Prior selection landmark' } }],
    };
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Prior selection landmark')).toHaveLength(1));
    h.authority.session = { ...h.authority.session, sessionLifetime: { ownerId: h.authority.session.session.user.id, isCurrent: () => true }, sessionRevision: 2 };
    expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Prior selection landmark')).toHaveLength(0);
    expect(all(render(), n => n.props.children === 'Near Prior selection landmark')).toHaveLength(0);
    expect(all(render(), n => n.type === 'Marker')).toHaveLength(0);
  });
  it('selects a named place already beneath the pin without waiting for a nonexistent camera event', async () => {
    const h = harness('components/job-location-picker.tsx');
    const feature = { id: 23, geometry: { type: 'Point', coordinates: [pin.longitude, pin.latitude] }, properties: { name: 'Public court' } };
    const queryRenderedFeatures = vi.fn().mockResolvedValue([feature]);
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = { project: async () => [200, 200], queryRenderedFeatures };
    byType(render(), 'Camera').props.ref.current = { easeTo: vi.fn() };
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Public court')).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === 'Move map to Public court')[0].props.onPress();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.props.children === 'Public court')).toHaveLength(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'])('keeps the selected mapped identity on %s and foreground retry, then rejects it after a new pan', async outcome => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + .0005 };
    const feature = { id: 22, geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Public clinic', class: 'hospital' } };
    const queryRenderedFeatures = vi.fn().mockResolvedValue([feature]);
    const project = async ([longitude, latitude]: number[]) => [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000];
    const easeTo = vi.fn(), onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = { project, queryRenderedFeatures };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    h.flushEffects();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Public clinic')).toHaveLength(1));
    const staleRow = all(render(), n => n.props.accessibilityLabel === 'Move map to Public clinic')[0];
    const marker = all(render(), n => n.type === 'Marker')[0];
    expect(marker?.props.lngLat).toEqual([target.longitude, target.latitude]);
    const markerControl = all(marker, n => n.type === 'Pressable' && n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Mapped place Public clinic')[0];
    expect(markerControl).toBeDefined();
    if (outcome === 'failure') h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Unavailable'));
    markerControl.props.onPress();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.props.children === 'Public clinic')).toHaveLength(2);
    const change = h.appState.addEventListener.mock.calls[0][1];
    change('background'); change('active');
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.props.children === 'Public clinic')).toHaveLength(2);
    expect(onConfirm).not.toHaveBeenCalled();
    const exact = all(render(), n => n.props.label === 'Use exact pin instead')[0];
    expect(exact).toBeDefined(); exact.props.onPress();
    expect(easeTo.mock.calls.at(-1)?.[0].center).toEqual([pin.longitude, pin.latitude]);
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, 16.6));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: outcome === 'failure' ? canonical.JOB_LOCATION_DISPLAY_FALLBACK : 'Canonical selected address' });
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, 16.6));
    const moves = easeTo.mock.calls.length;
    staleRow.props.onPress();
    expect(easeTo).toHaveBeenCalledTimes(moves);
    expect(all(render(), n => String(n.props.children).includes('Public clinic'))).toHaveLength(0);
  });
  it('resolves the address independently, labels a manual point Near a bounded landmark, and clears it on the next pan', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + .0005 };
    let reply!: (features: unknown[]) => void;
    const queryRenderedFeatures = vi.fn().mockImplementationOnce(() => new Promise(resolve => { reply = resolve; })).mockResolvedValue([]);
    const project = async ([longitude, latitude]: number[]) => [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000];
    const easeTo = vi.fn(), onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    byType(render(), 'Map').props.ref.current = { project, queryRenderedFeatures };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 16.6));
    await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin), { timeout: 300 });
    expect(confirmButton(render()).props.disabled).toBe(true);
    reply([{ id: 21, geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Public school', class: 'school' } }]);
    await vi.waitFor(() => expect(all(render(), n => n.props.children === 'Near Public school')).toHaveLength(2));
    expect(all(render(), n => n.props.children === 'Your map point, not the place entrance.')).toHaveLength(1);
    expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Public school')).toHaveLength(1);
    expect(easeTo).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: 'Canonical selected address' });
    byType(render(), 'Map').props.onRegionWillChange(region(target, true, 16.6));
    expect(all(render(), n => n.props.children === 'Near Public school')).toHaveLength(0);
    expect(confirmButton(render()).props.disabled).toBe(true);
  });
  it('confirms an honest manual fallback when optional native context never answers and rejects its late snap', async () => {
    vi.useFakeTimers();
    try {
      const h = harness('components/job-location-picker.tsx');
      let reply!: (features: unknown[]) => void;
      h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Geocoder unavailable'));
      const onConfirm = vi.fn(), easeTo = vi.fn();
      const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
      byType(render(), 'Map').props.ref.current = { project: async ([lng, lat]: number[]) => [200 + (lng - pin.longitude) * 100000, 200 + (lat - pin.latitude) * 100000], queryRenderedFeatures: () => new Promise(resolve => { reply = resolve; }) };
      byType(render(), 'Camera').props.ref.current = { easeTo };
      byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 17));
      await vi.advanceTimersByTimeAsync(1000);
      expect(confirmButton(render()).props.disabled).toBe(false);
      confirmButton(render()).props.onPress();
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: canonical.JOB_LOCATION_DISPLAY_FALLBACK });
      reply([{ geometry: { type: 'Point', coordinates: [pin.longitude + .00003, pin.latitude] }, properties: { name: 'Late public hall' } }]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(easeTo).not.toHaveBeenCalled();
      expect(all(render(), n => String(n.props.children).includes('Late public hall'))).toHaveLength(0);
      expect(confirmButton(render()).props.disabled).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('settles the manual pin after foreground recovery invalidates an unfinished feature query', async () => {
    const h = harness('components/job-location-picker.tsx');
    let reply!: (features: unknown[]) => void;
    const queryRenderedFeatures = vi.fn(() => new Promise(resolve => { reply = resolve; }));
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    byType(render(), 'Map').props.ref.current = { project: async () => [200, 200], queryRenderedFeatures };
    h.flushEffects();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, 17));
    await vi.waitFor(() => expect(queryRenderedFeatures).toHaveBeenCalledOnce());
    const change = h.appState.addEventListener.mock.calls[0][1];
    change('background'); change('active');
    reply([]);
    await vi.waitFor(() => expect(all(render(), n => n.props.children === 'Canonical selected address').length).toBeGreaterThan(0));
    expect(confirmButton(render()).props.disabled).toBe(false);
  });
  it('retains the first native rendered frame even when map-completion events are delayed', () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    byType(render(), 'Map').props.onDidFinishRenderingFrame?.();
    render(); h.flushEffects(); h.runMapTimers();
    expect(all(render(), n => n.type === 'Map')).toHaveLength(1);
  });
  it.each(['success', 'failure'])('makes a reopened draft pin confirmable after reverse-geocode %s without a new pan', async outcome => {
    const h = harness('components/job-location-picker.tsx');
    if (outcome === 'failure') h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Network unavailable'));
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin, initialAddress: 'Previously confirmed address', note: null, onNote: vi.fn(), onConfirm });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(h.geocoder.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: outcome === 'success' ? 'Canonical selected address' : 'Selected Job location — Santa Ana, Pateros' });
  });

  it('does not revive an opening draft pin after its authenticated owner changes', async () => {
    const h = harness('components/job-location-picker.tsx');
    let finish!: (value: unknown) => void;
    h.geocoder.reverseGeocodeAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const render = () => h.render(h.exports.JobLocationPicker, { pin, initialAddress: 'Private opening address', note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const nextId = '22222222-2222-4222-8222-222222222222';
    h.authority.session = { ...h.authority.session, session: { user: { id: nextId } }, sessionLifetime: { ownerId: nextId, isCurrent: () => true }, sessionRevision: 2 };
    h.authority.account = { ...h.authority.account, account: { id: nextId, role: 'client', is_active: true } };
    render(); h.flushEffects();
    finish([{ formattedAddress: 'Obsolete address' }]);
    await Promise.resolve(); await Promise.resolve();
    expect(confirmButton(render()).props.disabled).toBe(true);
    expect(all(render(), n => n.props.children === 'Obsolete address' || n.props.children === 'Private opening address')).toHaveLength(0);
  });
  it('keeps a rendered map mounted while remaining tiles finish loading', () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    byType(render(), 'Map').props.onDidFinishRenderingMap();
    render(); h.flushEffects(); h.runMapTimers();
    expect(all(render(), n => n.type === 'Map')).toHaveLength(1);
    byType(render(), 'Map').props.onDidFailLoadingMap();
    expect(all(render(), n => n.props.accessibilityLabel === 'Job location map unavailable')).toHaveLength(1);
  });

  it('anchors the fixed pin tip to the actual camera center', () => {
    const h = harness('components/job-location-picker.tsx');
    const tree = h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const overlay = all(tree, n => n.props.testID === 'service-location-center-pin')[0];
    const tip = (overlay.props.children as Element[])[1].props.style;
    const offset = overlay.props.style.transform.find((entry: Props) => 'translateY' in entry).translateY;
    expect(Math.abs(offset + tip.top + tip.height / 2 + tip.height / Math.sqrt(2))).toBeLessThan(1);
  });
  it('keeps the map beneath the full screen rather than shrinking it around the sheet', () => {
    const h = harness('components/job-location-picker.tsx');
    const tree = h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const frame = all(tree, n => [n.props.children].flat().some(child => child?.type === 'Map'))[0];
    expect(frame.props.style.position).toBe('absolute');
    expect(frame.props.style.bottom).toBe(0);
  });

  it('does not announce the decorative fixed center pin as a second destination', () => {
    const h = harness('components/job-location-picker.tsx');
    const tree = h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    expect(all(tree, n => n.props.accessibilityLabel === 'Center service location pin')).toHaveLength(0);
    expect(all(tree, n => n.props.accessibilityLabel === 'Selected location address')).toHaveLength(1);
  });

  it('labels a failed reverse lookup as a general area while confirming the actual pin', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Network unavailable'));
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    render(); h.flushEffects();
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'General area')).toHaveLength(1);
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: canonical.JOB_LOCATION_DISPLAY_FALLBACK });
  });

  it.each(['denied', 'granted'])('retains the explicit %s permission response across the Android dialog lifecycle', async outcome => {
    const h = harness('components/job-location-picker.tsx');
    let change!: (state: string) => void;
    h.appState.addEventListener.mockImplementation((_event, listener) => { change = listener; return { remove: vi.fn() }; });
    let finish!: (value: unknown) => void;
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true }).mockResolvedValue({ status: outcome, canAskAgain: true });
    h.geocoder.requestForegroundPermissionsAsync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let note: string | null = null;
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note, onNote: (value: string | null) => { note = value; }, onConfirm: vi.fn() });
    render(); h.flushEffects();
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    h.appState.currentState = 'background'; change('background');
    h.appState.currentState = 'active'; change('active');
    finish({ status: outcome, canAskAgain: true });
    if (outcome === 'denied') {
      await vi.waitFor(() => expect(note).toBe(location.COPY.permissionDenied));
      expect(h.geocoder.getCurrentPositionAsync).not.toHaveBeenCalled();
    } else {
      await vi.waitFor(() => expect(easeTo).toHaveBeenCalled());
      expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalledOnce();
    }
  });

  it.each(['recent', 'current'])('keeps an identical %s destination confirmable without a native camera event', async action => {
    const h = harness('components/job-location-picker.tsx');
    (h.modules['@/lib/recent-locations'] as Props).loadRecentLocations.mockResolvedValue([{ pin, address: 'Saved synthetic place', timestamp: 1 }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    if (action === 'recent') {
    openSearch(render);
      await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Saved synthetic place')).toHaveLength(1));
      all(render(), n => n.props.accessibilityLabel === 'Recent location Saved synthetic place')[0].props.onPress();
    } else {
      all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
      await vi.waitFor(() => expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalled());
    }
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalled());
    expect(confirmButton(render()).props.disabled).toBe(false);
  });

  it('shows a recoverable denial and keeps manual pin confirmation available', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    h.geocoder.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    let note: string | null = null;
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note, onNote: (value: string | null) => { note = value; }, onConfirm: vi.fn() });
    render(); h.flushEffects();
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(note).toBe(location.COPY.permissionDenied));
    expect(all(render(), n => n.type === 'AppNotice' && n.props.message === location.COPY.permissionDenied)).toHaveLength(1);
    expect(h.geocoder.getCurrentPositionAsync).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
  });

  it('acquires foreground position after an explicit grant and moves the camera without confirming', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true }).mockResolvedValue({ status: 'granted' });
    h.geocoder.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    h.flushEffects();
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 }));
    expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: h.geocoder.Accuracy.High });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('recovers from an unavailable permission API without locking manual map selection', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockRejectedValue(new Error('Permission API unavailable'));
    let note: string | null = null;
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note, onNote: (value: string | null) => { note = value; }, onConfirm: vi.fn() });
    render(); h.flushEffects();
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(note).toBe(location.COPY.locationUnavailable));
    expect(all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.disabled).toBe(false);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
  });
  it.each([
    ['cross-account', 'success'], ['cross-account', 'failure'],
    ['new-lifetime', 'success'], ['new-lifetime', 'failure'],
    ['sign-out-relogin', 'success'], ['sign-out-relogin', 'failure'],
  ])('keeps prior search input/request private after %s and late %s, while successor search works', async (replacement, outcome) => {
    const h = harness('components/job-location-picker.tsx');
    const search = (h.modules['@/lib/location-search'] as Props).searchPhoton;
    let finish!: () => void;
    search.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = () => outcome === 'success' ? resolve([{ label: 'Prior owner result', pin }]) : reject(new Error('Prior owner failure')); }));
    search.mockResolvedValue([{ label: 'Successor result', pin }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    openSearch(render).props.onChangeText('Private account A destination');
    render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const originalSession = h.authority.session;
    if (replacement === 'sign-out-relogin') {
      h.authority.session = { ...originalSession, session: null, sessionLifetime: null, sessionRevision: 2 };
      h.authority.account = { ...h.authority.account, account: null, status: 'idle' };
      expect(openSearch(render).props.value).toBe('');
      h.flushEffects();
    }
    const nextId = replacement === 'cross-account' ? '22222222-2222-4222-8222-222222222222' : originalSession.session.user.id;
    h.authority.session = { ...originalSession, session: { user: { id: nextId } }, sessionLifetime: { ownerId: nextId, isCurrent: () => true }, sessionRevision: replacement === 'sign-out-relogin' ? 3 : 2 };
    h.authority.account = { ...h.authority.account, account: { id: nextId, role: 'client', is_active: true }, status: 'resolved' };
    const transitionedInput = openSearch(render);
    h.flushEffects(); h.runSearchTimers();
    await Promise.resolve(); await Promise.resolve();
    expect(search).toHaveBeenCalledTimes(1);
    expect(transitionedInput.props.value).toBe('');
    expect(openSearch(render).props.value).toBe('');
    finish(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(all(render(), n => n.props.accessibilityLabel === 'Search result Prior owner result')).toHaveLength(0);
    expect(all(render(), n => n.props.label === 'Retry search')).toHaveLength(0);
    openSearch(render).props.onChangeText('Successor destination');
    render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Search result Successor result')).toHaveLength(1));
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1][0]).toBe('Successor destination');
    expect(openSearch(render).props.value).toBe('Successor destination');
  });
  it.each(['cross-account', 'new-lifetime', 'later-pin', 'away-and-back'])('never revives a retained Choose after %s and lets the current action confirm', async replacement => {
    const h = harness('components/job-location-picker.tsx');
    const onConfirmA = vi.fn();
    const onConfirmB = vi.fn();
    let props = { pin: null, note: null, onNote: vi.fn(), onConfirm: onConfirmA };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    render(); h.flushEffects();
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const oldChoose = confirmButton(render());
    props = { ...props, onConfirm: onConfirmB };
    if (replacement === 'cross-account' || replacement === 'new-lifetime') {
      const nextId = replacement === 'cross-account' ? '22222222-2222-4222-8222-222222222222' : h.authority.session.session.user.id;
      h.authority.session = { ...h.authority.session, session: { user: { id: nextId } }, sessionLifetime: { ownerId: nextId, isCurrent: () => true }, sessionRevision: 2 };
      h.authority.account = { ...h.authority.account, account: { id: nextId, role: 'client', is_active: true } };
    }
    render(); h.flushEffects();
    const nextPin = { ...pin, longitude: pin.longitude + 0.0003 };
    byType(render(), 'Map').props.onRegionWillChange(region(nextPin));
    byType(render(), 'Map').props.onRegionDidChange(region(nextPin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    let expectedPin = nextPin;
    if (replacement === 'away-and-back') {
      byType(render(), 'Map').props.onRegionWillChange(region(pin));
      byType(render(), 'Map').props.onRegionDidChange(region(pin));
      await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
      expectedPin = pin;
    }
    oldChoose.props.onPress();
    expect(onConfirmA).not.toHaveBeenCalled();
    expect(onConfirmB).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(onConfirmB).toHaveBeenCalledExactlyOnceWith({ pin: expectedPin, address: 'Canonical selected address' });
  });
  it.each(['success', 'failure'])('ignores an obsolete search %s after query replacement or shortening', async outcome => {
    const h = harness('components/job-location-picker.tsx');
    const search = (h.modules['@/lib/location-search'] as Props).searchPhoton;
    let finish!: () => void;
    search.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = () => outcome === 'success' ? resolve([{ label: 'Obsolete', pin }]) : reject(new Error('Obsolete failure')); }));
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    openSearch(render).props.onChangeText('first'); render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    openSearch(render).props.onChangeText('ab'); render();
    finish(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(all(render(), n => n.props.accessibilityLabel === 'Search result Obsolete')).toHaveLength(0);
    expect(all(render(), n => n.props.label === 'Retry search')).toHaveLength(0);
    expect(all(render(), n => n.props.accessibilityLabel === 'Searching locations')).toHaveLength(0);
  });

  it('hides suggestions and rejects old search row callbacks when authenticated authority changes', async () => {
    const h = harness('components/job-location-picker.tsx');
    (h.modules['@/lib/location-search'] as Props).searchPhoton.mockResolvedValueOnce([{ label: 'Account A query result', pin }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    openSearch(render).props.onChangeText('first'); render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Search result Account A query result')).toHaveLength(1));
    const oldRow = all(render(), n => n.props.accessibilityLabel === 'Search result Account A query result')[0];
    h.authority.session = { ...h.authority.session, sessionLifetime: { ownerId: h.authority.session.session.user.id, isCurrent: () => true }, sessionRevision: 2 };
    expect(all(render(), n => n.props.accessibilityLabel === 'Search result Account A query result')).toHaveLength(0);
    h.flushEffects();
    oldRow.props.onPress();
    expect(easeTo).not.toHaveBeenCalled();
  });
  it('rejects account A loads and captured Clear callbacks after switching to account B', async () => {
    const h = harness('components/job-location-picker.tsx');
    const storage = h.modules['@/lib/recent-locations'] as Props;
    storage.loadRecentLocations.mockResolvedValueOnce([{ pin, address: 'Account A destination', timestamp: Date.now() }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    openSearch(render);
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Account A destination')).toHaveLength(1));
    const oldClear = all(render(), n => n.props.accessibilityLabel === 'Clear recent locations')[0];
    const bId = '22222222-2222-4222-8222-222222222222';
    h.authority.session = { ...h.authority.session, session: { user: { id: bId } }, sessionLifetime: { ownerId: bId, isCurrent: () => true }, sessionRevision: 2 };
    h.authority.account = { ...h.authority.account, account: { id: bId, role: 'client', is_active: true } };
    expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Account A destination')).toHaveLength(0);
    h.flushEffects();
    oldClear.props.onPress();
    expect(storage.clearRecentLocations).not.toHaveBeenCalled();
    expect(storage.loadRecentLocations.mock.calls.at(-1)[0].userId).toBe(bId);
  });
  it('opens without foreground permission or GPS and requests only on explicit Use My Location', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    h.geocoder.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    expect(h.geocoder.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.getCurrentPositionAsync).not.toHaveBeenCalled();
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(h.geocoder.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1));
    expect(h.geocoder.getCurrentPositionAsync).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
  });

  it('hides recents immediately on Clear, reports deletion failure and supports owner-scoped retry', async () => {
    const h = harness('components/job-location-picker.tsx');
    const storage = h.modules['@/lib/recent-locations'] as Props;
    storage.loadRecentLocations.mockResolvedValueOnce([{ pin, address: 'Saved destination', timestamp: Date.now() }]);
    storage.clearRecentLocations.mockRejectedValueOnce(new Error('Deletion unavailable'));
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    openSearch(render);
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Saved destination')).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === 'Clear recent locations')[0].props.onPress();
    expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Saved destination')).toHaveLength(0);
    await vi.waitFor(() => expect(all(render(), n => n.props.message === "Couldn't clear saved recents. Try again.")).toHaveLength(1));
    all(render(), n => n.props.label === 'Retry clear')[0].props.onPress();
    await Promise.resolve();
    expect(storage.clearRecentLocations).toHaveBeenCalledTimes(2);
    expect(storage.clearRecentLocations.mock.calls[0][0].userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(all(render(), n => n.props.message === "Couldn't clear saved recents. Try again.")).toHaveLength(0);
  });

  it('selects a recent pin through fresh geocoding without treating its saved label as canonical', async () => {
    const h = harness('components/job-location-picker.tsx');
    (h.modules['@/lib/recent-locations'] as Props).loadRecentLocations.mockResolvedValueOnce([{ pin, address: 'Old street', timestamp: Date.now() }]);
    h.geocoder.reverseGeocodeAsync.mockRejectedValueOnce(new Error('Unavailable'));
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    h.flushEffects();
    openSearch(render);
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Old street')).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === 'Recent location Old street')[0].props.onPress();
    expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 });
    expect(props.onConfirm).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Selected Job location — Santa Ana, Pateros' });
  });

  it('does not let an old ready selection confirm after account replacement before effects', async () => {
    const h = harness('components/job-location-picker.tsx');
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const oldChoose = confirmButton(render());
    h.authority.session = { ...h.authority.session, sessionLifetime: { ownerId: h.authority.session.session.user.id, isCurrent: () => true }, sessionRevision: 2 };
    render();
    oldChoose.props.onPress();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it('rejects a delayed GPS success after the Client lifetime changes before effects run', async () => {
    const h = harness('components/job-location-picker.tsx');
    let finish!: (value: { coords: typeof pin }) => void;
    h.geocoder.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    h.authority.session = { ...h.authority.session, sessionLifetime: { ownerId: h.authority.session.session.user.id, isCurrent: () => true }, sessionRevision: 2 };
    render();
    finish({ coords: pin });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(easeTo).not.toHaveBeenCalled();
  });
  it('discloses current eligible exact access only while the Worker opportunity location exists', () => {
    const h = harness('components/job-location-map.tsx');
    const props = { location: { pin, address: 'Authorized', barangay: 'Santa Ana', city: 'Pateros' } };
    const copy = 'You can see this exact location because you currently qualify. Access may end if your eligibility changes.';
    expect(all(h.render(h.exports.WorkerOpportunityJobLocation, props), n => n.props.children === copy)).toHaveLength(1);
    expect(all(h.render(h.exports.WorkerOpportunityJobLocation, { location: null }), n => n.props.children === copy)).toHaveLength(0);
  });
  it('rejects an account A recent load after A logs in again under a new lifetime', async () => {
    const h = harness('components/job-location-picker.tsx');
    const storage = h.modules['@/lib/recent-locations'] as Props;
    let finish!: (rows: unknown[]) => void;
    storage.loadRecentLocations.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const oldScope = storage.loadRecentLocations.mock.calls[0][0];
    expect(oldScope?.userId).toBe('11111111-1111-4111-8111-111111111111');
    expect(oldScope.isCurrent()).toBe(true);
    h.authority.session = { ...h.authority.session, sessionLifetime: { ownerId: h.authority.session.session.user.id, isCurrent: () => true }, sessionRevision: 2 };
    render(); h.flushEffects();
    finish([{ pin, address: 'Old lifetime destination', timestamp: Date.now() }]);
    await Promise.resolve(); await Promise.resolve();
    expect(oldScope.isCurrent()).toBe(false);
    expect(all(render(), n => n.props.accessibilityLabel === 'Recent location Old lifetime destination')).toHaveLength(0);
  });
  it('clears old suggestions immediately and retries unavailable search without altering the confirmed candidate', async () => {
    const h = harness('components/job-location-picker.tsx');
    const search = (h.modules['@/lib/location-search'] as Props).searchPhoton;
    search.mockResolvedValueOnce([{ label: 'Old result', pin }]);
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    openSearch(render).props.onChangeText('first'); render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Search result Old result')).toHaveLength(1));
    openSearch(render).props.onChangeText('second');
    expect(all(render(), n => n.props.accessibilityLabel === 'Search result Old result')).toHaveLength(0);
    search.mockRejectedValueOnce(new Error('Unavailable'));
    render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.label === 'Retry search')).toHaveLength(1));
    search.mockResolvedValueOnce([{ label: 'Fresh result', pin }]);
    all(render(), n => n.props.label === 'Retry search')[0].props.onPress();
    render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Search result Fresh result')).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === 'Back to map')[0]?.props.onPress();
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
    expect(h.geocoder.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('retries the same fallback pin without permission and explains the general-area metadata', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.reverseGeocodeAsync.mockRejectedValueOnce(new Error('Unavailable'));
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.props.message === "Couldn't identify a street address. The selected pin will be saved with the general-area label shown above.")).toHaveLength(1);
    const retry = all(render(), n => n.props.label === 'Retry address')[0];
    expect(retry).toBeDefined();
    let reply!: (rows: { formattedAddress: string }[]) => void;
    h.geocoder.reverseGeocodeAsync.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    retry.props.onPress();
    await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
    expect(confirmButton(render()).props.disabled).toBe(false);
    reply([{ formattedAddress: 'Retry street' }]);
    await vi.waitFor(() => expect(all(render(), n => n.props.children === 'Retry street').length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Retry street' });
    expect(h.geocoder.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
  it('resolves the retained candidate on foreground without requiring permission', async () => {
    const h = harness('components/job-location-picker.tsx');
    let change!: (state: string) => void;
    h.appState.addEventListener.mockImplementation((_event, listener) => { change = listener; return { remove: vi.fn() }; });
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const initial = render();
    h.effects.forEach(effect => effect());
    byType(initial, 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    change('background');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    change('active');
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin);
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('confirms manual placement with fallback despite denied permission', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    h.geocoder.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Permission denied'));
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Selected Job location — Santa Ana, Pateros' });
  });
  it('preserves manual confirmation and shows Settings when optional Current Location is permanently denied', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    await all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(all(render(), n => n.props.label === 'Open settings')).toHaveLength(1));
    all(render(), n => n.props.label === 'Open settings')[0].props.onPress();
    expect((h.modules['react-native'] as Props).Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(confirmButton(render()).props.disabled).toBe(false);
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('shows a prior confirmed address on reopen and lets Back discard temporary movement', () => {
    const h = harness('components/job-location-picker.tsx');
    const props = { pin, initialAddress: 'Previously confirmed address', note: null, onNote: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    expect(byType(render(), 'Camera').props.initialViewState.center).toEqual([pin.longitude, pin.latitude]);
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Previously confirmed address')).toHaveLength(1);
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionWillChange(region({ ...pin, longitude: pin.longitude + 0.0001 }));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Previously confirmed address')).toHaveLength(0);
    all(render(), n => n.props.accessibilityLabel === 'Back to Post Job')[0].props.onPress();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('uses the settled MapLibre center under a fixed overlay and confirms only on Choose', async () => {
    const h = harness('components/job-location-picker.tsx');
    const props: Props = { pin: null, resetKey: 0, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    let tree = render();
    expect(byType(tree, 'Map').props.mapStyle).toBe(PICKER_MAP_STYLE);
    expect(all(tree, n => n.props.testID === 'service-location-center-pin')).toHaveLength(1);
    expect(all(tree, n => n.type === 'ViewAnnotation')).toHaveLength(0);
    expect(byType(tree, 'Map').props.onPress).toBeUndefined();
    byType(tree, 'Map').props.onRegionDidChange(region(pin, false));
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(tree, 'Map').props.onRegionWillChange(region(pin));
    expect(props.onInvalidate).toHaveBeenCalledTimes(1);
    expect(confirmButton(render()).props.disabled).toBe(true);
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    tree = render();
    expect(all(tree, n => n.props.accessibilityLabel === 'Search locations')).toHaveLength(1);
    expect(confirmButton(tree).props.disabled).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
    confirmButton(tree).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
  });

  it('invalidates old text on movement, blocks outside-area pins, and confirms geocoder fallback', async () => {
    const h = harness('components/job-location-picker.tsx');
    const props = { pin: null, resetKey: 0, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionWillChange(region(pin));
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const moved = { longitude: pin.longitude + 0.00001, latitude: pin.latitude };
    byType(render(), 'Map').props.onRegionWillChange(region(moved));
    expect(confirmButton(render()).props.disabled).toBe(true);
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Canonical selected address')).toHaveLength(0);
    byType(render(), 'Map').props.onRegionDidChange(region({ latitude: 14.55801, longitude: 121.06942 }));
    await vi.waitFor(() => expect(all(render(), n => n.type === 'Text' && n.props.children === 'This location is outside Barangay Santa Ana.')).toHaveLength(1));
    expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledTimes(1);
    expect(confirmButton(render()).props.disabled).toBe(true);
    h.geocoder.reverseGeocodeAsync.mockRejectedValueOnce(new Error('Unavailable'));
    byType(render(), 'Map').props.onRegionWillChange(region(moved));
    byType(render(), 'Map').props.onRegionDidChange(region(moved));
    await vi.waitFor(() => expect(all(render(), n => n.type === 'Text' && n.props.children === 'Santa Ana, Pateros')).toHaveLength(2));
    expect(confirmButton(render()).props.disabled).toBe(false);
    expect(all(render(), n => n.props.message === "Couldn't identify a street address. The selected pin will be saved with the general-area label shown above.")).toHaveLength(1);
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin: moved, address: 'Selected Job location — Santa Ana, Pateros' });
  });

  it('preserves a manually confirmed candidate when optional Current Location is unavailable', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getCurrentPositionAsync.mockRejectedValue(new Error('Unavailable'));
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    await all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(props.onNote).toHaveBeenCalledWith(location.COPY.locationUnavailable));
    expect(confirmButton(render()).props.disabled).toBe(false);
    all(render(), n => n.props.accessibilityLabel === 'Back to map')[0]?.props.onPress();
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
  });

  it('discards an old reverse-geocode reply after the map settles at a newer center', async () => {
    const h = harness('components/job-location-picker.tsx');
    let reply!: (rows: { formattedAddress: string }[]) => void;
    h.geocoder.reverseGeocodeAsync.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    const props = { pin: null, resetKey: 0, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionWillChange(region(pin));
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
    const moved = { latitude: pin.latitude, longitude: pin.longitude + 0.00001 };
    byType(render(), 'Map').props.onRegionWillChange(region(moved));
    byType(render(), 'Map').props.onRegionDidChange(region(moved));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledTimes(2));
    reply([{ formattedAddress: 'Obsolete address' }]);
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Obsolete address')).toHaveLength(0);
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin: moved, address: 'Canonical selected address' });
  });

  it('moves the camera for fresh foreground Current Location, then validates its settled center', async () => {
    const h = harness('components/job-location-picker.tsx');
    const props = { pin: null, resetKey: 0, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    const easeTo = vi.fn();
    byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 }));
    expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    expect(confirmButton(render()).props.disabled).toBe(false);
  });

  it('queries nearby landmarks after GPS without replacing the service pin with a business', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.00002 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.length === 1 ? [] : [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Mapped place' } }]);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 }));
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(queryRenderedFeatures).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    expect(easeTo).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('queries only after settling, geocodes the snap, permits exact override, and does not resnap its own camera move', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.00003 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.includes('poi_r1') ? [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Test landmark' } }] : []);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(target));
    expect(easeTo).toHaveBeenCalledWith({ center: [target.longitude, target.latitude], padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 200 });
    expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(1);
    openSearch(render);
    expect(all(render(), n => n.props.label === 'Use exact pin instead')).toHaveLength(0);
    all(render(), n => n.props.accessibilityLabel === 'Back to map')[0].props.onPress();
    const calls = queryRenderedFeatures.mock.calls.length;
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, snap.SNAP_MIN_ZOOM));
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(calls);
    const override = all(render(), n => n.type === 'AppButton' && n.props.label === 'Use exact pin instead')[0];
    expect(override).toBeDefined();
    override.props.onPress();
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    await vi.waitFor(() => expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(0));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, snap.SNAP_MIN_ZOOM));
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(calls);
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    all(render(), n => n.props.accessibilityLabel === 'Back to map')[0]?.props.onPress();
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
  });

  it('discards a delayed feature query after the user selects a newer center', async () => {
    const h = harness('components/job-location-picker.tsx');
    const next = { ...pin, longitude: pin.longitude + 0.00004 };
    let reply!: (features: unknown[]) => void;
    const queryRenderedFeatures = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }))
      .mockResolvedValue([]);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
    byType(render(), 'Map').props.onRegionWillChange(region(next, true, 14));
    byType(render(), 'Map').props.onRegionDidChange(region(next, true, 14));
    reply([{ geometry: { type: 'Point', coordinates: [pin.longitude + 0.00002, pin.latitude] }, properties: { name: 'Obsolete public hall' } }]);
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(next));
    expect(easeTo).not.toHaveBeenCalled();
    expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(0);
  });

  it('retains a selected Nearby identity through camera settling without treating it as the reverse address or confirming', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.0005 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.length === 1 ? [] : [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Mapped store' } }]);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    openSearch(render);
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Mapped store')).toHaveLength(1));
    const row = all(render(), n => n.props.accessibilityLabel === 'Move map to Mapped store')[0];
    row.props.onPress();
    expect(easeTo).toHaveBeenLastCalledWith({ center: [target.longitude, target.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 });
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(target));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Mapped store')).toHaveLength(2);
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Canonical selected address')).toHaveLength(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith({ pin: target, address: 'Canonical selected address' });
  });

  it('keeps Booking suppression and maps only the authorized pin without gestures', () => {
    const h = harness('components/job-location-map.tsx');
    expect(h.exports.WorkerAssignedJobLocation({ surface: { kind: 'suppressed' } })).toBeNull();
    const tree = h.exports.WorkerAssignedJobLocation({ surface: { kind: 'exact', showMap: true, pin }, onOpenMaps: vi.fn() });
    const mapComponent = all(tree, n => typeof n.type === 'function' && n.props.pin === pin)[0];
    const map = h.render(mapComponent.type as (props: Props) => Element, mapComponent.props);
    expect(byType(map, 'Marker').props.lngLat).toEqual([pin.longitude, pin.latitude]);
    expect(byType(map, 'Camera').props.initialViewState.center).toEqual([pin.longitude, pin.latitude]);
    expect(byType(map, 'Map').props.dragPan).toBe(false);
    expect(byType(map, 'Map').props.touchZoom).toBe(false);
    expect(byType(map, 'Map').props.mapStyle).toBe('https://tiles.openfreemap.org/styles/liberty');
  });

  it('on a confirmed booking with the inline live map, keeps the address and Open in Maps but draws no second map', () => {
    const h = harness('components/job-location-map.tsx');
    const surface = { kind: 'exact', showMap: true, pin, address: 'Synthetic Test Address', openInMapsUrl: 'geo:0,0?q=0,0' };
    const tree = h.exports.WorkerAssignedJobLocation({ surface, onOpenMaps: vi.fn(), showMap: false });
    expect(all(tree, n => typeof n.type === 'function' && n.props.pin === pin)).toHaveLength(0);
    expect(all(tree, n => n.props.accessibilityLabel === 'Job location map unavailable')).toHaveLength(0);
    expect(all(tree, n => n.type === 'Text' && n.props.children === 'Synthetic Test Address')).toHaveLength(1);
    expect(all(tree, n => n.props.label === 'Open in Maps')).toHaveLength(1);
    const withMap = h.exports.WorkerAssignedJobLocation({ surface, onOpenMaps: vi.fn() });
    expect(all(withMap, n => typeof n.type === 'function' && n.props.pin === pin)).toHaveLength(1);
  });

  it('retains missing-native-module fallbacks', () => {
    const h = harness('components/job-location-picker.tsx', false);
    const tree = h.render(h.exports.JobLocationPicker, { pin: null, onChangePin: vi.fn(), onNote: vi.fn() });
    expect(all(tree, n => n.type === 'Map')).toHaveLength(0);
    expect(all(tree, n => n.props.accessibilityLabel === 'Job location map unavailable')).toHaveLength(1);
    expect(harness('components/job-location-map.tsx', false).exports.nativeJobMapsLoaded()).toBe(false);
    expect(harness('lib/native-job-map.ts', false).exports.jobMapRuntime).toBeNull();
    expect(harness('lib/native-job-map.ts', true).exports.jobMapRuntime.Map).toBe('Map');
  });

  it.each([true, false])('keeps Worker opportunity MapLibre available with __DEV__=%s', (dev) => {
    const h = harness('components/worker-job-location-map.tsx', true, dev);
    const wrapper = h.exports.WorkerJobLocationMapLibre({ pin });
    const inner = wrapper.props.children as Element;
    const tree = h.render(inner.type as (props: Props) => Element, inner.props);
    expect(byType(tree, 'Marker').props.lngLat).toEqual([pin.longitude, pin.latitude]);
    expect(byType(tree, 'Map').props.mapStyle).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(byType(tree, 'Map').props.dragPan).toBe(false);
  });
});


describe('street-level ride-hailing picker', () => {
  it('leads a settled destination row with the actual selected address rather than a generic caption', async () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const row = all(render(), n => n.props.accessibilityLabel === 'Selected location address')[0];
    expect(all(row, n => n.type === 'Text')[0].props.children).toBe('Canonical selected address');
  });
  it('keeps the selected coordinate while search, keyboard and sheet layout change', async () => {
    const h = harness('components/job-location-picker.tsx');
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    const easeTo = vi.fn(); byType(render(), 'Camera').props.ref.current = { easeTo };
    openSearch(render);
    const keyboard = (h.modules['react-native'] as Props).Keyboard;
    const expandedStyle = Object.assign({}, ...all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.style);
    expect(expandedStyle.maxHeight).toBe(900);
    expect(expandedStyle.bottom).toBe(0);
    keyboard.addListener.mock.calls.find(([name]: [string]) => name === 'keyboardDidShow')[1]({ endCoordinates: { height: 300 } });
    all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 600 } } });
    expect(easeTo).not.toHaveBeenCalled();
    all(render(), n => n.props.accessibilityLabel === 'Back to map')[0].props.onPress();
    all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 250 } } });
    expect(easeTo).toHaveBeenLastCalledWith({ center: [pin.longitude, pin.latitude], padding: { top: 88, right: 0, bottom: 250, left: 0 }, duration: 0 });
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: 'Canonical selected address' });
  });
  it('keeps the selected row inside scrollable content with confirmation outside it', () => {
    const h = harness('components/job-location-picker.tsx');
    const tree = h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const body = byType(tree, 'ScrollView');
    expect(all(body, n => n.props.accessibilityLabel === 'Selected location address')).toHaveLength(1);
    expect(all(body, n => n.props.label === 'Confirm location')).toHaveLength(0);
  });
  it('separates search and recents from confirmation and routes modal Back through search first', async () => {
    const h = harness('components/job-location-picker.tsx');
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const backHandlerRef = { current: null as null | (() => void) };
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onCancel, onConfirm, backHandlerRef });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.type === 'TextInput')).toHaveLength(0);
    expect(all(render(), n => n.props.accessibilityLabel === 'Recent locations')).toHaveLength(0);
    all(render(), n => n.props.accessibilityLabel === 'Search locations')[0].props.onPress();
    expect(all(render(), n => n.type === 'TextInput')).toHaveLength(1);
    backHandlerRef.current?.();
    expect(all(render(), n => n.type === 'TextInput')).toHaveLength(0);
    expect(onCancel).not.toHaveBeenCalled();
    confirmButton(render()).props.onPress();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ pin, address: 'Canonical selected address' });
    backHandlerRef.current?.();
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it.each([null, pin])('opens at street zoom with selection %s and restricts only picker zoom', opening => {
    const h = harness('components/job-location-picker.tsx');
    const tree = h.render(h.exports.JobLocationPicker, { pin: opening, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const camera = byType(tree, 'Camera').props;
    expect(camera.initialViewState.zoom).toBe(16.6);
    expect(camera.initialViewState.zoom).toBeGreaterThanOrEqual(16.5);
    expect(camera.initialViewState.zoom).toBeLessThanOrEqual(17.5);
    expect(camera.initialViewState.center).toEqual(coordinates.pinToLngLat(opening ?? location.SANTA_ANA_PATEROS_DISPLAY_REGION));
    expect(camera.minZoom).toBe(15);
    expect(camera.maxZoom).toBeLessThanOrEqual(20);
  });
  it('pads the camera and pin for measured sheet changes without selecting a new coordinate', () => {
    const h = harness('components/job-location-picker.tsx');
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm });
    const tree = render();
    const sheet = all(tree, n => n.props.testID === 'location-picker-sheet')[0];
    sheet.props.onLayout({ nativeEvent: { layout: { height: 320 } } });
    const next = render();
    const padding = byType(next, 'Camera').props.padding;
    expect(padding).toEqual({ top: 88, right: 0, bottom: 320, left: 0 });
    const overlay = all(next, n => n.props.testID === 'service-location-center-pin')[0];
    expect(overlay.props.style.top).toBe(334);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('keeps search above the sheet and collapses it after a selected result', async () => {
    const h = harness('components/job-location-picker.tsx');
    (h.modules['@/lib/location-search'] as Props).searchPhoton.mockResolvedValue([{ label: 'Public street', pin }]);
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm });
    render(); h.flushEffects();
    const easeTo = vi.fn(); byType(render(), 'Camera').props.ref.current = { easeTo };
    expect(all(byType(render(), 'ScrollView'), n => n.type === 'TextInput')).toHaveLength(0);
    openSearch(render).props.onChangeText('Public street'); render(); h.flushEffects(); h.runSearchTimers();
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Search result Public street')).toHaveLength(1));
    all(render(), n => n.props.accessibilityLabel === 'Search result Public street')[0].props.onPress();
    expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: 16.6, padding: { top: 88, right: 0, bottom: 342, left: 0 }, duration: 300 });
    expect(all(render(), n => n.type === 'TextInput')).toHaveLength(0);
    expect(all(render(), n => n.props.accessibilityLabel === 'Search result Public street')).toHaveLength(0);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});


describe('street-level initial render', () => {
  it('loads opening landmarks without promoting the untouched map anchor to a selection', async () => {
    const h = harness('components/job-location-picker.tsx');
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    render(); h.flushEffects();
    const queryRenderedFeatures = vi.fn().mockResolvedValue([]);
    const getViewState = vi.fn().mockResolvedValue({ center: [pin.longitude, pin.latitude], zoom: 17 });
    byType(render(), 'Map').props.ref.current = { getViewState, queryRenderedFeatures, project: vi.fn().mockResolvedValue([200, 200]) };
    byType(render(), 'Map').props.onDidFinishRenderingMap();
    await vi.waitFor(() => expect(queryRenderedFeatures).toHaveBeenCalled());
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    const calls = queryRenderedFeatures.mock.calls.length;
    byType(render(), 'Map').props.onDidFinishRenderingMapFully();
    await Promise.resolve(); await Promise.resolve();
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(calls);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});


describe('street-level selected address hierarchy', () => {
  it('separates returned street context from locality without inventing either', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.reverseGeocodeAsync.mockResolvedValue([{ formattedAddress: 'M. Almeda Street, Santa Ana, Pateros' }]);
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(all(render(), n => n.type === 'Text' && n.props.children === 'M. Almeda Street')).toHaveLength(2));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Santa Ana, Pateros')).toHaveLength(1);
  });
  it('keeps general-area fallback readable and confirmable without fake street detail', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.reverseGeocodeAsync.mockRejectedValue(new Error('Unavailable'));
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Exact street unavailable.')).toHaveLength(1);
  });
});


describe('street picker native startup readiness', () => {
  it('retries initial context when an early native frame precedes the camera zoom', async () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    const getViewState = vi.fn().mockResolvedValueOnce({ center: [0, 0], zoom: 0 }).mockResolvedValue({ center: [pin.longitude, pin.latitude], zoom: 17 });
    byType(render(), 'Map').props.ref.current = { getViewState, queryRenderedFeatures: vi.fn().mockResolvedValue([]), project: vi.fn().mockResolvedValue([200, 200]) };
    byType(render(), 'Map').props.onDidFinishRenderingFrame();
    await vi.waitFor(() => expect(getViewState).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    byType(render(), 'Map').props.onDidFinishRenderingMap();
    await vi.waitFor(() => expect(byType(render(), 'Map').props.ref.current.queryRenderedFeatures).toHaveBeenCalled());
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
  });
});


describe('native camera padding contract', () => {
  it('includes viewport padding with initial center and every candidate move', async () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    expect(byType(render(), 'Camera').props.initialViewState.padding).toEqual({ top: 88, right: 0, bottom: 342, left: 0 });
    const easeTo = vi.fn(); byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalled());
    expect(easeTo.mock.calls[0][0].padding).toEqual({ top: 88, right: 0, bottom: 342, left: 0 });
  });
  it('reapplies measured sheet padding with the same geographic center and no confirmation', () => {
    const h = harness('components/job-location-picker.tsx');
    const onConfirm = vi.fn();
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm });
    const easeTo = vi.fn(); byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 300 } } });
    expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], padding: { top: 88, right: 0, bottom: 300, left: 0 }, duration: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});


describe('street picker attribution access', () => {
  it('keeps native attribution above the measured sheet', () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 320 } } });
    expect(byType(render(), 'Map').props.attributionPosition).toEqual({ bottom: 328, left: 20 });
  });
});


describe('native layout camera lifetime', () => {
  it('absorbs an asynchronously rejected native camera update during teardown', async () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const rejected = Promise.reject(new Error('Native camera view disposed'));
    const unhandled: unknown[] = [];
    const listener = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', listener);
    try {
      byType(render(), 'Camera').props.ref.current = { easeTo: () => rejected };
      all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 300 } } });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      void rejected.catch(() => undefined);
      process.off('unhandledRejection', listener);
    }
  });
});


describe('padding and explicit camera movement ordering', () => {
  it('does not swallow a GPS selection when a padding update emitted no idle event', async () => {
    const h = harness('components/job-location-picker.tsx');
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    render(); h.flushEffects();
    byType(render(), 'Camera').props.ref.current = { easeTo: vi.fn() };
    all(render(), n => n.props.testID === 'location-picker-sheet')[0].props.onLayout({ nativeEvent: { layout: { height: 300 } } });
    all(render(), n => n.props.accessibilityLabel === 'Use My Location')[0].props.onPress();
    await vi.waitFor(() => expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, 17));
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
  });
});
