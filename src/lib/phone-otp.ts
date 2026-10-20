import { normalizePhilippineMobile } from './philippine-phone';
import {
  classifySmsSendError,
  classifySmsVerifyError,
  isAuthRateLimited,
  isValidPhoneVerificationCode,
  readAuthErrorFields,
  type SmsSendOutcome,
  type SmsVerifyOutcome,
} from './phone-verification';

/**
 * SMS one-time-code SIGN-IN for an existing account whose Supabase Auth phone is already
 * confirmed (by the registration `phone_change` step). Supabase generates, sends and verifies
 * the code; the app never creates or checks a code itself.
 *
 * Sign-in only: `shouldCreateUser` is always false, so a phone sign-in can never create a
 * second (phone-only) Auth user. Phone-only registration is deliberately not offered: the
 * account model requires an email (users.email NOT NULL, D-010 email OTP).
 * The session returned by `verifyOtp` belongs to the same Auth user id, so the existing
 * `users` row, role and relationships apply unchanged; the root navigator routes by that row.
 */

/** Fail-closed: only the exact `true` value enables phone sign-in. */
export function isPhoneSignInEnabled(
  value: string | undefined = process.env.EXPO_PUBLIC_PHONE_SIGN_IN_ENABLED
): boolean {
  return value === 'true';
}

export const PHONE_SIGN_IN_COPY = {
  invalidPhone: 'Enter a valid Philippine mobile number, such as 0917 123 4567.',
  sent: 'If this number is linked to a SkillMatch account, a six-digit code was sent by SMS.',
  rateLimited: 'Too many code requests. Please wait a minute before trying again.',
  providerFailed: "We couldn't send a text message right now. Please try again later or sign in with email.",
  unavailable: 'Sign-in by text message is not available right now. Please sign in with email.',
  failed: 'Something went wrong. Please check your connection and try again.',
  invalidCode: 'Enter the six-digit code sent by SMS.',
  wrongOrExpired: 'That code is wrong or has expired. Check it, or request a new code.',
  verifyRateLimited: 'Too many attempts. Please wait a minute, then request a new code.',
  verifyFailed: "We couldn't sign you in with that code. Please try again.",
} as const;

export type PhoneOtpSendOutcome = SmsSendOutcome;

export type PhoneSignInRequestResult =
  | { outcome: 'sent'; phone: string }
  | { outcome: 'invalid_phone' | Exclude<PhoneOtpSendOutcome, 'sent'> };

export type PhoneSignInVerifyOutcome = SmsVerifyOutcome | 'invalid_phone' | 'invalid_code';

export type PhoneSignInAuthClient = {
  signInWithOtp(input: {
    phone: string;
    options: { shouldCreateUser: false; channel: 'sms' };
  }): Promise<{ error: unknown }>;
  verifyOtp(input: {
    phone: string;
    token: string;
    type: 'sms';
  }): Promise<{ data: { session: unknown } | null; error: unknown }>;
};

/**
 * Maps a send error. An unknown number (or disabled phone signup, which is what Auth reports
 * for an unknown number under shouldCreateUser:false) is answered as `sent`, so the screen
 * cannot be used to discover which numbers have accounts.
 */
export function classifyPhoneOtpSendError(error: unknown): PhoneOtpSendOutcome {
  const f = readAuthErrorFields(error);
  if (f === null) return 'failed';
  if (isAuthRateLimited(f)) return 'rate_limited';
  if (
    f.code === 'otp_disabled' ||
    f.code === 'user_not_found' ||
    f.code === 'signup_disabled' ||
    f.message.includes('signups not allowed') ||
    f.message.includes('user not found')
  ) {
    return 'sent';
  }
  return classifySmsSendError(f);
}

export async function requestPhoneSignInOtp(
  auth: Pick<PhoneSignInAuthClient, 'signInWithOtp'>,
  input: string
): Promise<PhoneSignInRequestResult> {
  const phone = normalizePhilippineMobile(input);
  if (phone === null) return { outcome: 'invalid_phone' };
  let outcome: PhoneOtpSendOutcome;
  try {
    const { error } = await auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false, channel: 'sms' },
    });
    outcome = error ? classifyPhoneOtpSendError(error) : 'sent';
  } catch {
    outcome = 'failed';
  }
  return outcome === 'sent' ? { outcome, phone } : { outcome };
}

export async function verifyPhoneSignInOtp(
  auth: Pick<PhoneSignInAuthClient, 'verifyOtp'>,
  input: string,
  token: string
): Promise<PhoneSignInVerifyOutcome> {
  const phone = normalizePhilippineMobile(input);
  if (phone === null) return 'invalid_phone';
  if (!isValidPhoneVerificationCode(token)) return 'invalid_code';
  try {
    const { data, error } = await auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) return classifySmsVerifyError(readAuthErrorFields(error));
    return data?.session ? 'verified' : 'failed';
  } catch {
    return 'failed';
  }
}
