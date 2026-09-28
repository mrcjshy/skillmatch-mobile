import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  getResendCooldownEndsAt,
  getResendCooldownSecondsRemaining,
  isValidEmailVerificationCode,
  normalizeVerificationEmail,
  resendSignupEmailOtp,
  verifySignupEmailOtp,
} from './email-verification';

describe('email verification', () => {
  it('normalizes surrounding whitespace and email casing', () => {
    expect(normalizeVerificationEmail('  Worker.Example@Example.COM  ')).toBe(
      'worker.example@example.com'
    );
  });

  it('accepts exactly six ASCII digits and nothing else', () => {
    expect(isValidEmailVerificationCode('012345')).toBe(true);
    for (const value of ['12345', '1234567', '123 45', '１２３４５６', 'abcdef']) {
      expect(isValidEmailVerificationCode(value)).toBe(false);
    }
  });

  it('verifies with the email OTP contract and trusts only a returned session', async () => {
    const session = { user: { id: 'verified-user' } } as unknown as Session;
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({ data: { session }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    const auth = { verifyOtp };

    await expect(
      verifySignupEmailOtp(auth, '  PERSON@Example.COM ', '012345')
    ).resolves.toBe(session);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '012345',
      type: 'email',
    });
    await expect(
      verifySignupEmailOtp(auth, 'person@example.com', '012345')
    ).resolves.toBeNull();
  });

  it('maps verification service failures to a safe null result', async () => {
    const backendError = { message: 'private backend detail' };
    await expect(
      verifySignupEmailOtp(
        {
          verifyOtp: vi.fn().mockResolvedValue({
            data: { session: null },
            error: backendError,
          }),
        },
        'person@example.com',
        '012345'
      )
    ).resolves.toBeNull();
    await expect(
      verifySignupEmailOtp(
        { verifyOtp: vi.fn().mockRejectedValue(backendError) },
        'person@example.com',
        '012345'
      )
    ).resolves.toBeNull();
  });

  it('resends only with the signup contract and maps failures safely', async () => {
    const resend = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'private backend detail' } })
      .mockRejectedValueOnce(new Error('private transport detail'));

    await expect(
      resendSignupEmailOtp({ resend }, '  PERSON@Example.COM ')
    ).resolves.toBe(true);
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
    });
    await expect(
      resendSignupEmailOtp({ resend }, 'person@example.com')
    ).resolves.toBe(false);
    await expect(
      resendSignupEmailOtp({ resend }, 'person@example.com')
    ).resolves.toBe(false);
  });

  it('calculates the visible 60-second resend cooldown deterministically', () => {
    const endsAt = getResendCooldownEndsAt(1_000);
    expect(endsAt).toBe(61_000);
    expect(getResendCooldownSecondsRemaining(endsAt, 1_000)).toBe(60);
    expect(getResendCooldownSecondsRemaining(endsAt, 1_500)).toBe(60);
    expect(getResendCooldownSecondsRemaining(endsAt, 60_001)).toBe(1);
    expect(getResendCooldownSecondsRemaining(endsAt, 61_000)).toBe(0);
    expect(getResendCooldownSecondsRemaining(endsAt, 90_000)).toBe(0);
  });
});
