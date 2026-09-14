import { describe, expect, it } from 'vitest';

import * as clientProfile from './client-profile';
import {
  CLIENT_ACCOUNT_LOCKED_WRITE_FIELDS,
  CLIENT_HELP_PATH,
  CLIENT_PROFILE_PRESENTATION_FIELDS,
  presentClientProfile,
} from './client-profile';

describe('presentClientProfile', () => {
  it('presents existing account fields as display-only values', () => {
    const view = presentClientProfile({
      full_name: 'Client B',
      phone: '09170000000',
      email: 'clientb@example.test',
      barangay: 'Santa Ana',
      city: 'Pateros',
    });

    expect(view).toEqual({
      fullName: 'Client B',
      location: 'Santa Ana, Pateros',
      phone: '09170000000',
      email: 'clientb@example.test',
    });
  });

  it('presents placeholders when no account is loaded', () => {
    expect(presentClientProfile(null)).toEqual({
      fullName: '—',
      location: '—',
      phone: '—',
      email: '—',
    });
  });

  it('returns only presentation keys', () => {
    const view = presentClientProfile({
      full_name: 'Client B',
      phone: '09170000000',
      email: 'clientb@example.test',
      barangay: 'Santa Ana',
      city: 'Pateros',
    });

    expect(Object.keys(view).sort()).toEqual(['email', 'fullName', 'location', 'phone']);
    expect(view).not.toHaveProperty('role');
    expect(view).not.toHaveProperty('is_active');
    expect(view).not.toHaveProperty('barangay');
    expect(view).not.toHaveProperty('city');
  });
});

describe('client profile write surface', () => {
  it('names the account fields Client Profile must never write', () => {
    expect(CLIENT_ACCOUNT_LOCKED_WRITE_FIELDS).toEqual([
      'full_name',
      'phone',
      'email',
      'barangay',
      'city',
      'role',
      'is_active',
    ]);
  });

  it('names the presentation-only account fields', () => {
    expect(CLIENT_PROFILE_PRESENTATION_FIELDS).toEqual([
      'full_name',
      'phone',
      'email',
      'barangay',
      'city',
    ]);
  });

  it('does not introduce a Client account write payload', () => {
    expect(clientProfile).not.toHaveProperty('buildClientProfileInsertRow');
    expect(clientProfile).not.toHaveProperty('buildClientProfileUpdateRow');
    expect(clientProfile).not.toHaveProperty('updateClientAccount');
  });
});

describe('client Help navigation', () => {
  it('keeps Help at /client/help', () => {
    expect(CLIENT_HELP_PATH).toBe('/client/help');
  });
});
