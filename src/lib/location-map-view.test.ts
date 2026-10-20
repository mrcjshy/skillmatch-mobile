import { describe, expect, it, vi } from 'vitest';

import {
  MARKER_LABEL_MAX_WIDTH, REFRAME_MOVE_M, bookingMapMarkers, frameMarkers, framedMarkers, mapAccessibilityLabel, markerPadding, needsReframe, sharingStatusCopy,
  workerLocationStatusCopy,
} from './location-map-view';
import { isSettingsUnsatisfied } from './location-sharing';
import { workerPinForViewer, type Pin, type PinsRead } from './location-pins';

vi.mock('./supabase', () => ({ supabase: {} }));

const destination = { latitude: 14.5445, longitude: 121.0682 };
const own = { latitude: 14.5442, longitude: 121.0679, accuracy: 12, timestampMs: 1 };
const worker: Pin = { role: 'worker', latitude: 14.5456, longitude: 121.0686, accuracyM: 5, receivedAt: '2026-10-15T00:00:00Z' };
const client: Pin = { role: 'client', latitude: 14.547, longitude: 121.0715, accuracyM: 20, receivedAt: '2026-10-15T00:00:00Z' };
const read = (counterpart: Pin | null): PinsRead =>
  ({ serverNow: '2026-10-15T00:00:10Z', leaseExpiresAt: '2026-10-15T00:01:10Z', myShare: 'none', counterpart });

describe('two location concepts: the job destination and the Worker live position', () => {
  it('Worker post-match: job destination plus the Worker’s own position, never a Client position', () => {
    expect(bookingMapMarkers({ viewerRole: 'worker', destination, ownPosition: own, workerPin: client, freshness: 'live' })).toEqual([
      { key: 'destination', kind: 'destination', label: 'Job location', latitude: 14.5445, longitude: 121.0682, stale: false },
      { key: 'worker', kind: 'worker', label: 'You · Worker', latitude: 14.5442, longitude: 121.0679, stale: false },
    ]);
  });

  it('Worker before sharing: job destination only', () => {
    expect(bookingMapMarkers({ viewerRole: 'worker', destination, ownPosition: null, workerPin: null, freshness: 'expired' }))
      .toEqual([expect.objectContaining({ kind: 'destination', label: 'Job location' })]);
  });

  it('Client post-match: job destination plus the authorized Worker pin; the Client’s own GPS is never drawn', () => {
    expect(bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: own, workerPin: worker, freshness: 'live' })).toEqual([
      expect.objectContaining({ kind: 'destination', label: 'Job location' }),
      { key: 'worker', kind: 'worker', label: 'Worker · Live', latitude: 14.5456, longitude: 121.0686, stale: false },
    ]);
  });

  it('Client: a stale Worker pin reads "last shared", approximate accuracy is flagged, an expired pin disappears', () => {
    expect(bookingMapMarkers({ viewerRole: 'client', destination: null, ownPosition: null, workerPin: { ...worker, accuracyM: 250 }, freshness: 'stale' }))
      .toEqual([expect.objectContaining({ kind: 'worker', label: 'Worker · Last shared · Approximate', stale: true })]);
    expect(bookingMapMarkers({ viewerRole: 'client', destination: null, ownPosition: null, workerPin: worker, freshness: 'expired' })).toEqual([]);
  });

  it('Client: a pin that is not the Worker’s is never drawn', () => {
    expect(bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: null, workerPin: client, freshness: 'live' }))
      .toEqual([expect.objectContaining({ kind: 'destination' })]);
  });

  it('only marker kinds are the dark job location and the blue Worker', () => {
    const kinds = new Set([
      ...bookingMapMarkers({ viewerRole: 'worker', destination, ownPosition: own, workerPin: client, freshness: 'live' }),
      ...bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: own, workerPin: worker, freshness: 'live' }),
    ].map(marker => marker.kind));
    expect([...kinds].sort()).toEqual(['destination', 'worker']);
  });

  it('summarises the markers for screen readers', () => {
    const markers = bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: null, workerPin: worker, freshness: 'live' });
    expect(mapAccessibilityLabel(markers)).toBe('Booking map showing Job location, Worker · Live');
    expect(mapAccessibilityLabel([])).toBe('Booking map');
  });
});

describe('read filter: a Worker never keeps a Client position', () => {
  it('drops any counterpart for a Worker viewer, even if an older server returns the Client', () => {
    expect(workerPinForViewer('worker', read(client)).counterpart).toBeNull();
    expect(workerPinForViewer('worker', read(worker)).counterpart).toBeNull();
  });

  it('keeps only a Worker pin for a Client viewer', () => {
    expect(workerPinForViewer('client', read(worker)).counterpart).toEqual(worker);
    expect(workerPinForViewer('client', read(client)).counterpart).toBeNull();
    expect(workerPinForViewer('client', read(null))).toEqual(read(null));
  });
});

describe('camera framing', () => {
  const fallback: [number, number] = [121.0716, 14.5471];

  it('centres on the fallback with no markers and on a single marker', () => {
    expect(frameMarkers([], fallback)).toEqual({ center: fallback, zoom: 15 });
    expect(frameMarkers([destination], fallback)).toEqual({ center: [121.0682, 14.5445], zoom: 16 });
  });

  it('fits the destination and the Worker within bounds, west-south-east-north', () => {
    expect(frameMarkers([destination, client], fallback)).toEqual({ bounds: [121.0682, 14.5445, 121.0715, 14.547] });
  });

  it('treats markers closer than ~50 m as one point instead of an extreme zoom', () => {
    expect(frameMarkers([destination, { latitude: 14.5446, longitude: 121.0683 }], fallback))
      .toEqual({ center: [expect.closeTo(121.06825, 6), expect.closeTo(14.54455, 6)], zoom: 16 });
  });
});

describe('camera re-framing', () => {
  const markers = (worker: { latitude: number; longitude: number } | null) =>
    bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: null, workerPin: worker ? { ...client, ...worker, role: 'worker' } : null, freshness: 'live' });

  it('frames first, then again only when a marker appears or disappears or the visible map area changes', () => {
    const start = markers(null);
    expect(needsReframe(null, start, '88:260')).toBe(true);
    const framed = framedMarkers(start, '88:260');
    expect(needsReframe(framed, start, '88:260')).toBe(false);
    expect(needsReframe(framed, markers({ latitude: 14.5456, longitude: 121.0686 }), '88:260')).toBe(true);
    expect(needsReframe(framed, start, '88:320')).toBe(true);
  });

  it('ignores small GPS movements and re-frames once the Worker moves far', () => {
    const near = markers({ latitude: 14.5456, longitude: 121.0686 });
    const framed = framedMarkers(near, 'v');
    // ~22 m: the camera stays where the user left it.
    expect(needsReframe(framed, markers({ latitude: 14.5458, longitude: 121.0686 }), 'v')).toBe(false);
    // ~110 m: re-frame so the pin stays in view.
    expect(needsReframe(framed, markers({ latitude: 14.5466, longitude: 121.0686 }), 'v')).toBe(true);
    expect(REFRAME_MOVE_M).toBe(75);
  });
});

describe('label clipping at the map edges', () => {
  // E2E 2026-10-15 (p6e): with 48 pt side padding a merged chip near the right edge was cut off.
  it('pads each side by at least half the widest chip, so a centred chip stays inside the frame', () => {
    const padding = markerPadding(1);
    expect(padding.left).toBeGreaterThanOrEqual(MARKER_LABEL_MAX_WIDTH / 2);
    expect(padding.right).toBeGreaterThanOrEqual(MARKER_LABEL_MAX_WIDTH / 2);
  });

  it('leaves room above the top marker for two lines of label text, growing with the font scale', () => {
    // Two 20 pt lines + 8 pt chip padding + 4 pt border + 16 pt dot.
    expect(markerPadding(1).top).toBeGreaterThanOrEqual(2 * 20 + 28);
    expect(markerPadding(1.3).top).toBeGreaterThanOrEqual(2 * 20 * 1.3 + 28);
    expect(markerPadding(1.3).top).toBeGreaterThan(markerPadding(1).top);
    expect(markerPadding(Number.NaN)).toEqual(markerPadding(1));
  });

  it('still leaves a usable framing area in the 320 pt map at 130% text', () => {
    const padding = markerPadding(1.3);
    expect(320 - padding.top - padding.bottom).toBeGreaterThanOrEqual(160);
    expect(360 - padding.left - padding.right).toBeGreaterThanOrEqual(160);
  });
});

describe('status copy', () => {
  it('describes every Worker sharing state, with the stopped state first', () => {
    expect(sharingStatusCopy({ status: 'off', approximate: false })).toBe('Sharing is off');
    expect(sharingStatusCopy({ status: 'sharing', approximate: false })).toBe('Sharing your live location with the Client');
    expect(sharingStatusCopy({ status: 'sharing', approximate: true })).toBe('Sharing your live location with the Client · Approximate');
    expect(sharingStatusCopy({ status: 'paused', approximate: false })).toBe('Sharing paused while this screen is not in use');
    expect(sharingStatusCopy({ status: 'denied_request', approximate: false })).toBe('Location permission was not allowed. Sharing is off.');
    expect(sharingStatusCopy({ status: 'services_off', approximate: false }))
      .toBe('Location is off or Location Accuracy was not turned on. Sharing is off; tap Share to try again.');
  });

  it('tells the Client whether the Worker location is waiting, live, last shared, denied or failed', () => {
    expect(workerLocationStatusCopy({ pinsStatus: 'ready', freshness: 'expired', hasWorkerPin: false })).toBe('Waiting for Worker location');
    expect(workerLocationStatusCopy({ pinsStatus: 'idle', freshness: 'expired', hasWorkerPin: false })).toBe('Waiting for Worker location');
    expect(workerLocationStatusCopy({ pinsStatus: 'ready', freshness: 'live', hasWorkerPin: true })).toBe('Worker location: Live');
    expect(workerLocationStatusCopy({ pinsStatus: 'ready', freshness: 'stale', hasWorkerPin: true })).toBe('Worker location: Last shared (not live)');
    expect(workerLocationStatusCopy({ pinsStatus: 'ready', freshness: 'expired', hasWorkerPin: true })).toBe('Waiting for Worker location');
    expect(workerLocationStatusCopy({ pinsStatus: 'denied', freshness: 'live', hasWorkerPin: true }))
      .toBe('This booking no longer authorizes location access.');
    expect(workerLocationStatusCopy({ pinsStatus: 'error', freshness: 'expired', hasWorkerPin: false }))
      .toBe('Could not refresh the Worker location. Expired positions are hidden.');
  });
});

it('recognises the Android Location Accuracy refusal from expo-location', () => {
  expect(isSettingsUnsatisfied({ code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' })).toBe(true);
  expect(isSettingsUnsatisfied(new Error('Location request failed due to unsatisfied device settings'))).toBe(true);
  expect(isSettingsUnsatisfied(new Error('Location request has been cancelled'))).toBe(false);
  expect(isSettingsUnsatisfied(null)).toBe(false);
});
