import { describe, expect, it, vi } from 'vitest';

import {
  PHONE_SIGN_IN_COPY,
  classifyPhoneOtpSendError,
  isPhoneSignInEnabled,
  requestPhoneSignInOtp,
  verifyPhoneSignInOtp,
} from './phone-otp';

const sendClient = (result: any) => ({ signInWithOtp: vi.fn(async () => result) });
const verifyClient = (result: any) => ({ verifyOtp: vi.fn(async () => result) });

describe('phone sign-in flag', () => {
  it('is fail-closed: only the exact `true` value enables it', () => {
    expect(isPhoneSignInEnabled('true')).toBe(true);
    for (const value of [undefined, '', 'false', '0', '1', 'TRUE', 'yes']) {
      expect(isPhoneSignInEnabled(value)).toBe(false);
    }
  });
});

describe('requestPhoneSignInOtp', () => {
  it('normalizes to +63 and never lets sign-in create an account', async () => {
    const auth = sendClient({ error: null });
    await expect(requestPhoneSignInOtp(auth, '0917 123 4567')).resolves.toEqual({
      outcome: 'sent',
      phone: '+639171234567',
    });
    expect(auth.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      phone: '+639171234567',
      options: { shouldCreateUser: false, channel: 'sms' },
    });
  });

  it('rejects invalid numbers without calling Auth', async () => {
    const auth = sendClient({ error: null });
    for (const input of ['', '12345', '+14155552671', 'abc', '0917 123 456']) {
      await expect(requestPhoneSignInOtp(auth, input)).resolves.toEqual({ outcome: 'invalid_phone' });
    }
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('answers an unknown number exactly like a sent code (no account enumeration)', async () => {
    for (const error of [
      { status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' },
      { status: 400, code: 'user_not_found', message: 'User not found' },
      { status: 422, code: 'signup_disabled', message: 'Signups not allowed for this instance' },
    ]) {
      await expect(requestPhoneSignInOtp(sendClient({ error }), '09171234567')).resolves.toEqual({
        outcome: 'sent',
        phone: '+639171234567',
      });
    }
  });

  it('separates rate limits, provider failures, disabled provider and network failures', async () => {
    const at = (error: unknown) => requestPhoneSignInOtp(sendClient({ error }), '09171234567');
    await expect(at({ status: 429, code: 'over_sms_send_rate_limit' })).resolves.toEqual({ outcome: 'rate_limited' });
    await expect(at({ status: 429, message: 'For security purposes, you can only request this after 42 seconds.' })).resolves.toEqual({ outcome: 'rate_limited' });
    await expect(at({ status: 500, code: 'sms_send_failed', message: 'Error sending SMS' })).resolves.toEqual({ outcome: 'provider_failed' });
    await expect(at({ status: 502 })).resolves.toEqual({ outcome: 'provider_failed' });
    await expect(at({ status: 400, code: 'phone_provider_disabled' })).resolves.toEqual({ outcome: 'unavailable' });
    await expect(at({ status: 400, code: 'something_else' })).resolves.toEqual({ outcome: 'failed' });

    const thrown = { signInWithOtp: vi.fn(async () => { throw new Error('offline'); }) };
    await expect(requestPhoneSignInOtp(thrown, '09171234567')).resolves.toEqual({ outcome: 'failed' });
  });

  it('classifies errors from status, code and message alone', () => {
    expect(classifyPhoneOtpSendError({ code: 'over_request_rate_limit' })).toBe('rate_limited');
    expect(classifyPhoneOtpSendError({ message: 'Signups not allowed for otp' })).toBe('sent');
    expect(classifyPhoneOtpSendError(null)).toBe('failed');
    expect(classifyPhoneOtpSendError('bad')).toBe('failed');
  });
});

describe('verifyPhoneSignInOtp', () => {
  it('verifies through Supabase with type sms and requires a returned session', async () => {
    const auth = verifyClient({ data: { session: { access_token: 'redacted' } }, error: null });
    await expect(verifyPhoneSignInOtp(auth, '0917 123 4567', '012345')).resolves.toBe('verified');
    expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      phone: '+639171234567',
      token: '012345',
      type: 'sms',
    });
    await expect(
      verifyPhoneSignInOtp(verifyClient({ data: { session: null }, error: null }), '09171234567', '012345')
    ).resolves.toBe('failed');
  });

  it('rejects malformed codes and numbers before calling Auth', async () => {
    const auth = verifyClient({ data: { session: {} }, error: null });
    await expect(verifyPhoneSignInOtp(auth, '09171234567', '12345')).resolves.toBe('invalid_code');
    await expect(verifyPhoneSignInOtp(auth, '09171234567', '12345a')).resolves.toBe('invalid_code');
    await expect(verifyPhoneSignInOtp(auth, '12345', '012345')).resolves.toBe('invalid_phone');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('maps wrong/expired codes, rate limits and network failures', async () => {
    const at = (error: unknown) =>
      verifyPhoneSignInOtp(verifyClient({ data: { session: null }, error }), '09171234567', '012345');
    await expect(at({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })).resolves.toBe('wrong_or_expired');
    await expect(at({ status: 400, message: 'Token has expired or is invalid' })).resolves.toBe('wrong_or_expired');
    await expect(at({ status: 429, code: 'over_request_rate_limit' })).resolves.toBe('rate_limited');
    await expect(at({ status: 500 })).resolves.toBe('failed');
    const thrown = { verifyOtp: vi.fn(async () => { throw new Error('offline'); }) };
    await expect(verifyPhoneSignInOtp(thrown, '09171234567', '012345')).resolves.toBe('failed');
  });

  it('copy never reveals whether the number has an account', () => {
    expect(PHONE_SIGN_IN_COPY.sent).toMatch(/^If this number is linked to a SkillMatch account/);
    expect(Object.values(PHONE_SIGN_IN_COPY).join(' ')).not.toMatch(/not found|no account|does not exist/i);
  });
});
