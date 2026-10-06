import { describe, expect, it } from 'vitest';

import {
  AVAILABILITY_CONTROL_OPTIONS,
  WORKER_PROFILE_AVAILABILITY_READ_COLUMNS,
  WORKER_PROFILE_PROTECTED_WRITE_FIELDS,
  buildWorkerProfileAvailabilityUpdateRow,
  buildWorkerProfileInsertRow,
  buildWorkerProfileUpdateRow,
  isWorkerVerified,
  parseWorkerProfileAvailabilityStatus,
  presentAvailabilityControlValue,
  shouldPersistAvailabilityChange,
  WORKER_PROFILE_AVATAR_SIZE,
  workerProfileHeaderLayout,
  workerVerificationLabel,
} from './worker-profile';

describe('isWorkerVerified', () => {
  it('is verified only when is_verified is exactly true', () => {
    expect(isWorkerVerified(true)).toBe(true);
  });

  it('does not treat false, null, or undefined as verified', () => {
    expect(isWorkerVerified(false)).toBe(false);
    expect(isWorkerVerified(null)).toBe(false);
    expect(isWorkerVerified(undefined)).toBe(false);
  });

  it('does not treat truthy stand-ins as verified', () => {
    expect(isWorkerVerified('true')).toBe(false);
    expect(isWorkerVerified(1)).toBe(false);
    expect(isWorkerVerified({ is_verified: true })).toBe(false);
  });
});

describe('presentAvailabilityControlValue', () => {
  it('maps offline to busy for the control display', () => {
    expect(presentAvailabilityControlValue('offline')).toBe('busy');
  });

  it('does not map available to busy', () => {
    expect(presentAvailabilityControlValue('available')).toBe('available');
  });
});

describe('workerVerificationLabel', () => {
  it('labels a verified Worker as Verified', () => {
    expect(workerVerificationLabel(true)).toBe('Verified');
  });

  it('labels an unverified Worker as Not yet verified', () => {
    expect(workerVerificationLabel(false)).toBe('Not yet verified');
  });
});

describe('shouldPersistAvailabilityChange', () => {
  it('does not persist busy when stored offline is already presented as Busy', () => {
    expect(shouldPersistAvailabilityChange('offline', 'busy')).toBe(false);
  });

  it('persists available when stored offline is chosen as Available', () => {
    expect(shouldPersistAvailabilityChange('offline', 'available')).toBe(true);
  });

  it('persists busy when stored available is chosen as Busy', () => {
    expect(shouldPersistAvailabilityChange('available', 'busy')).toBe(true);
  });

  it('does not persist busy when stored busy is chosen as Busy', () => {
    expect(shouldPersistAvailabilityChange('busy', 'busy')).toBe(false);
  });
});

describe('worker profile write payloads', () => {
  const protectedFields = [
    'is_verified',
    'verified_by',
    'rating_avg',
    'strike_count',
    'badge_level',
  ] as const;

  it('names the protected fields the save path must never write', () => {
    expect(WORKER_PROFILE_PROTECTED_WRITE_FIELDS).toEqual([...protectedFields]);
  });

  it('inserts only user_id, bio, and availability_status', () => {
    const row = buildWorkerProfileInsertRow({
      userId: '11111111-1111-4111-8111-111111111111',
      bio: 'Carpenter in Santa Ana.',
      availabilityStatus: 'available',
    });

    expect(row).toEqual({
      user_id: '11111111-1111-4111-8111-111111111111',
      bio: 'Carpenter in Santa Ana.',
      availability_status: 'available',
    });
    expect(Object.keys(row).sort()).toEqual(['availability_status', 'bio', 'user_id']);
    for (const field of protectedFields) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('updates only bio and availability_status', () => {
    const row = buildWorkerProfileUpdateRow({
      bio: null,
      availabilityStatus: 'busy',
    });

    expect(row).toEqual({
      bio: null,
      availability_status: 'busy',
    });
    expect(Object.keys(row).sort()).toEqual(['availability_status', 'bio']);
    for (const field of protectedFields) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('Home persist writes only availability_status', () => {
    const row = buildWorkerProfileAvailabilityUpdateRow({
      availabilityStatus: 'offline',
    });

    expect(row).toEqual({ availability_status: 'offline' });
    expect(Object.keys(row)).toEqual(['availability_status']);
    expect(row).not.toHaveProperty('bio');
    for (const field of protectedFields) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('Home authority refresh reads only availability_status', () => {
    expect(WORKER_PROFILE_AVAILABILITY_READ_COLUMNS).toEqual(['availability_status']);
    expect(WORKER_PROFILE_AVAILABILITY_READ_COLUMNS).not.toContain('bio');
    for (const field of protectedFields) {
      expect(WORKER_PROFILE_AVAILABILITY_READ_COLUMNS).not.toContain(field);
    }
  });

  it('accepts only persisted availability values', () => {
    expect(parseWorkerProfileAvailabilityStatus('available')).toBe('available');
    expect(parseWorkerProfileAvailabilityStatus('busy')).toBe('busy');
    expect(parseWorkerProfileAvailabilityStatus('offline')).toBe('offline');
  });

  it('offers Available and Busy on the control without narrowing the DB CHECK', () => {
    expect(AVAILABILITY_CONTROL_OPTIONS).toEqual([
      { value: 'available', label: 'Available' },
      { value: 'busy', label: 'Busy' },
    ]);
    expect(AVAILABILITY_CONTROL_OPTIONS.map((option) => option.value)).not.toContain('offline');
  });

  it('AVAILABILITY_CONTROL_OPTIONS has no offline choice', () => {
    const values: string[] = AVAILABILITY_CONTROL_OPTIONS.map((option) => option.value);
    expect(values).not.toContain('offline');
    expect(AVAILABILITY_CONTROL_OPTIONS.map((option) => option.label)).toEqual([
      'Available',
      'Busy',
    ]);
  });

  it('does not invent availability from invalid or extra payload fields', () => {
    expect(parseWorkerProfileAvailabilityStatus(null)).toBeNull();
    expect(parseWorkerProfileAvailabilityStatus(undefined)).toBeNull();
    expect(parseWorkerProfileAvailabilityStatus('Available')).toBeNull();
    expect(parseWorkerProfileAvailabilityStatus({
      availability_status: 'busy',
      bio: 'should be ignored',
    })).toBeNull();
  });
});

describe('workerProfileHeaderLayout', () => {
  const phone = { windowWidth: 411, gutter: 20, avatarGap: 12, columnGap: 8 };

  it('puts identity and contacts side by side at 100% on a standard phone, using the row beside the avatar', () => {
    const layout = workerProfileHeaderLayout({ ...phone, fontScale: 1 });
    expect(WORKER_PROFILE_AVATAR_SIZE).toBe(64);
    expect(layout).toEqual({ columns: 'side-by-side', identityMinWidth: 96, identityMaxWidth: 127, contactMinWidth: 160 });
    // 411 - 2 x 20 gutter - 64 avatar - 12 gap = 295dp shared by both columns and their 8dp gap.
    if (layout.columns === 'side-by-side') expect(layout.identityMaxWidth + phone.columnGap + layout.contactMinWidth).toBe(295);
  });

  it('stacks the contacts under the identity only when both columns cannot fit', () => {
    expect(workerProfileHeaderLayout({ ...phone, fontScale: 1.3 })).toEqual({ columns: 'stacked' });
    expect(workerProfileHeaderLayout({ ...phone, windowWidth: 340, fontScale: 1 })).toEqual({ columns: 'stacked' });
    expect(workerProfileHeaderLayout({ ...phone, windowWidth: 480, fontScale: 1.3 }).columns).toBe('side-by-side');
  });

  it('never shrinks the minimum widths below their 100% values for small font scales', () => {
    expect(workerProfileHeaderLayout({ ...phone, fontScale: 0.85 })).toEqual(workerProfileHeaderLayout({ ...phone, fontScale: 1 }));
  });
});
