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

export async function requestPhoneChangeOtp(
  auth: Pick<PhoneChangeAuthClient, 'updateUser'>,
  phone: string
): Promise<boolean> {
  const normalized = normalizePhilippineMobile(phone);
  if (normalized === null) return false;
  try {
    const result = await auth.updateUser({ phone: normalized });
    return !result.error;
  } catch {
    return false;
  }
}

export async function verifyPhoneChangeOtp(
  auth: Pick<PhoneChangeAuthClient, 'verifyOtp'>,
  phone: string,
  token: string
): Promise<boolean> {
  const normalized = normalizePhilippineMobile(phone);
  if (normalized === null || !isValidPhoneVerificationCode(token)) return false;
  try {
    const result = await auth.verifyOtp({ phone: normalized, token, type: 'phone_change' });
    return !result.error;
  } catch {
    return false;
  }
}
