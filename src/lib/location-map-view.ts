/**
 * Presentation rules for the inline booking map. Pure so they can be tested;
 * the server remains the authority for who may see which coordinates.
 *
 * SkillMatch has two location concepts and the map shows only these:
 * - the job destination the Client pinned when posting the job (fixed);
 * - the Worker's live position, shared by the Worker's explicit choice after
 *   confirmation. A Worker sees their own position; the Client sees the
 *   Worker's authorized pin. The Client's own GPS is never part of this map.
 * No routes, lines, trails, distances or ETAs.
 */

import { distanceM, isApproximate, type Freshness, type Pin, type PinRole } from './location-pins';
import type { SharingState, SharingStatus } from './location-sharing';

type Point = { latitude: number; longitude: number };

export type MapMarkerKind = 'destination' | 'worker';
export type MapMarker = Point & { key: 'destination' | 'worker'; kind: MapMarkerKind; label: string; stale: boolean };

export function bookingMapMarkers({ viewerRole, destination, ownPosition, workerPin, freshness }: {
  viewerRole: PinRole; destination: Point | null;
  /** The Worker's own latest reading while sharing; ignored for a Client viewer. */
  ownPosition: Point | null;
  /** The authorized Worker pin read by a Client; ignored for a Worker viewer. */
  workerPin: Pin | null; freshness: Freshness;
}): MapMarker[] {
  const markers: MapMarker[] = destination ? [{ key: 'destination', kind: 'destination', label: 'Job location',
    latitude: destination.latitude, longitude: destination.longitude, stale: false }] : [];
  if (viewerRole === 'worker' && ownPosition) {
    markers.push({ key: 'worker', kind: 'worker', label: 'You · Worker',
      latitude: ownPosition.latitude, longitude: ownPosition.longitude, stale: false });
  }
  if (viewerRole === 'client' && workerPin?.role === 'worker' && freshness !== 'expired') {
    markers.push({ key: 'worker', kind: 'worker',
      label: `Worker · ${freshness === 'live' ? 'Live' : 'Last shared'}${isApproximate(workerPin.accuracyM) ? ' · Approximate' : ''}`,
      latitude: workerPin.latitude, longitude: workerPin.longitude, stale: freshness !== 'live' });
  }
  return markers;
}

/** Spoken summary of the markers: the chips themselves live inside the native map view. */
export function mapAccessibilityLabel(markers: MapMarker[]): string {
  return markers.length ? `Booking map showing ${markers.map(marker => marker.label).join(', ')}` : 'Booking map';
}

export type MapFrame = { center: [number, number]; zoom: number } | { bounds: [number, number, number, number] };
const SINGLE_POINT_M = 50;

/** Fits every marker on screen; markers within ~50 m are framed as one point. */
export function frameMarkers(points: Point[], fallback: [number, number]): MapFrame {
  if (points.length === 0) return { center: fallback, zoom: 15 };
  const lngs = points.map(point => point.longitude);
  const lats = points.map(point => point.latitude);
  const west = Math.min(...lngs); const east = Math.max(...lngs);
  const south = Math.min(...lats); const north = Math.max(...lats);
  if (distanceM({ latitude: south, longitude: west }, { latitude: north, longitude: east }) < SINGLE_POINT_M) {
    return { center: [(west + east) / 2, (south + north) / 2], zoom: 16 };
  }
  return { bounds: [west, south, east, north] };
}

/** Re-frame threshold: small GPS movements leave the camera where the user left it. */
export const REFRAME_MOVE_M = 75;
export type FramedMarkers = { identity: string; points: Record<string, Point> };

/**
 * Whether the camera should re-frame: the first frame, a marker appearing or
 * disappearing, a change of the visible map area (`viewKey`, e.g. the panel
 * height), or a marker moving at least REFRAME_MOVE_M from where it was framed.
 */
export function needsReframe(last: FramedMarkers | null, markers: MapMarker[], viewKey: string, thresholdM = REFRAME_MOVE_M): boolean {
  const identity = `${viewKey}|${markers.map(marker => marker.key).join(',')}`;
  if (!last || last.identity !== identity) return true;
  return markers.some(marker => {
    const framed = last.points[marker.key];
    return !framed || distanceM(framed, marker) >= thresholdM;
  });
}

export function framedMarkers(markers: MapMarker[], viewKey: string): FramedMarkers {
  return {
    identity: `${viewKey}|${markers.map(marker => marker.key).join(',')}`,
    points: Object.fromEntries(markers.map(marker => [marker.key, { latitude: marker.latitude, longitude: marker.longitude }])),
  };
}

/** Widest a marker chip may grow (pt); its text wraps to at most two lines. */
export const MARKER_LABEL_MAX_WIDTH = 160;
const LABEL_LINE_HEIGHT = 20;
/** Chip padding + border + dot below it, in pt (unscaled). */
const MARKER_CHROME = 28;

/**
 * Camera padding that keeps every chip inside the map frame. Markers are
 * anchored at the bottom of their dot and the chip is centred above it, so the
 * sides need half the widest chip and the top needs two scaled text lines.
 */
export function markerPadding(fontScale: number) {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const side = MARKER_LABEL_MAX_WIDTH / 2 + 8;
  return { top: Math.ceil(2 * LABEL_LINE_HEIGHT * scale + MARKER_CHROME + 12), right: side, bottom: 24, left: side };
}

const SHARING_COPY: Record<SharingStatus, string> = {
  off: 'Sharing is off',
  requesting: 'Starting location sharing…',
  sharing: 'Sharing your live location with the Client',
  paused: 'Sharing paused while this screen is not in use',
  moved: 'Sharing moved to your other device. Sharing is off here.',
  expired: 'Sharing timed out. Tap Share to start again.',
  ended: 'This booking no longer allows location sharing.',
  denied_request: 'Location permission was not allowed. Sharing is off.',
  denied_settings: 'Location permission is blocked. Allow it in settings, then tap Share.',
  services_off: 'Location is off or Location Accuracy was not turned on. Sharing is off; tap Share to try again.',
  error: 'Could not start location sharing. Sharing is off; tap Share to try again.',
};

/** The Worker's own sharing status. */
export function sharingStatusCopy(state: Pick<SharingState, 'status' | 'approximate'>): string {
  return `${SHARING_COPY[state.status]}${state.approximate && state.status === 'sharing' ? ' · Approximate' : ''}`;
}

/** What the Client knows about the Worker's position. */
export function workerLocationStatusCopy({ pinsStatus, freshness, hasWorkerPin }: {
  pinsStatus: 'idle' | 'loading' | 'ready' | 'denied' | 'error'; freshness: Freshness; hasWorkerPin: boolean;
}): string {
  if (pinsStatus === 'denied') return 'This booking no longer authorizes location access.';
  if (pinsStatus === 'error') return 'Could not refresh the Worker location. Expired positions are hidden.';
  if (hasWorkerPin && freshness === 'live') return 'Worker location: Live';
  if (hasWorkerPin && freshness === 'stale') return 'Worker location: Last shared (not live)';
  return 'Waiting for Worker location';
}
