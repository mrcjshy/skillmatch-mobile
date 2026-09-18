/**
 * V3 Wave 1 — own-user Terms/Privacy consent RPCs.
 *
 * Versions are the locked pair from legal-documents.ts (2026-09-v1).
 * Consent is never stored in Auth metadata. record_my_consent requires an
 * authenticated caller with a public.users row (42501 otherwise).
 */

import { PRIVACY_VERSION, TERMS_VERSION } from './legal-documents';
import { supabase } from './supabase';

export type UserConsent = {
  userId: string;
  termsVersion: string;
  termsAcceptedAt: string;
  privacyVersion: string;
  privacyAcknowledgedAt: string;
};

export class UserConsentError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'UserConsentError';
    this.code = code;
  }
}

export const CONSENT_ERROR = {
  FORBIDDEN: '42501',
  INVALID: '22023',
} as const;

export const CONSENT_COPY = {
  required: 'Please agree to the Terms and Conditions and acknowledge the Privacy Policy.',
  forbidden: "We couldn't record your consent. Please try again after your account is ready.",
  invalid: 'The Terms or Privacy version is no longer current. Please review them again.',
  generic: "We couldn't save your consent. Please try again.",
  loadFailed: "We couldn't load your consent status. Please try again.",
} as const;

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function parseUserConsent(row: unknown): UserConsent | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const userId = typeof record.user_id === 'string' ? record.user_id : null;
  const termsVersion = toText(record.terms_version);
  const termsAcceptedAt = toText(record.terms_accepted_at);
  const privacyVersion = toText(record.privacy_version);
  const privacyAcknowledgedAt = toText(record.privacy_acknowledged_at);
  if (
    userId === null ||
    termsVersion === null ||
    termsAcceptedAt === null ||
    privacyVersion === null ||
    privacyAcknowledgedAt === null
  ) {
    return null;
  }
  return {
    userId,
    termsVersion,
    termsAcceptedAt,
    privacyVersion,
    privacyAcknowledgedAt,
  };
}

export function parseUserConsentResult(data: unknown): UserConsent | null {
  const rows = Array.isArray(data) ? data : data !== null && data !== undefined ? [data] : [];
  return parseUserConsent(rows[0] ?? null);
}

export function isCurrentLegalConsent(consent: UserConsent | null): boolean {
  if (consent === null) return false;
  return consent.termsVersion === TERMS_VERSION && consent.privacyVersion === PRIVACY_VERSION;
}

/** Both registration/legal-consent checkboxes must be explicitly checked. */
export function hasRequiredLegalAcceptance(
  acceptedTerms: boolean,
  acknowledgedPrivacy: boolean
): boolean {
  return acceptedTerms === true && acknowledgedPrivacy === true;
}

export function consentErrorCopy(error: unknown): string {
  const code = error instanceof UserConsentError ? error.code : null;
  if (code === CONSENT_ERROR.FORBIDDEN) return CONSENT_COPY.forbidden;
  if (code === CONSENT_ERROR.INVALID) return CONSENT_COPY.invalid;
  return CONSENT_COPY.generic;
}

export async function getMyConsent(): Promise<UserConsent | null> {
  const result = await supabase.rpc('get_my_consent');
  if (result.error) {
    throw new UserConsentError(result.error.message || CONSENT_COPY.loadFailed, result.error.code ?? null);
  }
  return parseUserConsentResult(result.data);
}

export async function recordMyConsent(): Promise<UserConsent> {
  const result = await supabase.rpc('record_my_consent', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (result.error) {
    throw new UserConsentError(result.error.message || CONSENT_COPY.generic, result.error.code ?? null);
  }
  const consent = parseUserConsentResult(result.data);
  if (consent === null) {
    throw new UserConsentError(CONSENT_COPY.generic, null);
  }
  return consent;
}

/** Persist only after both checkboxes, a session, and an authoritative users row. */
export function registrationConsentShouldPersistNow(input: {
  acceptedTerms: boolean;
  acknowledgedPrivacy: boolean;
  hasSession: boolean;
  accountBootstrapReady: boolean;
  consentAlreadyCurrent: boolean;
}): boolean {
  return (
    hasRequiredLegalAcceptance(input.acceptedTerms, input.acknowledgedPrivacy) &&
    input.hasSession === true &&
    input.accountBootstrapReady === true &&
    input.consentAlreadyCurrent !== true
  );
}

export type OwnUsersRowWaitOptions = {
  attempts?: number;
  delayMs?: number;
};

const OWN_USERS_ROW_ATTEMPTS = 20;
const OWN_USERS_ROW_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForOwnUsersRow(
  options?: OwnUsersRowWaitOptions
): Promise<boolean> {
  const attempts = options?.attempts ?? OWN_USERS_ROW_ATTEMPTS;
  const delayMs = options?.delayMs ?? OWN_USERS_ROW_DELAY_MS;
  const auth = await supabase.auth.getUser();
  const userId = auth.data?.user?.id;
  if (typeof userId !== 'string' || userId.length === 0) {
    return false;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result: { data: { id?: unknown } | null; error: { message?: string; code?: string } | null } =
      await supabase.from('users').select('id').eq('id', userId).maybeSingle();
    const rowId = typeof result.data?.id === 'string' ? result.data.id : null;
    if (!result.error && rowId === userId) {
      return true;
    }
    if (attempt < attempts - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }
  return false;
}

export async function persistCurrentLegalConsent(): Promise<UserConsent> {
  await recordMyConsent();
  const confirmed = await getMyConsent();
  if (!isCurrentLegalConsent(confirmed) || confirmed === null) {
    throw new UserConsentError(CONSENT_COPY.generic, null);
  }
  return confirmed;
}

export async function persistCurrentLegalConsentAfterSignup(
  options?: OwnUsersRowWaitOptions
): Promise<UserConsent> {
  const ready = await waitForOwnUsersRow(options);
  if (!ready) {
    throw new UserConsentError(CONSENT_COPY.forbidden, CONSENT_ERROR.FORBIDDEN);
  }
  return persistCurrentLegalConsent();
}
