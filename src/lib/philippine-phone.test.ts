import { describe, expect, it } from 'vitest';

import {
  PHILIPPINE_MOBILE_COPY, checkPhilippineMobile, formatPhilippineMobileInput, normalizePhilippineMobile,
} from './philippine-phone';

describe('Philippine mobile numbers', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['(+63) 917-123-4567', '+639171234567'],
    // Supabase Auth returns `user.phone` as E.164 digits without the plus sign.
    ['639171234567', '+639171234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhilippineMobile(input)).toBe(expected);
  });

  it.each(['917123456', '91712345678', '+14155552671', '021234567', 'abc09171234567', '63917123456', '6391712345678', '638171234567', '+6309171234567']) (
    'rejects %s',
    (input) => expect(normalizePhilippineMobile(input)).toBeNull()
  );

  it('formats a valid national number for the registration field', () => {
    expect(formatPhilippineMobileInput('09171234567')).toBe('917 123 4567');
  });
});

describe('Live Philippine mobile check (owner, 2026-11-05)', () => {
  it.each(['09171234567', '9171234567', '+639171234567', '(+63) 917-123-4567', '639171234567', '917 123 4567'])(
    '%s is valid', (input) => {
      expect(checkPhilippineMobile(input)).toEqual({ state: 'valid', e164: '+639171234567' });
    });

  it('is empty for nothing typed', () => {
    expect(checkPhilippineMobile('   ')).toEqual({ state: 'empty' });
  });

  it.each([
    ['0', 10], ['09', 9], ['0917', 7], ['+', 10], ['+6', 10], ['+63', 10], ['+639', 9], ['6', 10], ['63', 10],
    ['917 123 456', 1],
  ])('%s is incomplete with %i digits to go', (input, remaining) => {
    expect(checkPhilippineMobile(input)).toEqual({ state: 'incomplete', remaining });
  });

  it.each([
    ['0817', PHILIPPINE_MOBILE_COPY.prefix],
    ['021234567', PHILIPPINE_MOBILE_COPY.prefix],
    ['+14155552671', PHILIPPINE_MOBILE_COPY.prefix],
    ['+6309171234567', PHILIPPINE_MOBILE_COPY.prefix],
    ['638171234567', PHILIPPINE_MOBILE_COPY.prefix],
    ['64', PHILIPPINE_MOBILE_COPY.prefix],
    ['091712345678', PHILIPPINE_MOBILE_COPY.tooLong],
    ['6391712345678', PHILIPPINE_MOBILE_COPY.tooLong],
    ['0917abc', PHILIPPINE_MOBILE_COPY.characters],
    ['0917.123', PHILIPPINE_MOBILE_COPY.characters],
    ['09+17', PHILIPPINE_MOBILE_COPY.characters],
  ])('%s is invalid right away', (input, message) => {
    expect(checkPhilippineMobile(input)).toEqual({ state: 'invalid', message });
  });

  it('agrees with the normalizer: valid exactly when the number would be saved', () => {
    const samples = ['09171234567', '9171234567', '+639171234567', '639171234567', '(+63) 917-123-4567', '917123456',
      '91712345678', '+14155552671', '021234567', 'abc09171234567', '63917123456', '6391712345678', '638171234567',
      '+6309171234567', '', '0', '+63', '09998887777', '+63 999 888 7777'];
    for (const input of samples) {
      const check = checkPhilippineMobile(input);
      const normalized = normalizePhilippineMobile(input);
      expect(check.state === 'valid' ? check.e164 : null, input).toBe(normalized);
    }
  });

  it('counts the digits left in plain words', () => {
    expect(PHILIPPINE_MOBILE_COPY.remaining(1)).toBe('1 more digit');
    expect(PHILIPPINE_MOBILE_COPY.remaining(7)).toBe('7 more digits');
  });
});
