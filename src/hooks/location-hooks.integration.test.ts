import { act, createElement, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { expect, it, vi } from 'vitest';
import { useLocationSharing } from './use-location-sharing';
import { useBookingPins } from './use-booking-pins';
import { createDetailsAppStateHandler } from '@/lib/booking-details-app-state';
import { locationStopQueue } from '@/lib/location-stop-queue';
import { systemPromptPending } from '@/lib/system-prompt';
const boundary = vi.hoisted(() => ({
  state: 'active', listeners: new Set<(state: string) => void>(),
  rpc: vi.fn(), remove: vi.fn(), watch: vi.fn(), permission: vi.fn(),
  broadcast: new Map<string, () => void>(), counterpart: null as Record<string, unknown> | null,
}));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) }));
vi.mock('react-native', () => ({ AppState: {
  get currentState() { return boundary.state; },
  addEventListener: (_: string, listener: (state: string) => void) => { boundary.listeners.add(listener); return { remove: () => boundary.listeners.delete(listener) }; },
} }));
vi.mock('expo-location', () => ({ Accuracy: { Balanced: 3, High: 4 }, requestForegroundPermissionsAsync: boundary.permission,
  hasServicesEnabledAsync: async () => true, watchPositionAsync: boundary.watch }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: boundary.rpc, channel: () => {
  const channel = { on: (_: string, filter: { event: string }, handler: () => void) => { boundary.broadcast.set(filter.event, handler); return channel; },
    subscribe: () => channel };
  return channel;
}, removeChannel: () => Promise.resolve('ok') } }));

const emit = (state: string) => { boundary.state = state; for (const listener of [...boundary.listeners]) listener(state); };
const stopCalls = (bookingId: string) => boundary.rpc.mock.calls.filter(([name, args]) => name === 'stop_my_booking_location_share' && args.p_booking_id === bookingId);
const startCalls = () => boundary.rpc.mock.calls.filter(([name]) => name === 'start_my_booking_location_share').length;
const pendingStops = (bookingId: string) => locationStopQueue.getSnapshot().filter(entry => entry.bookingId === bookingId);

/** Fresh boundary: foreground, granted permission, confirmed server Stop, and the real root Stop queue context. */
async function setup(stopResult = () => 'stopped') {
  boundary.state = 'active';
  for (const mock of [boundary.rpc, boundary.remove, boundary.watch, boundary.permission]) mock.mockReset();
  boundary.broadcast.clear(); boundary.counterpart = null;
  locationStopQueue.setContext({ accountId: 'account-a', isCurrent: () => boundary.state === 'active', send: async entry => {
    const response = await boundary.rpc('stop_my_booking_location_share', { p_booking_id: entry.bookingId, p_share_id: entry.shareId });
    return response.data === 'stopped';
  } });
  boundary.permission.mockResolvedValue({ granted: true });
  boundary.watch.mockResolvedValue({ remove: boundary.remove });
  boundary.rpc.mockImplementation(async (name: string, args: { p_booking_id: string }) => ({ error: null, data:
    name === 'start_my_booking_location_share' ? args.p_booking_id.replace('booking', 'share') : name === 'stop_my_booking_location_share' ? stopResult() :
    { server_now: '2026-10-15T00:00:00Z', lease_expires_at: '2026-10-15T00:01:00Z', my_share: 'none', counterpart: boundary.counterpart } }));
  const doc: Record<string, unknown> = { nodeType: 9, activeElement: null, documentElement: {}, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, event: undefined, HTMLIFrameElement: class {} }; doc.defaultView = win;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const module: string = 'react-dom/client';
  const { createRoot } = await import(/* @vite-ignore */ module) as { createRoot: (container: unknown) => { render: (node: unknown) => void; unmount: () => void } };
  return createRoot(container);
}

async function teardown(root: { unmount: () => void }) {
  await act(async () => root.unmount());
  locationStopQueue.setContext(null);
  vi.unstubAllGlobals();
}

let sharing!: ReturnType<typeof useLocationSharing>;
function MapAdapter({ bookingId = 'booking-a' }: { bookingId?: string }) {
  const current = useLocationSharing(bookingId, 'account-a', true);
  useBookingPins(bookingId, 'account-a', 'worker', current.shareId, true);
  useEffect(() => { sharing = current; });
  return null;
}

/** Booking Details' own AppState handling around its inline map, as in booking-details.tsx. */
const details = { ended: 0 };
function DetailsWithInlineMap({ bookingId }: { bookingId: string }) {
  const [pinsSession, setPinsSession] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', createDetailsAppStateHandler({
      endPinsSession: () => { details.ended += 1; setPinsSession(session => session + 1); }, hideProtected() {}, reload() {},
      isFocused: () => true, promptPending: systemPromptPending,
    }));
    return () => subscription.remove();
  }, []);
  return createElement(MapAdapter, { key: pinsSession, bookingId });
}

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('real hooks stay opt-in, clear on background, and never restart an explicitly stopped map session', async () => {
  const root = await setup();
  try {
    await act(async () => { root.render(createElement(MapAdapter)); });
    expect(boundary.permission).not.toHaveBeenCalled();
    expect(boundary.watch).not.toHaveBeenCalled();
    await act(async () => { sharing.start(); });
    expect(boundary.watch).toHaveBeenCalledOnce();
    expect(sharing.shareId).toBe('share-a');
    await act(async () => { emit('background'); });
    expect(boundary.remove).toHaveBeenCalledOnce();
    await act(async () => { emit('active'); });
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(boundary.rpc).toHaveBeenLastCalledWith('get_booking_location_pins', { p_booking_id: 'booking-a', p_share_id: 'share-a' });
    await act(async () => { sharing.stop(); });
    await act(async () => { emit('background'); emit('active'); });
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(sharing.state.status).toBe('off');
    expect(boundary.rpc).toHaveBeenCalledWith('stop_my_booking_location_share', { p_booking_id: 'booking-a', p_share_id: 'share-a' });
  } finally { await teardown(root); }
  expect(boundary.listeners.size).toBe(0);
});

// E2E retest 2026-10-15, booking 29d054bb: watchPositionAsync opened Google Play services'
// "Location Accuracy" (LocationSettingsCheckerActivity); its background/active round-trip closed the map.
it('the Location Accuracy prompt during watch start keeps the map session with one share and one watcher', async () => {
  const root = await setup();
  details.ended = 0;
  const dialog = deferred<{ remove: () => void }>();
  const lateRemove = vi.fn();
  let permissionGuarded = false;
  boundary.permission.mockImplementation(async () => { permissionGuarded = systemPromptPending(); return { granted: true }; });
  boundary.watch.mockReturnValueOnce(dialog.promise);
  try {
    await act(async () => { root.render(createElement(DetailsWithInlineMap, { bookingId: 'booking-b' })); });
    await act(async () => { sharing.start(); });
    expect(permissionGuarded).toBe(true);
    expect(boundary.watch).toHaveBeenCalledOnce();
    expect(systemPromptPending()).toBe(true);
    await act(async () => { emit('background'); });
    expect(sharing.state.status).toBe('paused');
    await act(async () => { dialog.resolve({ remove: lateRemove }); });
    expect(lateRemove).toHaveBeenCalledOnce();
    expect(systemPromptPending()).toBe(false);
    await act(async () => { emit('active'); });
    expect(details.ended).toBe(0);
    expect(startCalls()).toBe(1);
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(sharing.state.status).toBe('sharing');
    expect(sharing.shareId).toBe('share-b');

    // Leaving the app is not exempt: the map session ends, collection stops, and the server Stop
    // stays pending until it is actually confirmed in the foreground.
    await act(async () => { emit('background'); });
    expect(details.ended).toBe(1);
    expect(boundary.remove).toHaveBeenCalledOnce();
    expect(stopCalls('booking-b')).toHaveLength(0);
    expect(pendingStops('booking-b')).toHaveLength(1);
    await act(async () => { emit('active'); await locationStopQueue.tick(); });
    expect(stopCalls('booking-b')).toEqual([['stop_my_booking_location_share', { p_booking_id: 'booking-b', p_share_id: 'share-b' }]]);
    expect(pendingStops('booking-b')).toHaveLength(0);
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(startCalls()).toBe(1);
  } finally { await teardown(root); }
  expect(boundary.listeners.size).toBe(0);
});

it('refusing Location Accuracy leaves the map in place, stops the share, and never re-prompts until Share is tapped again', async () => {
  const root = await setup();
  details.ended = 0;
  const refused = deferred<{ remove: () => void }>();
  boundary.watch.mockReturnValueOnce(refused.promise);
  try {
    await act(async () => { root.render(createElement(DetailsWithInlineMap, { bookingId: 'booking-c' })); });
    await act(async () => { sharing.start(); });
    expect(boundary.watch.mock.calls[0][0]).toMatchObject({ accuracy: 4, timeInterval: 5000 });
    await act(async () => { emit('background'); });
    await act(async () => { refused.reject(Object.assign(new Error('Location request failed due to unsatisfied device settings'),
      { code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' })); });
    expect(systemPromptPending()).toBe(false);
    // expo-location re-checks the settings on every watch start: returning must not start another.
    await act(async () => { emit('active'); await locationStopQueue.tick(); });
    expect(details.ended).toBe(0);
    expect(boundary.watch).toHaveBeenCalledOnce();
    expect(boundary.remove).not.toHaveBeenCalled();
    expect(sharing.state.status).toBe('services_off');
    expect(stopCalls('booking-c')).toEqual([['stop_my_booking_location_share', { p_booking_id: 'booking-c', p_share_id: 'share-c' }]]);
    expect(pendingStops('booking-c')).toHaveLength(0);

    // Share again is the explicit retry.
    await act(async () => { sharing.start(); });
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(sharing.state.status).toBe('sharing');
    expect(startCalls()).toBe(2);
    await act(async () => { sharing.stop(); await locationStopQueue.tick(); });
    expect(boundary.remove).toHaveBeenCalledOnce();
    expect(stopCalls('booking-c')).toHaveLength(2);
    expect(pendingStops('booking-c')).toHaveLength(0);
    // A later real background ends the (stopped) map session; returning restarts nothing.
    await act(async () => { emit('background'); });
    expect(details.ended).toBe(1);
    await act(async () => { emit('active'); });
    expect(boundary.watch).toHaveBeenCalledTimes(2);
    expect(startCalls()).toBe(2);
  } finally { await teardown(root); }
});

it('a denied permission round-trip keeps the map session and never starts collection or a server share', async () => {
  const root = await setup();
  details.ended = 0;
  const prompt = deferred<{ granted: boolean; canAskAgain: boolean }>();
  boundary.permission.mockReturnValueOnce(prompt.promise);
  try {
    await act(async () => { root.render(createElement(DetailsWithInlineMap, { bookingId: 'booking-d' })); });
    await act(async () => { sharing.start(); });
    expect(systemPromptPending()).toBe(true);
    await act(async () => { emit('background'); });
    await act(async () => { prompt.resolve({ granted: false, canAskAgain: true }); });
    await act(async () => { emit('active'); });
    expect(details.ended).toBe(0);
    expect(systemPromptPending()).toBe(false);
    expect(sharing.state.status).toBe('denied_request');
    expect(boundary.watch).not.toHaveBeenCalled();
    expect(startCalls()).toBe(0);
    expect(pendingStops('booking-d')).toHaveLength(0);
  } finally { await teardown(root); }
});

it('an unconfirmed server Stop stays pending, blocks a new share, and clears only on a confirmed retry', async () => {
  let stopResult = 'error';
  const root = await setup(() => stopResult);
  try {
    await act(async () => { root.render(createElement(MapAdapter, { bookingId: 'booking-e' })); });
    await act(async () => { sharing.start(); });
    expect(sharing.state.status).toBe('sharing');
    await act(async () => { sharing.stop(); await locationStopQueue.tick(); });
    expect(boundary.remove).toHaveBeenCalledOnce();
    expect(stopCalls('booking-e')).toHaveLength(1);
    expect(pendingStops('booking-e')).toMatchObject([{ shareId: 'share-e', status: 'unconfirmed' }]);
    expect(sharing.state).toMatchObject({ status: 'off', cleanupPending: true, cleanupBlocksStart: true });
    await act(async () => { sharing.start(); });
    expect(startCalls()).toBe(1);
    stopResult = 'stopped';
    await act(async () => { sharing.retryStop(); await locationStopQueue.tick(); });
    expect(stopCalls('booking-e')).toHaveLength(2);
    expect(pendingStops('booking-e')).toHaveLength(0);
    expect(sharing.state).toMatchObject({ status: 'off', cleanupPending: false });
    expect(boundary.watch).toHaveBeenCalledOnce();
  } finally { await teardown(root); }
});

const pinsReads = (bookingId: string) => boundary.rpc.mock.calls.filter(([name, args]) => name === 'get_booking_location_pins' && args.p_booking_id === bookingId).length;
const workerAt = (latitude: number) => ({ role: 'worker', latitude, longitude: 121.0686, accuracy_m: 5, received_at: '2026-10-15T00:00:00Z' });

let clientPins!: ReturnType<typeof useBookingPins>;
/** The Client's inline map uses only the pins reader: no sharing hook, so no GPS for this feature. */
function ClientMapAdapter({ bookingId }: { bookingId: string }) {
  const pins = useBookingPins(bookingId, 'account-c', 'client', null, true);
  useEffect(() => { clientPins = pins; });
  return null;
}

it('Client map never requests permission, watches GPS or starts a share, and shows the authorized Worker pin', async () => {
  const root = await setup();
  boundary.counterpart = workerAt(14.5456);
  try {
    await act(async () => { root.render(createElement(ClientMapAdapter, { bookingId: 'booking-f' })); });
    expect(boundary.rpc).toHaveBeenCalledWith('get_booking_location_pins', { p_booking_id: 'booking-f', p_share_id: null });
    expect(clientPins.view.counterpart).toMatchObject({ role: 'worker', latitude: 14.5456 });
    expect(boundary.permission).not.toHaveBeenCalled();
    expect(boundary.watch).not.toHaveBeenCalled();
    const writes = boundary.rpc.mock.calls.filter(([name]) => name !== 'get_booking_location_pins');
    expect(writes).toEqual([]);
  } finally { await teardown(root); }
});

it('Client map re-reads automatically when the Worker pin changes and clears it when sharing ends', async () => {
  const root = await setup();
  boundary.counterpart = workerAt(14.5456);
  try {
    await act(async () => { root.render(createElement(ClientMapAdapter, { bookingId: 'booking-g' })); });
    const before = pinsReads('booking-g');
    boundary.counterpart = workerAt(14.5460);
    await act(async () => { boundary.broadcast.get('location_pins_changed')?.(); });
    expect(pinsReads('booking-g')).toBe(before + 1);
    expect(clientPins.view.counterpart).toMatchObject({ latitude: 14.546 });
    boundary.counterpart = null;
    await act(async () => { boundary.broadcast.get('location_pins_changed')?.(); });
    expect(clientPins.view.counterpart).toBeNull();
    // Confirmation (or any status change) also re-reads.
    await act(async () => { boundary.broadcast.get('booking_status_changed')?.(); });
    expect(pinsReads('booking-g')).toBe(before + 3);
  } finally { await teardown(root); }
});

let workerPins!: ReturnType<typeof useBookingPins>;
function WorkerPinsAdapter({ bookingId }: { bookingId: string }) {
  const pins = useBookingPins(bookingId, 'account-a', 'worker', null, true);
  useEffect(() => { workerPins = pins; });
  return null;
}

it('Worker map never keeps a Client position, even from a server that still returns one', async () => {
  const root = await setup();
  boundary.counterpart = { role: 'client', latitude: 14.547, longitude: 121.0715, accuracy_m: 5, received_at: '2026-10-15T00:00:00Z' };
  try {
    await act(async () => { root.render(createElement(WorkerPinsAdapter, { bookingId: 'booking-h' })); });
    expect(pinsReads('booking-h')).toBeGreaterThan(0);
    expect(workerPins.view.status).toBe('ready');
    expect(workerPins.view.counterpart).toBeNull();
  } finally { await teardown(root); }
});
