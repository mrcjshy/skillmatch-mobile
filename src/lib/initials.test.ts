import { describe, expect, it } from 'vitest';

import { initialsFromName } from './initials';

describe('initialsFromName', () => {
  it('uses the first and last tokens of a full name', () => {
    expect(initialsFromName('Jomerson Cruz')).toBe('JC');
  });

  it('uses up to the first two characters of a single token', () => {
    expect(initialsFromName('Ana')).toBe('AN');
    expect(initialsFromName('J')).toBe('J');
  });

  it('normalizes surrounding and repeated whitespace', () => {
    expect(initialsFromName('  Jomerson   Cruz  ')).toBe('JC');
  });

  it('returns ? for empty or whitespace-only names', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });
});
