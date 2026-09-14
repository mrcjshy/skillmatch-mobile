import { describe, expect, it } from 'vitest';

import {
  WORKER_PROFILE_PROTECTED_WRITE_FIELDS,
  buildWorkerProfileInsertRow,
  buildWorkerProfileUpdateRow,
  isWorkerVerified,
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

describe('workerVerificationLabel', () => {
  it('labels a verified Worker as Verified', () => {
    expect(workerVerificationLabel(true)).toBe('Verified');
  });

  it('labels any other state as Verification pending', () => {
    expect(workerVerificationLabel(false)).toBe('Verification pending');
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
});
