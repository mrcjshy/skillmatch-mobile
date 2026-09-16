import { describe, expect, it } from 'vitest';

import { firstNameFromFullName, initialsFromName } from './initials';

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

describe('firstNameFromFullName', () => {
  it('returns the first token of a multi-part name', () => {
    expect(firstNameFromFullName('Jomerson Dela Cruz')).toBe('Jomerson');
  });

  it('returns a single-token name unchanged', () => {
    expect(firstNameFromFullName('Maria')).toBe('Maria');
  });

  it('normalizes surrounding and repeated whitespace', () => {
    expect(firstNameFromFullName('  Juan   Santos ')).toBe('Juan');
  });

  it('returns an em dash for an empty string', () => {
    expect(firstNameFromFullName('')).toBe('—');
  });

  it('returns an em dash for a whitespace-only name', () => {
    expect(firstNameFromFullName('   ')).toBe('—');
  });
});
