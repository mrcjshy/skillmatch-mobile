import type { User } from '@supabase/supabase-js';

import { normalizePhilippineMobile } from './philippine-phone';

export const PHONE_OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Phone OTP is fail-closed: only the exact approved `true` value enables it. */
export function isPhoneOtpEnabled(
  value: string | undefined = process.env.EXPO_PUBLIC_PHONE_OTP_ENABLED
): boolean {
  return value === 'true';
}

export const PHONE_VERIFICATION_COPY = {
  missingPhone: 'Your registration phone number is unavailable. Return to registration and try again.',
  invalidCode: 'Enter the six-digit code sent by SMS.',
  sendFailed: "We couldn't send a phone verification code. Please try again later.",
  verifyFailed: "We couldn't verify that code. Check it and try again.",
  wrongOrExpired: 'That code is wrong or has expired. Check it, or request a new code.',
  rateLimited: 'Too many attempts. Please wait a minute before trying again.',
  providerFailed: "We couldn't send a text message right now. Please try again later.",
  providerUnavailable: 'Phone verification by text message is not available right now. Please try again later.',
  setupFailed: 'Your phone is verified, but account setup could not finish. Please try again.',
  unavailable: 'Phone verification is unavailable and is not required for this build. Continue to finish account setup.',
} as const;

export type PhoneChangeAuthClient = {
  updateUser(input: { phone: string }): Promise<{ error: unknown }>;
  verifyOtp(input: {
    phone: string;
    token: string;
    type: 'phone_change';
  }): Promise<{ error: unknown }>;
};

export function registrationPhoneFromUser(user: Pick<User, 'user_metadata'> | null): string | null {
  const raw = user?.user_metadata?.registration_phone;
  return typeof raw === 'string' ? normalizePhilippineMobile(raw) : null;
}

export function isValidPhoneVerificationCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export function getPhoneResendCooldownEndsAt(nowMs: number): number {
  return nowMs + PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1_000;
}

export function getPhoneResendCooldownSecondsRemaining(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1_000));
}

export function isAuthPhoneVerifiedForBootstrap(input: {
  registrationPhone: string;
  authPhone: string | undefined;
  phoneConfirmedAt: string | undefined;
}): boolean {
  const intended = normalizePhilippineMobile(input.registrationPhone);
  const verified = normalizePhilippineMobile(input.authPhone ?? '');
  return intended !== null && verified === intended && Boolean(input.phoneConfirmedAt);
}

export function isPhoneVerificationRequiredForBootstrap(
  input: {
    registrationPhone: string;
    authPhone: string | undefined;
    phoneConfirmedAt: string | undefined;
  },
  featureFlag: string | undefined = process.env.EXPO_PUBLIC_PHONE_OTP_ENABLED
): boolean {
  return isPhoneOtpEnabled(featureFlag) && !isAuthPhoneVerifiedForBootstrap(input);
}

/** Supabase Auth error fields, read defensively; never logged or shown to the person. */
export type AuthErrorFields = { status: number; code: string; message: string };

export function readAuthErrorFields(error: unknown): AuthErrorFields | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  return {
    status: typeof e.status === 'number' ? e.status : 0,
    code: typeof e.code === 'string' ? e.code.toLowerCase() : '',
    message: typeof e.message === 'string' ? e.message.toLowerCase() : '',
  };
}

export function isAuthRateLimited(f: AuthErrorFields): boolean {
  return (
    f.status === 429 ||
    f.code.startsWith('over_') ||
    f.message.includes('rate limit') ||
    f.message.includes('only request this after')
  );
}

export type SmsSendOutcome = 'sent' | 'rate_limited' | 'provider_failed' | 'unavailable' | 'failed';
export type SmsVerifyOutcome = 'verified' | 'wrong_or_expired' | 'rate_limited' | 'failed';

/** Shared send-error mapping. Anything unrecognised (including phone_exists) is a generic failure. */
export function classifySmsSendError(f: AuthErrorFields | null): Exclude<SmsSendOutcome, 'sent'> {
  if (f === null) return 'failed';
  if (isAuthRateLimited(f)) return 'rate_limited';
  if (f.code === 'phone_provider_disabled' || f.message.includes('phone logins are disabled')) {
    return 'unavailable';
  }
  if (f.code === 'sms_send_failed' || f.status >= 500) return 'provider_failed';
  return 'failed';
}

/** Auth reports a wrong code and an expired code identically ("expired or is invalid"). */
export function classifySmsVerifyError(f: AuthErrorFields | null): Exclude<SmsVerifyOutcome, 'verified'> {
  if (f === null) return 'failed';
  if (isAuthRateLimited(f)) return 'rate_limited';
  if (f.code === 'otp_expired' || f.message.includes('expired or is invalid') || f.status === 403) {
    return 'wrong_or_expired';
  }
  return 'failed';
}

export async function requestPhoneChangeOtp(
  auth: Pick<PhoneChangeAuthClient, 'updateUser'>,
  phone: string
): Promise<SmsSendOutcome | 'invalid_phone'> {
  const normalized = normalizePhilippineMobile(phone);
  if (normalized === null) return 'invalid_phone';
  try {
    const result = await auth.updateUser({ phone: normalized });
    return result.error ? classifySmsSendError(readAuthErrorFields(result.error)) : 'sent';
  } catch {
    return 'failed';
  }
}

export async function verifyPhoneChangeOtp(
  auth: Pick<PhoneChangeAuthClient, 'verifyOtp'>,
  phone: string,
  token: string
): Promise<SmsVerifyOutcome | 'invalid_phone' | 'invalid_code'> {
  const normalized = normalizePhilippineMobile(phone);
  if (normalized === null) return 'invalid_phone';
  if (!isValidPhoneVerificationCode(token)) return 'invalid_code';
  try {
    const result = await auth.verifyOtp({ phone: normalized, token, type: 'phone_change' });
    return result.error ? classifySmsVerifyError(readAuthErrorFields(result.error)) : 'verified';
  } catch {
    return 'failed';
  }
}
