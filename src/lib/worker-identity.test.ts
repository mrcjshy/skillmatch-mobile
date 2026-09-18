import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { WORKER_PROFILE_PROTECTED_WRITE_FIELDS } from './worker-profile';
import {
  IDENTITY_COPY,
  IDENTITY_ERROR,
  IDENTITY_PROFILE_STATUS_LABELS,
  IDENTITY_TYPE_LABELS,
  WorkerIdentityError,
  buildWorkerIdentityStoragePath,
  canResubmitIdentity,
  classifyWorkerIdentityFailure,
  ensureOwnWorkerProfileId,
  getWorkerIdentityForReview,
  getWorkerIdentityReviewImage,
  identityErrorCopy,
  identityProfileStatusLabel,
  identityStatusLabel,
  identityTypeLabel,
  isIdentityIdType,
  listWorkersPendingIdReview,
  minimalWorkerIdentityProfileInsert,
  parseIdentitySubmission,
  parsePendingIdentityReview,
  parsePendingIdentityReviewRows,
  parseWorkerIdentityForReview,
  shouldShowWorkerIdentityForm,
  submitMyValidIdImage,
  validateRejectionReason,
  workerHomeIdentityNotice,
} from './worker-identity';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('./portfolio-images', () => ({
  loadValidatedLocalImage: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
}));

const rpc = vi.mocked(supabase.rpc);
const from = vi.mocked(supabase.from);
const getUser = vi.mocked(supabase.auth.getUser);
const storageFrom = vi.mocked(supabase.storage.from);

const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OBJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('identity type labels', () => {
  it('exposes the locked human labels and never a storage path', () => {
    expect(isIdentityIdType('national_id')).toBe(true);
    expect(IDENTITY_TYPE_LABELS).toEqual({
      national_id: 'PhilSys National ID / ePhilID',
      drivers_license: "LTO Driver's License",
      passport: 'Philippine Passport',
      umid: 'UMID',
      postal_id: 'Postal ID',
    });
    expect(identityTypeLabel('national_id')).toBe('PhilSys National ID / ePhilID');
    expect(identityTypeLabel('drivers_license')).toBe("LTO Driver's License");
    expect(identityTypeLabel('passport')).toBe('Philippine Passport');
    expect(identityTypeLabel('umid')).toBe('UMID');
    expect(identityTypeLabel('postal_id')).toBe('Postal ID');
    expect(Object.values(IDENTITY_TYPE_LABELS).join('\n')).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i
    );
  });
});

describe('identity status labels', () => {
  it('uses human review states without exposing paths', () => {
    expect(identityStatusLabel(null)).toBe(IDENTITY_COPY.none);
    expect(identityStatusLabel('pending')).toBe('Submitted — waiting for review');
    expect(identityStatusLabel('approved')).toBe('Approved');
    expect(identityStatusLabel('rejected')).toBe('Rejected');
  });

  it('labels Profile identity review without using Verified', () => {
    expect(identityProfileStatusLabel(null)).toBe('Not submitted');
    expect(identityProfileStatusLabel('pending')).toBe('Pending review');
    expect(identityProfileStatusLabel('rejected')).toBe('Identity rejected');
    expect(identityProfileStatusLabel('approved')).toBe('Identity approved');
    expect(identityProfileStatusLabel('approved')).not.toBe('Verified');
    expect(IDENTITY_PROFILE_STATUS_LABELS.approved).not.toBe('Verified');
    expect(IDENTITY_COPY.approvedNotice).toBe('Your identity document was approved.');
    expect(IDENTITY_COPY.approvedNotice).not.toMatch(/Worker verified/i);
  });
});

describe('worker home identity notice', () => {
  it('stays quiet when the Worker is already verified', () => {
    expect(workerHomeIdentityNotice(true, null)).toBe('none');
    expect(workerHomeIdentityNotice(true, 'pending')).toBe('none');
    expect(workerHomeIdentityNotice(true, 'rejected')).toBe('none');
    expect(workerHomeIdentityNotice(true, 'approved')).toBe('none');
  });

  it('uses rejected copy when verification is not granted and the ID was rejected', () => {
    expect(workerHomeIdentityNotice(false, 'rejected')).toBe('rejected');
  });

  it('uses pending review copy for unverified Workers without a rejection', () => {
    expect(workerHomeIdentityNotice(false, 'pending')).toBe('pending');
    expect(workerHomeIdentityNotice(false, null)).toBe('pending');
    expect(workerHomeIdentityNotice(false, 'approved')).toBe('pending');
  });

  it('exports pending and rejected Home copy without calling a rejection under review', () => {
    expect(IDENTITY_COPY.homePendingHeadline).toBe('Your account is under review.');
    expect(IDENTITY_COPY.homePendingBody).toEqual([
      'Verification usually takes up to 24 hours.',
      'You will be notified when your account is verified.',
    ]);
    expect(IDENTITY_COPY.homeRejectedHeadline).toBe('Your verification needs attention.');
    expect(IDENTITY_COPY.homeRejectedBody).toEqual([
      'Your identity submission was not approved.',
      'Open Profile to review the reason and submit a new ID.',
    ]);
    expect(IDENTITY_COPY.homeRejectedHeadline).not.toMatch(/under review/i);
    expect(IDENTITY_COPY.homeRejectedBody.join(' ')).not.toMatch(/under review/i);
  });
});

describe('profile vs onboarding form visibility', () => {
  it('shows a first submit only when no submission exists', () => {
    expect(
      shouldShowWorkerIdentityForm({ surface: 'profile', status: null, resubmitOpen: false })
    ).toBe(true);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'onboarding', status: null, resubmitOpen: false })
    ).toBe(true);
  });

  it('keeps Profile on status unless the Worker opens resubmit', () => {
    expect(
      shouldShowWorkerIdentityForm({ surface: 'profile', status: 'pending', resubmitOpen: false })
    ).toBe(false);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'profile', status: 'rejected', resubmitOpen: false })
    ).toBe(false);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'profile', status: 'pending', resubmitOpen: true })
    ).toBe(true);
    expect(canResubmitIdentity('pending')).toBe(true);
    expect(canResubmitIdentity('rejected')).toBe(true);
    expect(canResubmitIdentity('approved')).toBe(false);
  });

  it('lets onboarding resubmit a rejection and never replaces an approved ID', () => {
    expect(
      shouldShowWorkerIdentityForm({ surface: 'onboarding', status: 'pending', resubmitOpen: false })
    ).toBe(false);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'onboarding', status: 'rejected', resubmitOpen: false })
    ).toBe(true);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'profile', status: 'approved', resubmitOpen: true })
    ).toBe(false);
    expect(
      shouldShowWorkerIdentityForm({ surface: 'onboarding', status: 'approved', resubmitOpen: true })
    ).toBe(false);
  });
});

describe('buildWorkerIdentityStoragePath', () => {
  it('builds {worker_profiles.id}/{uuid}.jpg|jpeg|png|webp', () => {
    expect(buildWorkerIdentityStoragePath(PROFILE_ID, OBJECT_ID, 'jpg')).toBe(
      `${PROFILE_ID}/${OBJECT_ID}.jpg`
    );
    expect(buildWorkerIdentityStoragePath(PROFILE_ID, OBJECT_ID, 'jpeg')).toBe(
      `${PROFILE_ID}/${OBJECT_ID}.jpeg`
    );
    expect(buildWorkerIdentityStoragePath(PROFILE_ID, OBJECT_ID, 'png')).toBe(
      `${PROFILE_ID}/${OBJECT_ID}.png`
    );
    expect(buildWorkerIdentityStoragePath(PROFILE_ID, OBJECT_ID, 'webp')).toBe(
      `${PROFILE_ID}/${OBJECT_ID}.webp`
    );
  });

  it('rejects a users.id-shaped first folder that is not a canonical UUID v1-5', () => {
    expect(
      buildWorkerIdentityStoragePath('not-a-profile-id', OBJECT_ID, 'jpg')
    ).toBeNull();
    expect(buildWorkerIdentityStoragePath(PROFILE_ID, OBJECT_ID, 'gif' as never)).toBeNull();
  });
});

describe('minimalWorkerIdentityProfileInsert', () => {
  it('inserts only user_id, null bio, and available — never protected columns', () => {
    const row = minimalWorkerIdentityProfileInsert(USER_ID);
    expect(row).toEqual({
      user_id: USER_ID,
      bio: null,
      availability_status: 'available',
    });
    expect(Object.keys(row).sort()).toEqual(['availability_status', 'bio', 'user_id']);
    for (const field of WORKER_PROFILE_PROTECTED_WRITE_FIELDS) {
      expect(row).not.toHaveProperty(field);
    }
  });
});

function mockOwnProfileSelect(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  from.mockReturnValueOnce({ select } as never);
  return { select, eq, maybeSingle };
}

function mockOwnProfileInsert(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  from.mockReturnValueOnce({ insert } as never);
  return { insert, select, single };
}

describe('ensureOwnWorkerProfileId', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns an existing own profile id and does not insert', async () => {
    const existing = mockOwnProfileSelect({ data: { id: PROFILE_ID }, error: null });

    await expect(ensureOwnWorkerProfileId()).resolves.toBe(PROFILE_ID);
    expect(getUser).toHaveBeenCalled();
    expect(existing.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('inserts a minimal own profile when none exists', async () => {
    mockOwnProfileSelect({ data: null, error: null });
    const created = mockOwnProfileInsert({ data: { id: PROFILE_ID }, error: null });

    await expect(ensureOwnWorkerProfileId()).resolves.toBe(PROFILE_ID);
    expect(created.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      bio: null,
      availability_status: 'available',
    });
    expect(Object.keys(created.insert.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'availability_status',
      'bio',
      'user_id',
    ]);
    for (const field of WORKER_PROFILE_PROTECTED_WRITE_FIELDS) {
      expect(created.insert.mock.calls[0]?.[0]).not.toHaveProperty(field);
    }
  });

  it('re-selects own id after a unique 23505 race', async () => {
    mockOwnProfileSelect({ data: null, error: null });
    mockOwnProfileInsert({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });
    const retry = mockOwnProfileSelect({ data: { id: PROFILE_ID }, error: null });

    await expect(ensureOwnWorkerProfileId()).resolves.toBe(PROFILE_ID);
    expect(retry.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('scopes own-profile SELECT by user_id so other Workers cannot block creation', async () => {
    const existing = mockOwnProfileSelect({ data: null, error: null });
    mockOwnProfileInsert({ data: { id: PROFILE_ID }, error: null });

    await expect(ensureOwnWorkerProfileId()).resolves.toBe(PROFILE_ID);
    expect(existing.select).toHaveBeenCalledWith('id');
    expect(existing.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(existing.maybeSingle).toHaveBeenCalled();
  });

  it('classifies a profile-creation error without exposing SQL to the Worker', async () => {
    mockOwnProfileSelect({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or more than 1) rows returned',
        details: 'The result contains 3 rows',
        hint: null,
      },
    });

    const caught = await ensureOwnWorkerProfileId().catch((error: unknown) => error);
    expect(caught).toMatchObject({
      name: 'WorkerIdentityError',
      code: IDENTITY_ERROR.MULTIPLE_ROWS,
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(classifyWorkerIdentityFailure(caught)).toBe('profile_select_ambiguous');
    expect(identityErrorCopy(caught)).toBe(IDENTITY_COPY.submitFailed);
    expect(identityErrorCopy(caught)).not.toMatch(/JSON object requested|PGRST116|3 rows/i);
  });

  it('classifies an insert RLS denial and still uses generic Worker copy', async () => {
    mockOwnProfileSelect({ data: null, error: null });
    mockOwnProfileInsert({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "worker_profiles"',
        details: null,
        hint: null,
      },
    });

    const caught = await ensureOwnWorkerProfileId().catch((error: unknown) => error);
    expect(caught).toMatchObject({ name: 'WorkerIdentityError', code: IDENTITY_ERROR.FORBIDDEN });
    expect(classifyWorkerIdentityFailure(caught)).toBe('forbidden');
    expect(identityErrorCopy(caught)).toBe(IDENTITY_COPY.forbidden);
    expect(identityErrorCopy(caught)).not.toMatch(/row-level security|worker_profiles/i);
  });
});

describe('submitMyValidIdImage ordering', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    storageFrom.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does not upload an identity object when own profile identity is unavailable', async () => {
    const { loadValidatedLocalImage } = await import('./portfolio-images');
    vi.mocked(loadValidatedLocalImage).mockResolvedValue({
      ok: true,
      image: { bytes: new Uint8Array([1]), mime: 'image/jpeg', ext: 'jpg' },
    } as never);
    mockOwnProfileSelect({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or more than 1) rows returned',
        details: 'The result contains 3 rows',
        hint: null,
      },
    });

    await expect(
      submitMyValidIdImage({ idType: 'national_id', imageUri: 'file:///id.jpg' })
    ).rejects.toMatchObject({ code: IDENTITY_ERROR.MULTIPLE_ROWS });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('submit_my_valid_id', expect.anything());
  });
});

describe('parseIdentitySubmission', () => {
  it('keeps status and type and drops the storage path from the Worker view model', () => {
    const parsed = parseIdentitySubmission({
      id: OBJECT_ID,
      id_type: 'national_id',
      storage_path: `${PROFILE_ID}/${OBJECT_ID}.jpg`,
      status: 'pending',
      rejection_reason: 'should stay hidden while pending',
      submitted_at: '2026-09-18T03:00:00.000Z',
      reviewed_at: null,
    });
    expect(parsed).toEqual({
      id: OBJECT_ID,
      idType: 'national_id',
      status: 'pending',
      rejectionReason: null,
      submittedAt: '2026-09-18T03:00:00.000Z',
      reviewedAt: null,
    });
    expect(parsed).not.toHaveProperty('storagePath');
  });

  it('returns the rejection reason only for rejected submissions', () => {
    expect(
      parseIdentitySubmission({
        id: OBJECT_ID,
        id_type: 'umid',
        status: 'rejected',
        rejection_reason: 'Photo is unreadable.',
        submitted_at: '2026-09-18T03:00:00.000Z',
        reviewed_at: '2026-09-18T04:00:00.000Z',
      })?.rejectionReason
    ).toBe('Photo is unreadable.');
  });
});

describe('parsePendingIdentityReview', () => {
  it('keeps server order and drops malformed rows', () => {
    const rows = parsePendingIdentityReviewRows([
      {
        user_id: '11111111-1111-4111-8111-111111111111',
        document_id: OBJECT_ID,
        full_name: 'Ana Worker',
        phone: '09170000000',
        barangay: 'Santa Ana',
        city: 'Pateros',
        id_type: 'passport',
        submitted_at: '2026-09-18T03:00:00.000Z',
        skills: ['Plumbing'],
      },
      { full_name: 'Incomplete' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idType).toBe('passport');
    expect(parsePendingIdentityReview(null)).toBeNull();
  });
});

describe('validateRejectionReason', () => {
  it('requires a 1–500 character reason', () => {
    expect(validateRejectionReason('')).toBe(IDENTITY_COPY.rejectReasonRequired);
    expect(validateRejectionReason('   ')).toBe(IDENTITY_COPY.rejectReasonRequired);
    expect(validateRejectionReason('Photo is blurry.')).toBeNull();
    expect(validateRejectionReason('x'.repeat(501))).toBe(IDENTITY_COPY.rejectReasonRequired);
  });
});

describe('identityErrorCopy', () => {
  it('maps 22023 to generic invalid-submission copy, not image-specific text', () => {
    const error = new WorkerIdentityError('invalid_parameter_value', IDENTITY_ERROR.INVALID);
    expect(identityErrorCopy(error)).toBe(
      'The identity submission is invalid. Check the ID type and image, then try again.'
    );
    expect(identityErrorCopy(error)).not.toBe(IDENTITY_COPY.invalidImage);
    expect(identityErrorCopy(error)).not.toMatch(/invalid_parameter_value|22023/i);
  });
});

describe('getWorkerIdentityForReview', () => {
  const reviewRow = {
    user_id: USER_ID,
    document_id: OBJECT_ID,
    full_name: 'Ana Worker',
    phone: '09170000000',
    barangay: 'Santa Ana',
    city: 'Pateros',
    id_type: 'passport',
    storage_path: `${PROFILE_ID}/${OBJECT_ID}.jpg`,
    submitted_at: '2026-09-18T03:00:00.000Z',
  };

  beforeEach(() => {
    rpc.mockReset();
    storageFrom.mockReset();
  });

  it('parses the review RPC row with empty skills and a storage path', () => {
    expect(parseWorkerIdentityForReview(reviewRow)).toEqual({
      userId: USER_ID,
      documentId: OBJECT_ID,
      fullName: 'Ana Worker',
      phone: '09170000000',
      barangay: 'Santa Ana',
      city: 'Pateros',
      idType: 'passport',
      submittedAt: '2026-09-18T03:00:00.000Z',
      skills: [],
      storagePath: `${PROFILE_ID}/${OBJECT_ID}.jpg`,
    });
    expect(
      parseWorkerIdentityForReview({
        ...reviewRow,
        skills: ['Plumbing'],
      })?.skills
    ).toEqual([]);
    expect(parseWorkerIdentityForReview({ ...reviewRow, storage_path: '' })).toBeNull();
    expect(parseWorkerIdentityForReview(null)).toBeNull();
  });

  it('calls get_worker_identity_for_review once and returns the parsed payload', async () => {
    rpc.mockResolvedValueOnce({ data: [reviewRow], error: null } as never);
    await expect(getWorkerIdentityForReview(USER_ID)).resolves.toEqual({
      userId: USER_ID,
      documentId: OBJECT_ID,
      fullName: 'Ana Worker',
      phone: '09170000000',
      barangay: 'Santa Ana',
      city: 'Pateros',
      idType: 'passport',
      submittedAt: '2026-09-18T03:00:00.000Z',
      skills: [],
      storagePath: `${PROFILE_ID}/${OBJECT_ID}.jpg`,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_worker_identity_for_review', {
      p_worker_user_id: USER_ID,
    });
    expect(rpc).not.toHaveBeenCalledWith('list_workers_pending_id_review');
  });

  it('keeps getWorkerIdentityReviewImage signing the pending storage path', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed-id' },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: [reviewRow], error: null } as never);
    storageFrom.mockReturnValue({ createSignedUrl } as never);

    await expect(getWorkerIdentityReviewImage(USER_ID)).resolves.toBe(
      'https://example.test/signed-id'
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_worker_identity_for_review', {
      p_worker_user_id: USER_ID,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${PROFILE_ID}/${OBJECT_ID}.jpg`,
      3600
    );
  });
});

describe('listWorkersPendingIdReview', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('calls the pending-ID review RPC with zero arguments', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await expect(listWorkersPendingIdReview()).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('list_workers_pending_id_review');
  });
});
