/**
 * R5E-M1 Client Job-location picker helpers and R5E-M2 Worker presentation.
 *
 * Coordinates are display/service-location data only. Matching remains
 * Skill 50 / Location 30 / Rating 20 on barangay/city. This module never
 * writes public.job_postings or private.job_locations directly.
 * Pre-accept Workers use get_job_approximate_area only. Exact pin access
 * uses get_authorized_job_location only.
 */

import { supabase } from './supabase';
import type { JobPaymentMethod } from './job-payment';

/**
 * OSM relation 5347085 — Santa Ana, Pateros, Metro Manila.
 * Nominatim centroid 14.5470774, 121.0716472; bounding box
 * south 14.5402984, north 14.5489113, west 121.0671769, east 121.0784336.
 * UI guidance only. Not a matching rule, Worker Zone, or default Job pin.
 */
export const SANTA_ANA_PATEROS_DISPLAY_REGION = {
  latitude: 14.5470774,
  longitude: 121.0716472,
  latitudeDelta: 0.012,
  longitudeDelta: 0.016,
} as const;

export type JobPin = { latitude: number; longitude: number };

export type ForegroundPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type CurrentLocationDecision =
  | { action: 'request' }
  | { action: 'use-current' }
  | { action: 'explain-denied' };

export type MapAvailability = 'ready' | 'unavailable';

export type PostingPinState = 'unset' | 'selected';

export class JobLocationError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'JobLocationError';
    this.code = code;
  }
}

const FORBIDDEN = '42501';
const INVALID_INPUT = '22023';

export const COPY = {
  missingAddress: 'Please enter a house, street, or landmark.',
  missingPin: 'Please select a location on the map.',
  invalidPin: 'Please select a valid location on the map.',
  permissionDenied:
    'Location permission is off. You can still tap the map to place the Job pin.',
  locationUnavailable: "Couldn't read your current location. Place the pin on the map instead.",
  mapUnavailable: 'Map is unavailable. You can still enter the address, but posting needs a selected pin.',
  forbidden: "You don't have permission to post a job.",
  invalid: 'Check the job details and selected location, then try again.',
  generic: "Couldn't post your job. Please try again.",
  useCurrentLocation: 'Use Current Location',
  approximateHeading: 'Approximate Job Area',
  approximateCopy:
    'Approximate Job area. Exact location becomes available after acceptance.',
  workerMapUnavailable: 'Map is unavailable. The general area is still shown as text.',
  workerLocationUnavailable: 'This job location is not available.',
  workerLocationGeneric: "Couldn't load the job location. Please try again.",
  openInMaps: 'Open in Maps',
  openInMapsFailed: "Couldn't open Maps.",
} as const;

export type ApproximateJobArea = {
  jobId: string;
  barangay: string | null;
  city: string | null;
  approximateAreaKey: string;
};

export type AuthorizedJobLocation = {
  jobId: string;
  address: string | null;
  pin: JobPin | null;
  barangay: string | null;
  city: string | null;
};

export type WorkerLocationSurface =
  | {
      kind: 'approximate';
      heading: typeof COPY.approximateHeading;
      copy: typeof COPY.approximateCopy;
      barangay: string | null;
      city: string | null;
      mapRegion: typeof SANTA_ANA_PATEROS_DISPLAY_REGION;
      pin: null;
      address: null;
      openInMapsUrl: null;
      showMap: boolean;
    }
  | {
      kind: 'exact';
      address: string | null;
      pin: JobPin;
      barangay: string | null;
      city: string | null;
      openInMapsUrl: string;
      showMap: boolean;
    }
  | {
      kind: 'text-fallback';
      address: string | null;
      barangay: string | null;
      city: string | null;
      pin: null;
      openInMapsUrl: null;
      showMap: false;
    }
  | {
      kind: 'suppressed';
      pin: null;
      address: null;
      openInMapsUrl: null;
      showMap: false;
    }
  | {
      kind: 'unavailable';
      pin: null;
      address: null;
      openInMapsUrl: null;
      showMap: false;
    };

const CLOSED_SURFACE = {
  pin: null,
  address: null,
  openInMapsUrl: null,
  showMap: false,
} as const;

export function initialJobPin(): JobPin | null {
  return null;
}

export function postingPinState(pin: JobPin | null): PostingPinState {
  if (pin === null) return 'unset';
  return isValidJobCoordinate(pin.latitude, pin.longitude) ? 'selected' : 'unset';
}

export function isValidJobCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

export function postingLocationError(address: string, pin: JobPin | null): string | null {
  if (address.trim().length === 0) return COPY.missingAddress;
  if (pin === null) return COPY.missingPin;
  if (!isValidJobCoordinate(pin.latitude, pin.longitude)) return COPY.invalidPin;
  return null;
}

export function classifyForegroundPermission(status: string): ForegroundPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

export function decideCurrentLocationAction(
  status: ForegroundPermissionStatus
): CurrentLocationDecision {
  if (status === 'undetermined') return { action: 'request' };
  if (status === 'granted') return { action: 'use-current' };
  return { action: 'explain-denied' };
}

export function classifyMapAvailability(nativeLoaded: boolean): MapAvailability {
  return nativeLoaded ? 'ready' : 'unavailable';
}

export type ForegroundLocationLike = {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: () => Promise<{ coords: { latitude: number; longitude: number } }>;
};

export type CurrentLocationPinResult =
  | { kind: 'pin'; pin: JobPin }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'invalid' };

export async function resolveCurrentLocationPin(
  location: ForegroundLocationLike
): Promise<CurrentLocationPinResult> {
  const current = classifyForegroundPermission(
    (await location.getForegroundPermissionsAsync()).status
  );
  const decision = decideCurrentLocationAction(current);
  if (decision.action === 'explain-denied') return { kind: 'denied' };
  if (decision.action === 'request') {
    const requested = classifyForegroundPermission(
      (await location.requestForegroundPermissionsAsync()).status
    );
    if (requested !== 'granted') return { kind: 'denied' };
  }
  try {
    const position = await location.getCurrentPositionAsync();
    const pin = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    if (!isValidJobCoordinate(pin.latitude, pin.longitude)) return { kind: 'invalid' };
    return { kind: 'pin', pin };
  } catch {
    return { kind: 'unavailable' };
  }
}

function codeOf(error: unknown): string | null {
  return error instanceof JobLocationError ? error.code : null;
}

export function createJobLocationErrorCopy(error: unknown): string {
  const code = codeOf(error);
  if (code === FORBIDDEN) return COPY.forbidden;
  if (code === INVALID_INPUT) return COPY.invalid;
  return COPY.generic;
}

const CLOSED = 'SM409';

export function createWorkerLocationErrorCopy(error: unknown): string {
  const code = codeOf(error);
  if (code === FORBIDDEN || code === CLOSED) return COPY.workerLocationUnavailable;
  return COPY.workerLocationGeneric;
}

export function mapRegionForApproximateArea(_areaKey: string) {
  return SANTA_ANA_PATEROS_DISPLAY_REGION;
}

export function authorizedMapsNavigationUrl(pin: JobPin | null): string | null {
  if (pin === null || !isValidJobCoordinate(pin.latitude, pin.longitude)) return null;
  return `geo:${pin.latitude},${pin.longitude}?q=${pin.latitude},${pin.longitude}`;
}

export function projectPreAcceptWorkerLocation(
  area: ApproximateJobArea | null,
  mapAvailable: MapAvailability
): WorkerLocationSurface {
  if (area === null) {
    return { kind: 'unavailable', ...CLOSED_SURFACE };
  }
  return {
    kind: 'approximate',
    heading: COPY.approximateHeading,
    copy: COPY.approximateCopy,
    barangay: area.barangay,
    city: area.city,
    mapRegion: mapRegionForApproximateArea(area.approximateAreaKey),
    pin: null,
    address: null,
    openInMapsUrl: null,
    showMap: mapAvailable === 'ready',
  };
}

export function projectAssignedWorkerLocation(input: {
  bookingStatus: string;
  exact: AuthorizedJobLocation | null;
  mapAvailable: MapAvailability;
}): WorkerLocationSurface {
  if (input.bookingStatus !== 'confirmed') {
    return { kind: 'suppressed', ...CLOSED_SURFACE };
  }
  if (input.exact === null) {
    return { kind: 'unavailable', ...CLOSED_SURFACE };
  }
  const url = authorizedMapsNavigationUrl(input.exact.pin);
  if (input.exact.pin === null || url === null) {
    return {
      kind: 'text-fallback',
      address: input.exact.address,
      barangay: input.exact.barangay,
      city: input.exact.city,
      pin: null,
      openInMapsUrl: null,
      showMap: false,
    };
  }
  return {
    kind: 'exact',
    address: input.exact.address,
    pin: input.exact.pin,
    barangay: input.exact.barangay,
    city: input.exact.city,
    openInMapsUrl: url,
    showMap: input.mapAvailable === 'ready',
  };
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(data) ? data : data !== null && data !== undefined ? [data] : [];
  const row = rows[0];
  if (typeof row !== 'object' || row === null) return null;
  return row as Record<string, unknown>;
}

function toOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toOptionalCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function getJobApproximateArea(jobId: string): Promise<ApproximateJobArea> {
  const res = await supabase.rpc('get_job_approximate_area', { p_job_id: jobId });
  if (res.error) {
    throw new JobLocationError(res.error.message || COPY.workerLocationGeneric, res.error.code ?? null);
  }
  const row = firstRpcRow(res.data);
  if (row === null) {
    throw new JobLocationError(COPY.workerLocationGeneric, null);
  }
  const id = typeof row.job_id === 'string' ? row.job_id : null;
  const key = typeof row.approximate_area_key === 'string' ? row.approximate_area_key : null;
  if (id === null || key === null) {
    throw new JobLocationError(COPY.workerLocationGeneric, null);
  }
  return {
    jobId: id,
    barangay: toOptionalText(row.barangay),
    city: toOptionalText(row.city),
    approximateAreaKey: key,
  };
}

export async function getAuthorizedJobLocation(jobId: string): Promise<AuthorizedJobLocation> {
  const res = await supabase.rpc('get_authorized_job_location', { p_job_id: jobId });
  if (res.error) {
    throw new JobLocationError(res.error.message || COPY.workerLocationGeneric, res.error.code ?? null);
  }
  const row = firstRpcRow(res.data);
  if (row === null) {
    throw new JobLocationError(COPY.workerLocationGeneric, null);
  }
  const id = typeof row.job_id === 'string' ? row.job_id : null;
  if (id === null) {
    throw new JobLocationError(COPY.workerLocationGeneric, null);
  }
  const latitude = toOptionalCoordinate(row.latitude);
  const longitude = toOptionalCoordinate(row.longitude);
  const pin =
    latitude !== null && longitude !== null && isValidJobCoordinate(latitude, longitude)
      ? { latitude, longitude }
      : null;
  return {
    jobId: id,
    address: toOptionalText(row.address),
    pin,
    barangay: toOptionalText(row.barangay),
    city: toOptionalText(row.city),
  };
}

export type CreateMyJobWithLocationInput = {
  title: string;
  description: string;
  address: string;
  scheduledAt: string;
  budget: number | null;
  paymentMethod: JobPaymentMethod;
  skillIds: string[];
  latitude: number;
  longitude: number;
};

export async function createMyJobWithLocation(input: CreateMyJobWithLocationInput): Promise<string> {
  const res = await supabase.rpc('create_my_job_with_location', {
    p_title: input.title,
    p_description: input.description,
    p_address: input.address,
    p_scheduled_at: input.scheduledAt,
    p_budget: input.budget,
    p_payment_method: input.paymentMethod,
    p_skill_ids: input.skillIds,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  });
  if (res.error) {
    throw new JobLocationError(res.error.message || COPY.generic, res.error.code ?? null);
  }
  if (typeof res.data !== 'string' || res.data.length === 0) {
    throw new JobLocationError(COPY.generic, null);
  }
  return res.data;
}
