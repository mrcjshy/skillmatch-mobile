import { describe, expect, it, vi } from 'vitest';

import {
  getPhoneResendCooldownEndsAt,
  getPhoneResendCooldownSecondsRemaining,
  isAuthPhoneVerifiedForBootstrap,
  isPhoneOtpEnabled,
  isPhoneVerificationRequiredForBootstrap,
  isValidPhoneVerificationCode,
  requestPhoneChangeOtp,
  verifyPhoneChangeOtp,
} from './phone-verification';

describe('phone verification', () => {
  it('enables phone OTP only for the explicit true flag value', () => {
    expect(isPhoneOtpEnabled('true')).toBe(true);
    expect(isPhoneOtpEnabled(undefined)).toBe(false);
    expect(isPhoneOtpEnabled('false')).toBe(false);
    expect(isPhoneOtpEnabled('0')).toBe(false);
    expect(isPhoneOtpEnabled('unknown')).toBe(false);
    expect(isPhoneOtpEnabled('TRUE')).toBe(false);
  });

  it('requires an Auth-confirmed matching phone only while phone OTP is enabled', () => {
    const formatOnlyPhone = {
      registrationPhone: '+639171234567',
      authPhone: undefined,
      phoneConfirmedAt: undefined,
    };

    expect(isPhoneVerificationRequiredForBootstrap(formatOnlyPhone, 'false')).toBe(false);
    expect(isPhoneVerificationRequiredForBootstrap(formatOnlyPhone, undefined)).toBe(false);
    expect(isPhoneVerificationRequiredForBootstrap(formatOnlyPhone, 'true')).toBe(true);
    expect(isPhoneVerificationRequiredForBootstrap({
      ...formatOnlyPhone,
      authPhone: '+639171234567',
      phoneConfirmedAt: '2026-09-29T00:00:00Z',
    }, 'true')).toBe(false);
  });

  it('uses the existing-user phone change contract', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    await expect(requestPhoneChangeOtp({ updateUser }, '0917 123 4567')).resolves.toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ phone: '+639171234567' });
    await expect(verifyPhoneChangeOtp({ verifyOtp }, '+639171234567', '012345')).resolves.toBe(true);
    expect(verifyOtp).toHaveBeenCalledWith({
      phone: '+639171234567',
      token: '012345',
      type: 'phone_change',
    });
  });

  it('requires a confirmed Auth phone matching registration metadata', () => {
    expect(isAuthPhoneVerifiedForBootstrap({
      registrationPhone: '09171234567',
      authPhone: '+639171234567',
      phoneConfirmedAt: '2026-09-29T00:00:00Z',
    })).toBe(true);
    expect(isAuthPhoneVerifiedForBootstrap({
      registrationPhone: '09171234567',
      authPhone: '+639181234567',
      phoneConfirmedAt: '2026-09-29T00:00:00Z',
    })).toBe(false);
    expect(isAuthPhoneVerifiedForBootstrap({
      registrationPhone: '09171234567',
      authPhone: '+639171234567',
      phoneConfirmedAt: undefined,
    })).toBe(false);
  });

  it('accepts only six digits and calculates the resend cooldown', () => {
    expect(isValidPhoneVerificationCode('012345')).toBe(true);
    expect(isValidPhoneVerificationCode('12345')).toBe(false);
    const end = getPhoneResendCooldownEndsAt(1_000);
    expect(getPhoneResendCooldownSecondsRemaining(end, 1_000)).toBe(60);
    expect(getPhoneResendCooldownSecondsRemaining(end, 61_000)).toBe(0);
  });
});
