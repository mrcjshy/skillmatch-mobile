// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string): string => readFileSync(resolve('src', file), 'utf8');
const code = (file: string): string => source(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** The body of a top-level `function name(` up to the next top-level declaration. */
const fn = (text: string, name: string): string => {
  const start = text.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const end = rest.search(/\n(?:export )?(?:function|class|type|const) /);
  return end < 0 ? rest : rest.slice(0, end);
};

describe('Worker-to-Client live location (source contracts, not native proof)', () => {
  const map = code('components/booking-location-map.tsx');
  const details = source('components/booking-details.tsx');

  it('is one role-aware inline map in Booking Details, with no modal, trigger or close control', () => {
    expect(map).not.toMatch(/\bModal\b|Close map|onClose|ScrollView/);
    expect(details).not.toContain('Open live location pins');
    expect(details).not.toMatch(/pinsOpen|setPinsOpen/);
    expect(details).toMatch(/<BookingLocationMap[\s\S]{0,200}role=\{role\}/);
    expect(map).toMatch(/role === 'worker' \? <WorkerBookingMap \{\.\.\.props\} \/> : <ClientBookingMap \{\.\.\.props\} \/>/);
    // Both panels render the same map surface; tracking logic is not duplicated.
    expect(map.match(/<InlineMap /g)).toHaveLength(2);
  });

  it('the Client never collects GPS, shares or stops a share for this feature', () => {
    const client = fn(map, 'ClientBookingMap');
    expect(client).not.toMatch(/useLocationSharing|sharing\.|Share my location|Stop sharing|expo-location|watchPositionAsync/);
    expect(client).toMatch(/useBookingPins\(bookingId, accountId, 'client', null,/);
    expect(client).toContain("viewerRole: 'client'");
    expect(client).toContain('Refresh Worker location');
  });

  it('only the Worker shares, by the Share button, with its own Stop controls', () => {
    const worker = fn(map, 'WorkerBookingMap');
    expect(map.match(/useLocationSharing\(/g)).toHaveLength(1);
    expect(worker).toMatch(/useLocationSharing\(bookingId, accountId,/);
    expect(worker).toMatch(/useBookingPins\(bookingId, accountId, 'worker', sharing\.shareId,/);
    expect(map.match(/sharing\.start/g)).toHaveLength(1);
    expect(worker).toMatch(/label="Share my location"[^\n]*onPress=\{sharing\.start\}/);
    expect(worker).toContain('label="Stop sharing on this device"');
    expect(worker).toContain('label="Stop sharing on all devices"');
    // The Worker's map is fed no counterpart: a Client position is never drawn for the Worker.
    expect(worker).toContain("viewerRole: 'worker', destination, ownPosition: own, workerPin: null");
    expect(map).not.toMatch(/expo-location|watchPositionAsync/);
  });

  it('draws the dark job location and the blue Worker only: no Client marker, routes, lines, trails or ETA', () => {
    const label = code('components/map-pin-label.tsx');
    expect(label).toContain("export type MapPinKind = 'destination' | 'worker' | 'group';");
    expect(label).not.toMatch(/'client'/);
    for (const file of ['components/booking-location-map.tsx', 'lib/location-map-view.ts', 'components/map-pin-label.tsx']) {
      expect(code(file)).not.toMatch(/Polyline|LineLayer|ShapeSource|GeoJSON|\bRoute\b|directions|\bETA\b/);
    }
  });

  it('keeps every chip inside the frame with label- and font-scale-aware camera padding', () => {
    expect(map).toContain('const labels = markerPadding(PixelRatio.getFontScale());');
    // Chip padding plus the floating header (top) and the collapsed panel (bottom).
    expect(map).toContain('const padding = { ...labels, top: labels.top + insets.top, bottom: labels.bottom + insets.bottom };');
    expect(map).toMatch(/fitBounds\(frame\.bounds, \{ padding, duration: 400 \}\)/);
    expect(map).toMatch(/easeTo\(\{ center: frame\.center, zoom: frame\.zoom, padding, duration: 400 \}\)/);
    // No recentering on every small GPS movement.
    expect(map).toContain('if (!loaded || !camera.current || !needsReframe(framed.current, markers, viewKey)) return;');
    expect(code('components/map-pin-label.tsx')).toContain('maxWidth: MARKER_LABEL_MAX_WIDTH');
    expect(map).toContain('accessibilityLabel={mapAccessibilityLabel(markers)}');
  });

  it('a confirmed booking shows one map: the static destination map gives way to the inline map, address kept', () => {
    expect(details).toMatch(/const inlineMapShown = protectedReleased && booking\.booking_status === 'confirmed'/);
    expect(details).toMatch(/\{inlineMapShown && account \? <BookingLocationMap key=/);
    expect(details.match(/<BookingLocationMap /g)).toHaveLength(1);
    expect(details).toMatch(/<WorkerAssignedJobLocation [\s\S]{0,200}showMap=\{!inlineMapShown && !mapFirst\}/);
    expect(details).not.toMatch(/StaticJobMap/);
    const assigned = fn(code('components/job-location-map.tsx'), 'WorkerAssignedJobLocation');
    expect(assigned).toMatch(/\{!showMap \? null : surface\.showMap \? \(/);
    expect(assigned).toContain('{surface.address ? <Text style={styles.exactAddress}>{surface.address}</Text> : null}');
  });

  it('collects with High accuracy at the single, Worker-only watch site', () => {
    const hook = source('hooks/use-location-sharing.ts');
    expect(hook).toMatch(/Accuracy\.High/);
    expect(hook).not.toMatch(/Accuracy\.Balanced/);
    expect(hook.match(/watchPositionAsync/g)).toHaveLength(1);
    expect(hook).toContain('Worker-only');
  });

  it('labels the saved destination on the pre-match maps (Worker opportunity, Client job) and the static map', () => {
    for (const file of ['components/worker-job-location-map.tsx', 'components/job-location-map.tsx']) {
      expect(source(file)).toMatch(/<MapPinLabel kind="destination" label="Job location"/);
    }
  });

  it('map-first booking: one full-screen map that owns the panel, so its controls act on the same sharing session', () => {
    expect(map).toContain('renderPanel: (location: LocationPanel) => ReactNode;');
    expect(map.match(/\{renderPanel\(\{ primary, secondary \}\)\}/g)).toHaveLength(2);
    expect(map).toMatch(/<View style=\{\[StyleSheet\.absoluteFill, styles\.canvas\]\}><Map /);
    const worker = fn(map, 'WorkerBookingMap');
    // Stop stays in the always-visible (collapsed) part while sharing.
    const primary = worker.slice(worker.indexOf('const primary'), worker.indexOf('const secondary'));
    expect(primary).toContain('label="Stop sharing on this device" onPress={sharing.stop}');
    expect(primary).toContain('label="Share my location"');
    expect(fn(map, 'ClientBookingMap')).not.toMatch(/Share my location|Stop sharing|useLocationSharing/);
    // The map is still keyed to the booking session: leaving/backgrounding remounts it and ends sharing.
    expect(details).toContain('<BookingLocationMap key={`${account.id}:${booking.booking_id}:${pinsSession}`}');
    expect(details).toContain('insets={mapInsetsForPanel({ headerBottom, collapsedHeight: panelHeight })} renderPanel={panel}');
    expect(details).toContain('onCollapsedHeight={setPanelHeight}');
    expect(details).toContain("<Stack.Screen options={{ headerShown: false }} />");
  });

  it('the panel drags from its header only and never touches location or navigation', () => {
    const sheet = code('components/booking-sheet.tsx');
    expect(sheet).not.toMatch(/react-native-gesture-handler|react-native-reanimated|useLocationSharing|sharing\.|router|stopAll|retryStop/);
    expect(sheet).toContain('<View {...headerGesture.panHandlers} onLayout=');
    expect(sheet).toContain('onMoveShouldSetPanResponder: (_event, { dx, dy }) => isPanelDrag(dx, dy),');
    expect(sheet).not.toMatch(/onStartShouldSetPanResponder/);
    expect(sheet).toContain("accessibilityLabel={expanded ? 'Show map' : 'Show booking details'}");
    expect(sheet).toContain('pointerEvents="box-none"');
  });

  it('the immersive call keeps the session lifecycle, the React Compiler video fix and no token or identity in the UI', () => {
    const call = code('components/booking-video-call.tsx');
    expect(call.match(/'use no memo';/g)).toHaveLength(2);
    expect(call).toContain("return () => { focused.current = false; owner.current?.end(); setEnded(true); };");
    expect(call).toContain('return () => { mounted = false; subscription.remove(); unsubscribe(); session.end(); owner.current = null; };');
    expect(call).toContain("const finish = () => { setEnded(true); owner.current?.end(); };");
    expect(call).not.toMatch(/console\.|token|\.identity\}|participant\.name/);
    expect(call).toContain('local.setMicrophoneEnabled(!micOn)');
    expect(call).toContain('local.setCameraEnabled(!cameraOn)');
    // No extras from the reference apps.
    expect(call).not.toMatch(/screenShare|startRecording|BackgroundBlur|setProcessor|switchCamera|_switchCamera|addParticipant|takePhoto/i);
  });
});
