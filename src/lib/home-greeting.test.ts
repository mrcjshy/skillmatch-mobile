import { describe, expect, it } from 'vitest';

import { greetingForLocalHour, homeGreeting } from './home-greeting';

describe('greetingForLocalHour', () => {
  it('uses Good evening before 05:00', () => {
    expect(greetingForLocalHour(0)).toBe('Good evening');
    expect(greetingForLocalHour(4)).toBe('Good evening');
  });

  it('uses Good morning from 05:00 through 11:00', () => {
    expect(greetingForLocalHour(5)).toBe('Good morning');
    expect(greetingForLocalHour(11)).toBe('Good morning');
  });

  it('uses Good afternoon from 12:00 through 17:00', () => {
    expect(greetingForLocalHour(12)).toBe('Good afternoon');
    expect(greetingForLocalHour(17)).toBe('Good afternoon');
  });

  it('uses Good evening from 18:00 through 23:00', () => {
    expect(greetingForLocalHour(18)).toBe('Good evening');
    expect(greetingForLocalHour(23)).toBe('Good evening');
  });

  it('rejects hours outside 0-23', () => {
    expect(() => greetingForLocalHour(-1)).toThrow(RangeError);
    expect(() => greetingForLocalHour(24)).toThrow(RangeError);
    expect(() => greetingForLocalHour(5.5)).toThrow(RangeError);
  });
});

describe('homeGreeting', () => {
  it('reads the local hour from the provided Date', () => {
    expect(homeGreeting(new Date(2026, 0, 1, 9, 0, 0))).toBe('Good morning');
    expect(homeGreeting(new Date(2026, 0, 1, 15, 0, 0))).toBe('Good afternoon');
    expect(homeGreeting(new Date(2026, 0, 1, 21, 0, 0))).toBe('Good evening');
  });
});
