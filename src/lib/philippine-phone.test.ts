import { describe, expect, it } from 'vitest';

import { formatPhilippineMobileInput, normalizePhilippineMobile } from './philippine-phone';

describe('Philippine mobile numbers', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['(+63) 917-123-4567', '+639171234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhilippineMobile(input)).toBe(expected);
  });

  it.each(['917123456', '91712345678', '+14155552671', '021234567', 'abc09171234567']) (
    'rejects %s',
    (input) => expect(normalizePhilippineMobile(input)).toBeNull()
  );

  it('formats a valid national number for the registration field', () => {
    expect(formatPhilippineMobileInput('09171234567')).toBe('917 123 4567');
  });
});
