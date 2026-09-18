import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRIVACY_VERSION, TERMS_VERSION } from './legal-documents';
import { supabase } from './supabase';
import {
  CONSENT_COPY,
  CONSENT_ERROR,
  consentErrorCopy,
  getMyConsent,
  hasRequiredLegalAcceptance,
  isCurrentLegalConsent,
  parseUserConsent,
  parseUserConsentResult,
  persistCurrentLegalConsent,
  persistCurrentLegalConsentAfterSignup,
  recordMyConsent,
  registrationConsentShouldPersistNow,
  UserConsentError,
} from './user-consent';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

const rpc = vi.mocked(supabase.rpc);
const from = vi.mocked(supabase.from);
const getUser = vi.mocked(supabase.auth.getUser);

const CONSENT_ROW = {
  user_id: '11111111-1111-4111-8111-111111111111',
  terms_version: '2026-09-v1',
  terms_accepted_at: '2026-09-18T02:00:00.000Z',
  privacy_version: '2026-09-v1',
  privacy_acknowledged_at: '2026-09-18T02:00:00.000Z',
};

describe('parseUserConsent', () => {
  it('accepts a complete own-user consent row', () => {
    expect(parseUserConsent(CONSENT_ROW)).toEqual({
      userId: CONSENT_ROW.user_id,
      termsVersion: '2026-09-v1',
      termsAcceptedAt: CONSENT_ROW.terms_accepted_at,
      privacyVersion: '2026-09-v1',
      privacyAcknowledgedAt: CONSENT_ROW.privacy_acknowledged_at,
    });
  });

  it('drops malformed rows instead of inventing timestamps', () => {
    expect(parseUserConsent({ ...CONSENT_ROW, terms_accepted_at: '' })).toBeNull();
    expect(parseUserConsent(null)).toBeNull();
  });
});

describe('parseUserConsentResult', () => {
  it('reads the first table row and treats an empty result as no consent', () => {
    expect(parseUserConsentResult([CONSENT_ROW])?.userId).toBe(CONSENT_ROW.user_id);
    expect(parseUserConsentResult([])).toBeNull();
    expect(parseUserConsentResult(null)).toBeNull();
  });
});

describe('isCurrentLegalConsent', () => {
  it('is current only for the locked 2026-09-v1 pair', () => {
    expect(TERMS_VERSION).toBe('2026-09-v1');
    expect(PRIVACY_VERSION).toBe('2026-09-v1');
    expect(isCurrentLegalConsent(parseUserConsent(CONSENT_ROW))).toBe(true);
    expect(
      isCurrentLegalConsent(
        parseUserConsent({ ...CONSENT_ROW, terms_version: '2026-08-v0' })
      )
    ).toBe(false);
    expect(isCurrentLegalConsent(null)).toBe(false);
  });
});

describe('hasRequiredLegalAcceptance', () => {
  it('requires both the Terms checkbox and the Privacy checkbox', () => {
    expect(hasRequiredLegalAcceptance(true, true)).toBe(true);
    expect(hasRequiredLegalAcceptance(true, false)).toBe(false);
    expect(hasRequiredLegalAcceptance(false, true)).toBe(false);
    expect(hasRequiredLegalAcceptance(false, false)).toBe(false);
  });
});

describe('getMyConsent / recordMyConsent', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('returns null when the caller has no consent row yet', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await expect(getMyConsent()).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_my_consent');
  });

  it('records the locked current versions and never a caller-supplied pair', async () => {
    rpc.mockResolvedValueOnce({ data: [CONSENT_ROW], error: null } as never);
    await expect(recordMyConsent()).resolves.toMatchObject({
      termsVersion: '2026-09-v1',
      privacyVersion: '2026-09-v1',
    });
    expect(rpc).toHaveBeenCalledWith('record_my_consent', {
      p_terms_version: '2026-09-v1',
      p_privacy_version: '2026-09-v1',
    });
  });

  it('classifies 42501 without showing the database message', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not authorized to record consent' },
    } as never);
    await expect(recordMyConsent()).rejects.toMatchObject({ code: '42501' });
    expect(consentErrorCopy(new UserConsentError('hidden', '42501'))).toBe(CONSENT_COPY.forbidden);
  });
});

describe('registration consent persist timing', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getUser.mockReset();
  });

  it('persists only after both legal controls, a session, and account bootstrap readiness', () => {
    expect(
      registrationConsentShouldPersistNow({
        acceptedTerms: true,
        acknowledgedPrivacy: true,
        hasSession: true,
        accountBootstrapReady: true,
        consentAlreadyCurrent: false,
      })
    ).toBe(true);
    expect(
      registrationConsentShouldPersistNow({
        acceptedTerms: true,
        acknowledgedPrivacy: true,
        hasSession: true,
        accountBootstrapReady: false,
        consentAlreadyCurrent: false,
      })
    ).toBe(false);
    expect(
      registrationConsentShouldPersistNow({
        acceptedTerms: true,
        acknowledgedPrivacy: false,
        hasSession: true,
        accountBootstrapReady: true,
        consentAlreadyCurrent: false,
      })
    ).toBe(false);
  });

  it('records and confirms consent when the public.users row is ready', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: CONSENT_ROW.user_id } },
      error: null,
    } as never);
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: CONSENT_ROW.user_id },
      error: null,
    });
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    } as never);
    rpc
      .mockResolvedValueOnce({ data: [CONSENT_ROW], error: null } as never)
      .mockResolvedValueOnce({ data: [CONSENT_ROW], error: null } as never);

    await expect(
      persistCurrentLegalConsentAfterSignup({ attempts: 1, delayMs: 0 })
    ).resolves.toMatchObject({
      userId: CONSENT_ROW.user_id,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_my_consent', {
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_my_consent');
    expect(isCurrentLegalConsent(parseUserConsent(CONSENT_ROW))).toBe(true);
  });

  it('does not call record_my_consent before the users row exists', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: CONSENT_ROW.user_id } },
      error: null,
    } as never);
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as never);

    const caught = await persistCurrentLegalConsentAfterSignup({
      attempts: 1,
      delayMs: 0,
    }).catch((error: unknown) => error);
    expect(caught).toMatchObject({ name: 'UserConsentError', code: CONSENT_ERROR.FORBIDDEN });
    expect(rpc).not.toHaveBeenCalled();
    expect(isCurrentLegalConsent(null)).toBe(false);
  });

  it('fail-closes when consent confirmation is missing so /legal-consent remains required', async () => {
    rpc
      .mockResolvedValueOnce({ data: [CONSENT_ROW], error: null } as never)
      .mockResolvedValueOnce({ data: [], error: null } as never);

    const caught = await persistCurrentLegalConsent().catch((error: unknown) => error);
    expect(caught).toMatchObject({ name: 'UserConsentError' });
    expect(consentErrorCopy(caught)).toBe(CONSENT_COPY.generic);
    expect(isCurrentLegalConsent(null)).toBe(false);
  });

  it('lets successful current consent proceed past the consent gate', () => {
    expect(isCurrentLegalConsent(parseUserConsent(CONSENT_ROW))).toBe(true);
    expect(
      registrationConsentShouldPersistNow({
        acceptedTerms: true,
        acknowledgedPrivacy: true,
        hasSession: true,
        accountBootstrapReady: true,
        consentAlreadyCurrent: true,
      })
    ).toBe(false);
  });
});
