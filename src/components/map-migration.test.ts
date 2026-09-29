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
  const appState = { currentState: 'active', addEventListener: vi.fn() };
  const geocoder = {
    reverseGeocodeAsync: vi.fn().mockResolvedValue([{ formattedAddress: 'Canonical selected address' }]),
    getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
    requestForegroundPermissionsAsync: vi.fn(),
    getCurrentPositionAsync: vi.fn().mockResolvedValue({ coords: pin }),
  };
  const runtime = { Map: 'Map', Camera: 'Camera', Marker: 'Marker', ViewAnnotation: 'ViewAnnotation' };
  const jsx = (type: Element['type'], props: Props) => ({ type, props });
  const ui = { colors: {}, type: {}, spacing: {}, radius: {}, size: {} };
  const modules: Record<string, unknown> = {
    react: {
      Component: class {},
      useState(initial: unknown) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (value: unknown) => { slots[slot] = value; }];
      },
      useRef(initial: unknown) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
      useCallback: (callback: unknown) => callback,
      useEffect(effect: () => unknown) { effects.push(effect); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { AppState: appState, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', useWindowDimensions: () => ({ height: 900 }), StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 } },
    tamagui: { Text: 'Text', YStack: 'YStack' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '@/constants/theme': { SkillMatchTheme: { ui, border: {}, surface: {}, text: {}, feedback: {} } },
    '@/lib/native-job-map': { jobMapRuntime: nativeAvailable ? runtime : null, JOB_MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty' },
    '@/lib/map-coordinates': coordinates,
    '@/lib/canonical-job-location': canonical,
    '@/lib/job-location': location,
    '@/lib/job-location-snap': snap,
    '@/lib/location-permission': permission,
    '@/lib/bookings': { formatLocation: () => 'Santa Ana, Pateros' },
    '@/components/app-button': { AppButton: 'AppButton' },
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
  runInNewContext(compiled, { exports, setTimeout: vi.fn(), clearTimeout: vi.fn(), __DEV__: dev, require: (name: string) => {
    if (!nativeAvailable && name === '@maplibre/maplibre-react-native') throw new Error('Native module unavailable');
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  } });
  return { exports, geocoder, effects, appState, render: (component: (props: Props) => Element, props: Props) => { cursor = 0; return component(props); } };
}

function all(tree: Element | null, predicate: (node: Element) => boolean): Element[] {
  if (!tree || typeof tree !== 'object') return [];
  const children = [tree.props?.children].flat(Infinity) as Element[];
  return [...(predicate(tree) ? [tree] : []), ...children.flatMap(child => all(child, predicate))];
}
const byType = (tree: Element, type: string) => all(tree, n => n.type === type)[0];
const confirmButton = (tree: Element) => all(tree, n => n.type === 'AppButton' && n.props.label === 'Choose This Location')[0];
const region = (center: { longitude: number; latitude: number }, userInteraction = true, zoom = 14) => ({
  nativeEvent: { center: [center.longitude, center.latitude], userInteraction, zoom },
});

describe('migrated map source event contracts', () => {
  it('rechecks permission and resolves the retained candidate after returning from Settings', async () => {
    const h = harness('components/job-location-picker.tsx');
    let change!: (state: string) => void;
    h.appState.addEventListener.mockImplementation((_event, listener) => { change = listener; return { remove: vi.fn() }; });
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    const initial = render();
    h.effects.forEach(effect => effect());
    byType(initial, 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(all(render(), n => n.props.label === 'Open Settings')).toHaveLength(1));
    change('background');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    change('active');
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin);
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('keeps a denied-permission pin unconfirmed until the explicit address action grants permission', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    h.geocoder.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(all(render(), n => n.props.label === 'Enable Location to Confirm Address')).toHaveLength(1));
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    all(render(), n => n.props.label === 'Enable Location to Confirm Address')[0].props.onPress();
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
    expect(h.geocoder.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    confirmButton(render()).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
  });
  it('shows Settings guidance for permanent denial without calling the prompt', async () => {
    const h = harness('components/job-location-picker.tsx');
    h.geocoder.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const render = () => h.render(h.exports.JobLocationPicker, { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() });
    byType(render(), 'Map').props.onRegionDidChange(region(pin));
    await vi.waitFor(() => expect(all(render(), n => n.props.label === 'Open Settings')).toHaveLength(1));
    expect(confirmButton(render()).props.disabled).toBe(true);
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
    expect(byType(tree, 'Map').props.mapStyle).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(all(tree, n => n.props.accessibilityLabel === 'Center service location pin')).toHaveLength(1);
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
    expect(all(tree, n => n.type === 'TextInput')).toHaveLength(0);
    expect(confirmButton(tree).props.disabled).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
    confirmButton(tree).props.onPress();
    expect(props.onConfirm).toHaveBeenCalledWith({ pin, address: 'Canonical selected address' });
  });

  it('invalidates the old address on movement and blocks outside-area or failed geocoding', async () => {
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
    await vi.waitFor(() => expect(all(render(), n => n.type === 'Text' && n.props.children === 'Unable to determine the address. Move the map slightly and try again.')).toHaveLength(1));
    expect(confirmButton(render()).props.disabled).toBe(true);
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
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: snap.SNAP_MIN_ZOOM, duration: 300 }));
    expect(h.geocoder.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(h.geocoder.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(h.geocoder.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    expect(confirmButton(render()).props.disabled).toBe(false);
  });

  it('routes a settled Current Location through the same nearby-feature query', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.00002 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.includes('building-3d') ? [] : [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Mapped place' } }]);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn(), onInvalidate: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    all(render(), n => n.props.accessibilityLabel === location.COPY.useCurrentLocation)[0].props.onPress();
    await vi.waitFor(() => expect(easeTo).toHaveBeenCalledWith({ center: [pin.longitude, pin.latitude], zoom: snap.SNAP_MIN_ZOOM, duration: 300 }));
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(queryRenderedFeatures).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(target));
    expect(easeTo).toHaveBeenLastCalledWith({ center: [target.longitude, target.latitude], duration: 200 });
  });

  it('queries only after settling, geocodes the snap, permits exact override, and does not resnap its own camera move', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.00003 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.includes('building-3d') ? [] : [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Test place' } }]);
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
    expect(easeTo).toHaveBeenCalledWith({ center: [target.longitude, target.latitude], duration: 200 });
    expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(1);
    const calls = queryRenderedFeatures.mock.calls.length;
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, snap.SNAP_MIN_ZOOM));
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(calls);
    const override = all(render(), n => n.type === 'AppButton' && n.props.label === 'Use exact pin instead')[0];
    expect(override).toBeDefined();
    override.props.onPress();
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin));
    expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(0);
    byType(render(), 'Map').props.onRegionDidChange(region(pin, false, snap.SNAP_MIN_ZOOM));
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(calls);
    await vi.waitFor(() => expect(confirmButton(render()).props.disabled).toBe(false));
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
    reply([{ geometry: { type: 'Point', coordinates: [pin.longitude + 0.00002, pin.latitude] }, properties: {} }]);
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(next));
    expect(easeTo).not.toHaveBeenCalled();
    expect(all(render(), n => n.type === 'AppNotice')).toHaveLength(0);
  });

  it('moves the camera for a Nearby row without confirming or treating its label as the address', async () => {
    const h = harness('components/job-location-picker.tsx');
    const target = { ...pin, longitude: pin.longitude + 0.0003 };
    const queryRenderedFeatures = vi.fn(async (_bounds: unknown, options: { layers: string[] }) =>
      options.layers.includes('building-3d') ? [] : [{ geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: { name: 'Mapped store' } }]);
    const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
      [200 + (longitude - pin.longitude) * 100000, 200 + (latitude - pin.latitude) * 100000]);
    const easeTo = vi.fn();
    const props = { pin: null, note: null, onNote: vi.fn(), onConfirm: vi.fn() };
    const render = () => h.render(h.exports.JobLocationPicker, props);
    byType(render(), 'Map').props.ref.current = { queryRenderedFeatures, project };
    byType(render(), 'Camera').props.ref.current = { easeTo };
    byType(render(), 'Map').props.onRegionWillChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    byType(render(), 'Map').props.onRegionDidChange(region(pin, true, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(all(render(), n => n.props.accessibilityLabel === 'Move map to Mapped store')).toHaveLength(1));
    const row = all(render(), n => n.props.accessibilityLabel === 'Move map to Mapped store')[0];
    row.props.onPress();
    expect(easeTo).toHaveBeenLastCalledWith({ center: [target.longitude, target.latitude], zoom: snap.SNAP_MIN_ZOOM, duration: 300 });
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(confirmButton(render()).props.disabled).toBe(true);
    byType(render(), 'Map').props.onRegionDidChange(region(target, false, snap.SNAP_MIN_ZOOM));
    await vi.waitFor(() => expect(h.geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(target));
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Mapped store')).toHaveLength(1);
    expect(all(render(), n => n.type === 'Text' && n.props.children === 'Canonical selected address')).toHaveLength(1);
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
