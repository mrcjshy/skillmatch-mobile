import { describe, expect, it, vi, beforeEach } from 'vitest';

import { supabase } from './supabase';
import {
  JobLocationError,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  classifyForegroundPermission,
  classifyMapAvailability,
  createJobLocationErrorCopy,
  createMyJobWithLocation,
  decideCurrentLocationAction,
  initialJobPin,
  isValidJobCoordinate,
  postingLocationError,
  postingPinState,
  resolveCurrentLocationPin,
  type ForegroundLocationLike,
} from './job-location';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

const rpc = vi.mocked(supabase.rpc);
const from = vi.mocked(supabase.from);

describe('general Santa Ana / Pateros map region', () => {
  it('centers the display region on the OSM Santa Ana, Pateros administrative centroid', () => {
    // Nominatim / OSM relation 5347085 (Santa Ana, Pateros, Metro Manila).
    expect(SANTA_ANA_PATEROS_DISPLAY_REGION.latitude).toBe(14.5470774);
    expect(SANTA_ANA_PATEROS_DISPLAY_REGION.longitude).toBe(121.0716472);
  });

  it('covers the OSM Santa Ana bounding box without treating the center as a Job pin', () => {
    // Nominatim boundingbox: south, north, west, east.
    expect(SANTA_ANA_PATEROS_DISPLAY_REGION.latitudeDelta).toBeGreaterThanOrEqual(0.0086129);
    expect(SANTA_ANA_PATEROS_DISPLAY_REGION.longitudeDelta).toBeGreaterThanOrEqual(0.0112567);
    expect(initialJobPin()).toBeNull();
    expect(postingPinState(initialJobPin())).toBe('unset');
  });
});

describe('coordinate validation', () => {
  it('accepts a finite in-range Job pin', () => {
    expect(isValidJobCoordinate(14.5470774, 121.0716472)).toBe(true);
    expect(postingPinState({ latitude: 14.5470774, longitude: 121.0716472 })).toBe('selected');
  });

  it('rejects unset, nonfinite, and out-of-range coordinates', () => {
    expect(isValidJobCoordinate(null, 121.07)).toBe(false);
    expect(isValidJobCoordinate(14.55, null)).toBe(false);
    expect(isValidJobCoordinate(Number.NaN, 121.07)).toBe(false);
    expect(isValidJobCoordinate(14.55, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidJobCoordinate(95, 121.07)).toBe(false);
    expect(isValidJobCoordinate(-91, 121.07)).toBe(false);
    expect(isValidJobCoordinate(14.55, 181)).toBe(false);
    expect(isValidJobCoordinate(14.55, -181)).toBe(false);
  });
});

describe('posting location validation', () => {
  it('requires both a manual address and a selected exact pin', () => {
    expect(postingLocationError('', { latitude: 14.5470774, longitude: 121.0716472 })).toBe(
      'Please enter a house, street, or landmark.'
    );
    expect(postingLocationError('   ', { latitude: 14.5470774, longitude: 121.0716472 })).toBe(
      'Please enter a house, street, or landmark.'
    );
    expect(postingLocationError('123 Test Street', null)).toBe(
      'Please select a location on the map.'
    );
    expect(postingLocationError('123 Test Street', { latitude: Number.NaN, longitude: 121.07 })).toBe(
      'Please select a valid location on the map.'
    );
    expect(postingLocationError('123 Test Street', { latitude: 14.5470774, longitude: 121.0716472 })).toBeNull();
  });
});

describe('foreground current-location permission mapping', () => {
  it('requests permission only when it is still undetermined', () => {
    expect(classifyForegroundPermission('undetermined')).toBe('undetermined');
    expect(decideCurrentLocationAction('undetermined')).toEqual({ action: 'request' });
  });

  it('uses the current position when foreground permission is already granted', () => {
    expect(classifyForegroundPermission('granted')).toBe('granted');
    expect(decideCurrentLocationAction('granted')).toEqual({ action: 'use-current' });
  });

  it('explains denial without requesting again', () => {
    expect(classifyForegroundPermission('denied')).toBe('denied');
    expect(classifyForegroundPermission('blocked')).toBe('denied');
    expect(decideCurrentLocationAction('denied')).toEqual({ action: 'explain-denied' });
  });
});

describe('resolveCurrentLocationPin', () => {
  function fakeLocation(options: {
    status: string;
    afterRequest?: string;
    coords?: { latitude: number; longitude: number };
    positionError?: boolean;
  }): ForegroundLocationLike & { requests: number; reads: number } {
    let status = options.status;
    const location = {
      requests: 0,
      reads: 0,
      async getForegroundPermissionsAsync() {
        return { status };
      },
      async requestForegroundPermissionsAsync() {
        location.requests += 1;
        status = options.afterRequest ?? 'granted';
        return { status };
      },
      async getCurrentPositionAsync() {
        location.reads += 1;
        if (options.positionError) throw new Error('unavailable');
        const coords = options.coords ?? { latitude: 14.546, longitude: 121.07 };
        return { coords };
      },
    };
    return location;
  }

  it('does not request permission when it is already denied', async () => {
    const location = fakeLocation({ status: 'denied' });
    await expect(resolveCurrentLocationPin(location)).resolves.toEqual({ kind: 'denied' });
    expect(location.requests).toBe(0);
    expect(location.reads).toBe(0);
  });

  it('requests once when undetermined and then places the pin', async () => {
    const location = fakeLocation({
      status: 'undetermined',
      afterRequest: 'granted',
      coords: { latitude: 14.546, longitude: 121.07 },
    });
    await expect(resolveCurrentLocationPin(location)).resolves.toEqual({
      kind: 'pin',
      pin: { latitude: 14.546, longitude: 121.07 },
    });
    expect(location.requests).toBe(1);
    expect(location.reads).toBe(1);
  });

  it('uses an already granted permission without requesting again', async () => {
    const location = fakeLocation({
      status: 'granted',
      coords: { latitude: 14.546, longitude: 121.07 },
    });
    await expect(resolveCurrentLocationPin(location)).resolves.toEqual({
      kind: 'pin',
      pin: { latitude: 14.546, longitude: 121.07 },
    });
    expect(location.requests).toBe(0);
  });

  it('maps a location-read failure without treating it as a pin', async () => {
    const location = fakeLocation({ status: 'granted', positionError: true });
    await expect(resolveCurrentLocationPin(location)).resolves.toEqual({ kind: 'unavailable' });
  });
});

describe('map-unavailable fail-closed state', () => {
  it('treats a missing native map module as unavailable', () => {
    expect(classifyMapAvailability(true)).toBe('ready');
    expect(classifyMapAvailability(false)).toBe('unavailable');
  });
});

describe('createMyJobWithLocation', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('posts through the atomic RPC and never writes job_postings or job_skills directly', async () => {
    rpc.mockResolvedValue({ data: 'job-1', error: null } as never);
    const id = await createMyJobWithLocation({
      title: 'Plumbing',
      description: 'Fix leak',
      address: '123 Test Street',
      scheduledAt: '2026-09-20T01:00:00.000Z',
      budget: 800,
      paymentMethod: 'cod',
      skillIds: ['skill-1'],
      latitude: 14.5470774,
      longitude: 121.0716472,
    });
    expect(id).toBe('job-1');
    expect(rpc).toHaveBeenCalledWith('create_my_job_with_location', {
      p_title: 'Plumbing',
      p_description: 'Fix leak',
      p_address: '123 Test Street',
      p_scheduled_at: '2026-09-20T01:00:00.000Z',
      p_budget: 800,
      p_payment_method: 'cod',
      p_skill_ids: ['skill-1'],
      p_latitude: 14.5470774,
      p_longitude: 121.0716472,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('classifies RPC failures by code and never surfaces coordinates', () => {
    expect(createJobLocationErrorCopy(new JobLocationError('ignored', '42501'))).toBe(
      "You don't have permission to post a job."
    );
    expect(createJobLocationErrorCopy(new JobLocationError('ignored', '22023'))).toBe(
      "Check the job details and selected location, then try again."
    );
    const generic = createJobLocationErrorCopy(new JobLocationError('syntax error', '42601'));
    expect(generic).toBe("Couldn't post your job. Please try again.");
    expect(generic).not.toMatch(/14\.|121\./);
    expect(createJobLocationErrorCopy(new Error('network'))).toBe(
      "Couldn't post your job. Please try again."
    );
  });
});
