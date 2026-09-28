import type { Session } from '@supabase/supabase-js';

export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

export const EMAIL_VERIFICATION_COPY = {
  missingEmail:
    'Email verification could not be started. Return to registration and try again.',
  invalidCode: 'Enter the six-digit code from your verification email.',
  verificationFailed: "We couldn't verify that code. Check it and try again.",
  setupFailed:
    "Your email is verified, but we couldn't finish setting up your account. Please try again.",
  resendSucceeded: 'A new verification code was sent.',
  resendFailed: "We couldn't send a new code right now. Please try again later.",
} as const;

export type EmailVerificationAuthClient = {
  verifyOtp(input: {
    email: string;
    token: string;
    type: 'email';
  }): Promise<{
    data: { session: Session | null } | null;
    error: unknown;
  }>;
};

export type SignupEmailResendAuthClient = {
  resend(input: { type: 'signup'; email: string }): Promise<{ error: unknown }>;
};

export function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailVerificationCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export function getResendCooldownEndsAt(nowMs: number): number {
  return nowMs + EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1_000;
}

export function getResendCooldownSecondsRemaining(
  cooldownEndsAtMs: number,
  nowMs: number
): number {
  return Math.max(0, Math.ceil((cooldownEndsAtMs - nowMs) / 1_000));
}

export async function verifySignupEmailOtp(
  auth: EmailVerificationAuthClient,
  email: string,
  token: string
): Promise<Session | null> {
  try {
    const result = await auth.verifyOtp({
      email: normalizeVerificationEmail(email),
      token,
      type: 'email',
    });
    if (result.error || !result.data?.session) return null;
    return result.data.session;
  } catch {
    return null;
  }
}

export async function resendSignupEmailOtp(
  auth: SignupEmailResendAuthClient,
  email: string
): Promise<boolean> {
  try {
    const result = await auth.resend({
      type: 'signup',
      email: normalizeVerificationEmail(email),
    });
    return !result.error;
  } catch {
    return false;
  }
}
