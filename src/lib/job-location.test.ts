import { describe, expect, it, vi, beforeEach } from 'vitest';

import { supabase } from './supabase';
import {
  JobLocationError,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  authorizedMapsNavigationUrl,
  classifyForegroundPermission,
  classifyMapAvailability,
  createJobLocationErrorCopy,
  createMyJobWithLocation,
  createWorkerLocationErrorCopy,
  decideCurrentLocationAction,
  getAuthorizedJobLocation,
  getJobApproximateArea,
  initialJobPin,
  isValidJobCoordinate,
  mapRegionForApproximateArea,
  postingLocationError,
  postingPinState,
  projectAssignedWorkerLocation,
  projectPreAcceptWorkerLocation,
  resolveCurrentLocationPin,
  type ApproximateJobArea,
  type AuthorizedJobLocation,
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

const santaAnaArea: ApproximateJobArea = {
  jobId: 'job-1',
  barangay: 'Santa Ana',
  city: 'Pateros',
  approximateAreaKey: 'santa_ana_pateros',
};

const authorizedExact: AuthorizedJobLocation = {
  jobId: 'job-1',
  address: '123 Secret Street',
  pin: { latitude: 14.5411111, longitude: 121.0800001 },
  barangay: 'Santa Ana',
  city: 'Pateros',
};

describe('general-area map-region mapping', () => {
  it('maps the Santa Ana area key to the verified OSM display region, not a Job pin', () => {
    expect(mapRegionForApproximateArea('santa_ana_pateros')).toEqual(
      SANTA_ANA_PATEROS_DISPLAY_REGION
    );
    expect(mapRegionForApproximateArea('santa_ana_pateros').latitude).toBe(14.5470774);
    expect(mapRegionForApproximateArea('santa_ana_pateros').longitude).toBe(121.0716472);
  });

  it('does not invent a second center for another barangay/city key', () => {
    expect(mapRegionForApproximateArea('general_barangay_city')).toEqual(
      SANTA_ANA_PATEROS_DISPLAY_REGION
    );
  });
});

describe('approximate-versus-exact lifecycle projection', () => {
  it('projects a pre-accept Worker surface with general area only', () => {
    const surface = projectPreAcceptWorkerLocation(santaAnaArea, 'ready');
    expect(surface).toEqual({
      kind: 'approximate',
      heading: 'Approximate Job Area',
      copy: 'Approximate Job area. Exact location becomes available after acceptance.',
      barangay: 'Santa Ana',
      city: 'Pateros',
      mapRegion: SANTA_ANA_PATEROS_DISPLAY_REGION,
      pin: null,
      address: null,
      openInMapsUrl: null,
      showMap: true,
    });
  });

  it('never derives the approximate map from a private exact pin', () => {
    const surface = projectPreAcceptWorkerLocation(santaAnaArea, 'ready');
    expect(surface.kind).toBe('approximate');
    if (surface.kind !== 'approximate') return;
    expect(surface.mapRegion).toEqual(SANTA_ANA_PATEROS_DISPLAY_REGION);
    expect(surface.mapRegion.latitude).not.toBe(authorizedExact.pin?.latitude);
    expect(surface.mapRegion.longitude).not.toBe(authorizedExact.pin?.longitude);
    expect(surface.pin).toBeNull();
    expect(surface.address).toBeNull();
    expect(surface.openInMapsUrl).toBeNull();
  });

  it('keeps pre-accept text when the native map is unavailable', () => {
    const surface = projectPreAcceptWorkerLocation(santaAnaArea, 'unavailable');
    expect(surface.kind).toBe('approximate');
    if (surface.kind !== 'approximate') return;
    expect(surface.showMap).toBe(false);
    expect(surface.pin).toBeNull();
    expect(surface.address).toBeNull();
    expect(surface.openInMapsUrl).toBeNull();
  });

  it('fails closed when the approximate area is missing', () => {
    expect(projectPreAcceptWorkerLocation(null, 'ready')).toEqual({
      kind: 'unavailable',
      pin: null,
      address: null,
      openInMapsUrl: null,
      showMap: false,
    });
  });

  it('shows the exact pin and Open in Maps only for a confirmed assigned Worker', () => {
    const surface = projectAssignedWorkerLocation({
      bookingStatus: 'confirmed',
      exact: authorizedExact,
      mapAvailable: 'ready',
    });
    expect(surface.kind).toBe('exact');
    if (surface.kind !== 'exact') return;
    expect(surface.address).toBe('123 Secret Street');
    expect(surface.pin).toEqual(authorizedExact.pin);
    expect(surface.openInMapsUrl).toBe(
      'geo:14.5411111,121.0800001?q=14.5411111,121.0800001'
    );
    expect(surface.showMap).toBe(true);
    expect(surface.barangay).toBe('Santa Ana');
    expect(surface.city).toBe('Pateros');
  });

  it('uses text-location fallback when a confirmed Job has no pin', () => {
    const surface = projectAssignedWorkerLocation({
      bookingStatus: 'confirmed',
      exact: { ...authorizedExact, pin: null },
      mapAvailable: 'ready',
    });
    expect(surface).toEqual({
      kind: 'text-fallback',
      address: '123 Secret Street',
      barangay: 'Santa Ana',
      city: 'Pateros',
      pin: null,
      openInMapsUrl: null,
      showMap: false,
    });
  });

  it.each(['completed', 'cancelled', 'no_show', 'pending'] as const)(
    'suppresses stale exact location after %s',
    (bookingStatus) => {
      const surface = projectAssignedWorkerLocation({
        bookingStatus,
        exact: authorizedExact,
        mapAvailable: 'ready',
      });
      expect(surface).toEqual({
        kind: 'suppressed',
        pin: null,
        address: null,
        openInMapsUrl: null,
        showMap: false,
      });
    }
  );

  it('fails closed when confirmed exact location is denied or missing', () => {
    expect(
      projectAssignedWorkerLocation({
        bookingStatus: 'confirmed',
        exact: null,
        mapAvailable: 'ready',
      })
    ).toEqual({
      kind: 'unavailable',
      pin: null,
      address: null,
      openInMapsUrl: null,
      showMap: false,
    });
  });

  it('hides the exact map when the native module is unavailable', () => {
    const surface = projectAssignedWorkerLocation({
      bookingStatus: 'confirmed',
      exact: authorizedExact,
      mapAvailable: 'unavailable',
    });
    expect(surface.kind).toBe('exact');
    if (surface.kind !== 'exact') return;
    expect(surface.showMap).toBe(false);
    expect(surface.openInMapsUrl).toBe(
      'geo:14.5411111,121.0800001?q=14.5411111,121.0800001'
    );
  });
});

describe('external navigation URL construction', () => {
  it('builds a geo URI only from currently authorized exact coordinates', () => {
    expect(authorizedMapsNavigationUrl({ latitude: 14.5411111, longitude: 121.0800001 })).toBe(
      'geo:14.5411111,121.0800001?q=14.5411111,121.0800001'
    );
  });

  it('does not construct a URL without a valid pin and never uses Static Maps', () => {
    expect(authorizedMapsNavigationUrl(null)).toBeNull();
    expect(authorizedMapsNavigationUrl({ latitude: Number.NaN, longitude: 121.08 })).toBeNull();
    const url = authorizedMapsNavigationUrl({ latitude: 14.5411111, longitude: 121.0800001 });
    expect(url).not.toMatch(/staticmap/i);
    expect(url).not.toMatch(/maps\/api/i);
  });
});

describe('getJobApproximateArea', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('reads only the approximate-area RPC and never the exact-location RPC or tables', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          job_id: 'job-1',
          barangay: 'Santa Ana',
          city: 'Pateros',
          approximate_area_key: 'santa_ana_pateros',
        },
      ],
      error: null,
    } as never);
    await expect(getJobApproximateArea('job-1')).resolves.toEqual(santaAnaArea);
    expect(rpc).toHaveBeenCalledWith('get_job_approximate_area', { p_job_id: 'job-1' });
    expect(rpc).not.toHaveBeenCalledWith('get_authorized_job_location', expect.anything());
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed on SM409 without exposing coordinates', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'SM409', message: 'this job area is not available 14.54 121.07' },
    } as never);
    await expect(getJobApproximateArea('job-1')).rejects.toBeInstanceOf(JobLocationError);
    const copy = createWorkerLocationErrorCopy(
      new JobLocationError('this job area is not available 14.54 121.07', 'SM409')
    );
    expect(copy).toBe('This job location is not available.');
    expect(copy).not.toMatch(/14\.|121\./);
  });
});

describe('getAuthorizedJobLocation', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('reads exact location only through the authorized RPC', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          job_id: 'job-1',
          address: '123 Secret Street',
          latitude: 14.5411111,
          longitude: 121.0800001,
          barangay: 'Santa Ana',
          city: 'Pateros',
        },
      ],
      error: null,
    } as never);
    await expect(getAuthorizedJobLocation('job-1')).resolves.toEqual(authorizedExact);
    expect(rpc).toHaveBeenCalledWith('get_authorized_job_location', { p_job_id: 'job-1' });
    expect(from).not.toHaveBeenCalled();
  });

  it('treats a legacy Job with null coordinates as text-location fallback data', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          job_id: 'job-1',
          address: '123 Secret Street',
          latitude: null,
          longitude: null,
          barangay: 'Santa Ana',
          city: 'Pateros',
        },
      ],
      error: null,
    } as never);
    await expect(getAuthorizedJobLocation('job-1')).resolves.toEqual({
      ...authorizedExact,
      pin: null,
    });
  });
});
