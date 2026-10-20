import { test, expect } from './runtime-tools.mjs';
import { openClientPicker } from './client-picker-navigation.mjs';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';

// Run each acceptance case in its own existing-session launch using the runtime
// runner's SKILLMATCH_RUNTIME_TEST_MATCH. No account/data reset or Job submission.
// One debugger connection for the whole recording. Reattaching Hermes between
// individual assertions was unstable in this installed development runtime.
let inspector;
let inspectorId = 0;
const inspectorPending = new Map();
async function inspectValue(expression) {
  if (!inspector) {
    const pages = await (await fetch('http://127.0.0.1:8081/json/list')).json();
    const page = pages.find(p => p.title.startsWith('com.mrcjshy.skillmatch'));
    if (!page) throw new Error('Existing native development client unavailable');
    inspector = new WebSocket(page.webSocketDebuggerUrl, { origin: 'http://127.0.0.1:8081' });
    inspector.on('message', bytes => {
      const reply = JSON.parse(bytes), pending = inspectorPending.get(reply.id);
      if (!pending) return;
      inspectorPending.delete(reply.id); clearTimeout(pending.timer);
      if (reply.error || reply.result?.exceptionDetails) pending.reject(new Error('Native read failed: ' + JSON.stringify(reply.error ?? reply.result.exceptionDetails)));
      else pending.resolve(JSON.parse(reply.result.result.value));
    });
    await new Promise((resolve, reject) => { inspector.once('open', resolve); inspector.once('error', reject); });
    inspector._socket.unref();
    process.once('beforeExit', () => inspector.close());
  }
  const id = ++inspectorId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { inspectorPending.delete(id); reject(new Error('Native read timeout')); }, 10000);
    inspectorPending.set(id, { resolve, reject, timer });
    inspector.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
}

// Read-only React Native DevTools inspection of the visible Client picker.
// This does not call a selection handler or substitute native map geometry.
// It returns only the current public test point, not account/session/address data.
async function inspectPicker(body) {
  const expression = `JSON.stringify((() => {
    const hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    function find(node, predicate) {
      if (!node) return null;
      if (predicate(node)) return node;
      return find(node.child, predicate) || find(node.sibling, predicate);
    }
    let picker;
    for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
      picker = find(root.current, node => node.type?.name === 'JobLocationPicker');
      if (picker) break;
    }
    if (!picker) throw new Error('Visible picker not mounted');
    const states = [];
    for (let h = picker.memoizedState; h; h = h.next) states.push(h.memoizedState);
    const state = states.find(s => s && typeof s === 'object' && 'rawPin' in s && 'generation' in s);
    if (!state) throw new Error('Native picker state unavailable');
    ${body}
  })())`;
  return inspectValue(expression);
}

async function readNativePicker() {
  return inspectPicker(`return { raw: state.rawPin, effective: state.pin, label: state.feature?.label ?? null,
      fontScale: states.find(s => s && typeof s.fontScale === 'number')?.fontScale,
      kind: state.feature?.mapped?.kind ?? null, origin: state.origin, status: state.status,
      error: state.error, nearby: state.nearby.map(p => ({ id: p.id, label: p.label })),
      generation: state.generation, feature: state.feature?.mapped ? { id: state.feature.mapped.id,
        distanceMeters: state.feature.mapped.distanceMeters, distancePoints: state.feature.mapped.distancePx,
        coordinateKind: state.feature.mapped.coordinateKind } : null };`);
}

test('magnetic Client role and real map preflight', async fixtures => {
  const { screen, app } = fixtures;
  await expect(screen.getByRole('button', 'Post a job')).toBeEnabled({ timeout: 120000 });
  console.log('ACTIVE_CLIENT_HOME_VERIFIED', true);
  await openClientPicker(fixtures);
  await app.screenshot('magnetic-preflight-real-picker');
});

function metresBetween(a, b) {
  const r = Math.PI / 180;
  const x = (b.longitude - a.longitude) * r;
  const y = (b.latitude - a.latitude) * r;
  const h = Math.sin(y / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(x / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function assertAutomatic(screen, kind) {
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 15000 });
  await expect(screen.getByText(/^Adjusted to /)).toBeVisible();
  const selected = await readNativePicker();
  expect(selected.origin).toBe('manual');
  expect(selected.kind).toBe(kind);
  expect(selected.effective).not.toEqual(selected.raw);
  const displacement = metresBetween(selected.raw, selected.effective);
  expect(displacement).toBeGreaterThan(0.1);
  expect(displacement).toBeLessThanOrEqual(kind === 'street' ? 20 : 40);
  expect(selected.feature.distancePoints).toBeGreaterThanOrEqual(0.5);
  expect(selected.feature.distancePoints).toBeLessThanOrEqual(kind === 'street' ? 40 : 60);
  expect(await screen.getByText(selected.label, { exact: true }).count()).toBe(2);
  await expect(screen.getByText('Step 1 of 4')).not.toBeVisible();
  await measurePinProjection();
  console.log('AUTOMATIC_PUBLIC_POINT', JSON.stringify({ ...selected, measuredDisplacementMeters: displacement }));
  return selected;
}

async function assertExactAndReopen(screen, app, selected, prefix) {
  const exactAction = screen.getByRole('button', 'Use exact pin instead');
  if (!(await exactAction.isVisible())) await screen.scrollUntilVisible(exactAction);
  await exactAction.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  const exact = await readNativePicker();
  expect(exact.effective).toEqual(selected.raw);
  expect(exact.raw).toEqual(selected.raw);
  expect(exact.feature).toBe(null);
  await app.screenshot(prefix + '-exact-override');
  await new Promise(resolve => setTimeout(resolve, 500));
  expect((await readNativePicker()).effective).toEqual(selected.raw);
  console.log('EXACT_RESTORATION_NUMERICALLY_EQUAL', prefix, true);
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  expect((await readNativePicker()).effective).toEqual(selected.raw);
  await app.screenshot(prefix + '-exact-reopened');
  console.log('CONFIRM_REOPEN_NUMERICALLY_EQUAL', prefix, true);
}

test('magnetic acceptance continuous POI street exact and assisted confirmation', async fixtures => {
  const { screen, app } = fixtures;
  await openClientPicker(fixtures);
  await app.screenshot('magnetic-a-public-start');
  await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 440, y: 900 } });
  const poi = await assertAutomatic(screen, 'poi');
  await app.screenshot('magnetic-b-automatic-poi');
  await assertExactAndReopen(screen, app, poi, 'magnetic-c-poi');
  await screen.swipe({ from: { x: 540, y: 1050 }, to: { x: 660, y: 1200 } });
  const street = await assertAutomatic(screen, 'street');
  await app.screenshot('magnetic-d-automatic-street');
  await assertExactAndReopen(screen, app, street, 'magnetic-e-street');
  await screen.swipe({ from: { x: 540, y: 1050 }, to: { x: 525, y: 1050 } });
  const assisted = await assertAutomatic(screen, 'street');
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  expect((await readNativePicker()).effective).toEqual(assisted.effective);
  console.log('ASSISTED_CONFIRM_REOPEN_NUMERICALLY_EQUAL', true);
  await app.screenshot('magnetic-f-assisted-reopened');
  await screen.swipe({ from: { x: 540, y: 1050 }, to: { x: 440, y: 935 } });
  await assertAutomatic(screen, 'poi');
  await app.screenshot('magnetic-g-settled-for-review');
});

// Supplemental native fault fixture. Real POI/street acceptance above never
// uses this. It delays the existing native query's reply, then restores it.
async function delayNativeQuery(enabled) {
  return inspectPicker(enabled ? `
    const ref = states.find(s => s?.current?.queryRenderedFeatures && s.current.project);
    if (!ref) throw new Error('Native map ref unavailable');
    const fixture = { ref, current: ref.current, descriptor: Object.getOwnPropertyDescriptor(ref, 'current'), calls: 0, replies: 0 };
    globalThis.__magneticQueryFixture = fixture;
    // MapLibre renews its imperative handle on render; keep the fixture attached
    // to the existing ref across those normal renders, without changing handlers.
    Object.defineProperty(ref, 'current', { configurable: true, get() {
      return fixture.current && new Proxy(fixture.current, { get(target, key) {
        if (key !== 'queryRenderedFeatures') return target[key];
        return (...args) => {
          fixture.calls++;
          return target.queryRenderedFeatures(...args).then(result => new Promise(resolve => setTimeout(() => {
            fixture.replies++; resolve(result);
          }, 3500)));
        };
      } });
    }, set(value) { fixture.current = value; } });
    return true;` : `
    const fixture = globalThis.__magneticQueryFixture;
    if (!fixture) return null;
    Object.defineProperty(fixture.ref, 'current', { ...fixture.descriptor, value: fixture.current });
    delete globalThis.__magneticQueryFixture;
    return { calls: fixture.calls, replies: fixture.replies };`);
}

test('magnetic supplemental native timeout rapid drags sparse data and geofence', async fixtures => {
  const { screen, app } = fixtures;
  await openClientPicker(fixtures);
  await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 440, y: 900 } });
  const first = await assertAutomatic(screen, 'poi');
  expect(first.nearby.length).toBeGreaterThan(1);
  expect(new Set(first.nearby.map(p => p.id)).size).toBe(first.nearby.length);
  await new Promise(resolve => setTimeout(resolve, 500));
  expect((await readNativePicker()).feature.id).toBe(first.feature.id);
  console.log('REAL_CLOSE_ALTERNATIVES_STABLE', JSON.stringify(first.nearby));
  await app.screenshot('magnetic-close-named-alternatives');

  await delayNativeQuery(true);
  try {
    await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 570, y: 1000 } });
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 5000 });
    const settled = await readNativePicker();
    expect(settled.effective).toEqual(settled.raw);
    expect(settled.feature).toBe(null);
    await new Promise(resolve => setTimeout(resolve, 3700));
    expect(await readNativePicker()).toEqual(settled);
    await app.screenshot('magnetic-query-timeout-keeps-raw');
    console.log('NATIVE_TIMEOUT_LATE_REPLY_CANNOT_MOVE_OR_RELABEL', true);

    // A second deliberate gesture begins while the prior reply is still pending.
    await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 510, y: 1000 } });
    await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 565, y: 1020 } });
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 5000 });
    const newest = await readNativePicker();
    expect(newest.generation).toBeGreaterThan(settled.generation);
    expect(newest.effective).toEqual(newest.raw);
    expect(newest.raw).not.toEqual(settled.raw);
    await new Promise(resolve => setTimeout(resolve, 3700));
    expect(await readNativePicker()).toEqual(newest);
    await app.screenshot('magnetic-rapid-drags-keep-newest');
    console.log('NATIVE_NEW_DRAG_REJECTS_OLD_DELAYED_DECISION', true);
  } finally { console.log('NATIVE_QUERY_FIXTURE_RESTORED', JSON.stringify(await delayNativeQuery(false))); }

  let sparse;
  for (const to of [{ x: 350, y: 780 }, { x: 540, y: 950 }, { x: 600, y: 980 }]) {
    await screen.swipe({ from: { x: 540, y: 1050 }, to });
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
    sparse = await readNativePicker();
    console.log('REAL_SPARSE_DATA_POINT', JSON.stringify(sparse));
    if (!sparse.feature) break;
  }
  expect(sparse.feature).toBe(null);
  expect(sparse.effective).toEqual(sparse.raw);
  await app.screenshot('magnetic-real-no-qualifying-candidate');

  let edge;
  for (let i = 0; i < 7; i++) {
    await screen.swipe({ from: { x: 540, y: 700 }, to: { x: 540, y: 950 } });
    await new Promise(resolve => setTimeout(resolve, 900));
    edge = await readNativePicker();
    if (edge.error === 'outside') break;
  }
  expect(edge.error).toBe('outside');
  expect(edge.effective).toEqual(edge.raw);
  expect(edge.feature).toBe(null);
  await expect(screen.getByRole('button', 'Confirm location')).toBeDisabled();
  await expect(screen.getByText('This location is outside Barangay Santa Ana.')).toBeVisible();
  console.log('REAL_OUTSIDE_EDGE_NOT_MOVED_INWARD', JSON.stringify(edge.raw));
  await app.screenshot('magnetic-real-outside-edge');
});

async function observeCamera(enabled) {
  return inspectPicker(enabled ? `
    const ref = states.find(s => s?.current?.easeTo && !s.current.project);
    if (!ref) throw new Error('Native camera ref unavailable');
    const fixture = { ref, current: ref.current, descriptor: Object.getOwnPropertyDescriptor(ref, 'current'), calls: [] };
    globalThis.__magneticCameraObservation = fixture;
    Object.defineProperty(ref, 'current', { configurable: true, get() {
      return fixture.current && new Proxy(fixture.current, { get(target, key) {
        if (key !== 'easeTo') return target[key];
        return options => { fixture.calls.push(options); return target.easeTo(options); };
      } });
    }, set(value) { fixture.current = value; } });
    return true;` : `
    const fixture = globalThis.__magneticCameraObservation;
    Object.defineProperty(fixture.ref, 'current', { ...fixture.descriptor, value: fixture.current });
    delete globalThis.__magneticCameraObservation;
    return fixture.calls;`);
}

async function measurePinProjection() {
  await inspectPicker(`
    const map = states.find(s => s?.current?.queryRenderedFeatures && s.current.project)?.current;
    const size = states.find(s => s && typeof s.width === 'number' && typeof s.height === 'number');
    const overlay = find(picker.child, node => node.memoizedProps?.testID === 'service-location-center-pin');
    const target = [size.width / 2, overlay.memoizedProps.style.top];
    globalThis.__magneticProjection = null;
    map.project([state.pin.longitude, state.pin.latitude]).then(projected => {
      globalThis.__magneticProjection = { target, projected };
    });
    return true;`);
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await inspectValue('JSON.stringify(globalThis.__magneticProjection)');
    if (result) {
      expect(Math.hypot(result.target[0] - result.projected[0], result.target[1] - result.projected[1])).toBeLessThan(1.5);
      console.log('NATIVE_EFFECTIVE_POINT_AT_PIN_TIP_LOGICAL_POINTS', JSON.stringify(result));
      return;
    }
  }
  throw new Error('Native projection did not answer');
}

test('magnetic font motion projection and exact foreground acceptance', async fixtures => {
  const { screen, app } = fixtures;
  await openClientPicker(fixtures);
  await observeCamera(true);
  let selected;
  try {
    await screen.swipe({ from: { x: 540, y: 1000 }, to: { x: 440, y: 900 } });
    selected = await assertAutomatic(screen, 'poi');
    expect(Math.abs(selected.fontScale - Number(process.env.MAGNETIC_EXPECT_FONT_SCALE ?? 1))).toBeLessThan(0.001);
  } finally {
    const calls = await observeCamera(false);
    const assisted = calls.filter(call => call.center[0] === selected?.effective.longitude && call.center[1] === selected?.effective.latitude);
    expect(assisted.length).toBeGreaterThan(0);
    expect(assisted.some(call => call.duration === Number(process.env.MAGNETIC_EXPECT_DURATION ?? 200))).toBe(true);
    expect(assisted.every(call => call.zoom === undefined)).toBe(true);
    console.log('NATIVE_ASSISTED_CAMERA_CALLS', JSON.stringify(assisted));
  }
  const cta = await screen.getByRole('button', 'Confirm location').boundingBox();
  expect(cta.y + cta.height).toBeLessThan(2400);
  const exactAction = screen.getByRole('button', 'Use exact pin instead');
  if (!(await exactAction.isVisible())) await screen.scrollUntilVisible(exactAction);
  const exactBox = await exactAction.boundingBox();
  if (selected.fontScale > 1.2 || exactBox.y + exactBox.height > cta.y) {
    await screen.swipe({ from: { x: 800, y: 2000 }, to: { x: 800, y: 1750 } });
  }
  const reachable = await exactAction.boundingBox();
  expect(reachable.y + reachable.height).toBeLessThanOrEqual(cta.y);
  await expect(exactAction).toBeVisible();
  await app.screenshot('magnetic-font-motion-assisted-reachable');
  await exactAction.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  expect((await readNativePicker()).effective).toEqual(selected.raw);
  execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'input', 'keyevent', '3'], { windowsHide: true });
  execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'am', 'start', '-n', 'com.mrcjshy.skillmatch/.MainActivity'], { windowsHide: true });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  expect((await readNativePicker()).effective).toEqual(selected.raw);
  expect((await readNativePicker()).feature).toBe(null);
  console.log('EXACT_OVERRIDE_SURVIVES_NATIVE_FOREGROUND', true);
  await app.screenshot('magnetic-font-motion-exact-foreground');
});
