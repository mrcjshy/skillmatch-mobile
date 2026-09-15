/**
 * R5E-M1 Client Job-location picker helpers.
 *
 * Coordinates are display/service-location data only. Matching remains
 * Skill 50 / Location 30 / Rating 20 on barangay/city. This module never
 * writes public.job_postings or private.job_locations directly.
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
