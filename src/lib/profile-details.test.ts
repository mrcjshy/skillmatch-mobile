import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  ageOn, composeFullName, homeAddressLabel, loadMyHomeLocation, saveMyHomeLocation, formatBirthDate, formatHomeAddress, formatJobYears, loadAdminAccountProfile,
  loadMyProfileDetails, loadProfileCompletion, parseAdminAccountProfile, profileDetailsRpcArgs, splitLegacyName, validateProfileDetails,
  validateWorkerResume, workerResumeRpcArgs, type ProfileDetailsInput, type WorkerResumeInput,
} from './profile-details';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const rpc = vi.mocked(supabase.rpc);
beforeEach(() => rpc.mockReset());

const TODAY = new Date('2026-11-03T04:00:00Z'); // Nov 3, 12:00 Manila
const details: ProfileDetailsInput = {
  firstName: ' Juan ', middleName: 'Dela', lastName: 'Cruz', suffix: 'Jr.', street: '12  M. Almeda St.',
  barangay: 'San Roque', city: 'Pateros', province: 'Metro Manila', accountType: null, businessName: '',
};
const resume: WorkerResumeInput = {
  birthDate: '1990-05-21', educationLevel: 'vocational', schoolName: '',
  jobs: [{ employer: 'ABC Builders', role: 'Carpenter', startYear: '2018', endYear: '2021', current: false },
    { employer: 'Self-employed', role: 'Plumber', startYear: '2021', endYear: '', current: true }],
  skills: [{ skillId: 'ac36af46-4c0c-4c6e-a5a7-4ae375521913' }],
};

describe('REG-01 profile details', () => {
  it('composes the display name from tidy parts', () => {
    expect(composeFullName(details)).toBe('Juan Dela Cruz Jr.');
    expect(composeFullName({ ...details, middleName: ' ', suffix: '' })).toBe('Juan Cruz');
  });

  it('requires name and street for both roles; Clients are not asked Individual or Business', () => {
    expect(validateProfileDetails(details, 'worker')).toEqual({});
    expect(Object.keys(validateProfileDetails({ ...details, firstName: ' ', street: '' }, 'worker')).sort()).toEqual(['firstName', 'street']);
    expect(validateProfileDetails({ ...details, lastName: 'x'.repeat(61) }, 'worker').lastName).toMatch(/60/);
    expect(validateProfileDetails(details, 'client')).toEqual({});
    expect(validateProfileDetails({ ...details, accountType: 'business', businessName: '' }, 'client')).toEqual({});
  });

  it('sends the server-required account-type placeholder for Clients only, and never a business name', () => {
    expect(profileDetailsRpcArgs({ ...details, accountType: 'business', businessName: 'Shop' }, 'worker'))
      .toMatchObject({ p_first_name: 'Juan', p_address_street: '12 M. Almeda St.', p_client_account_type: null, p_business_name: null });
    expect(profileDetailsRpcArgs({ ...details, accountType: 'business', businessName: 'Shop' }, 'client'))
      .toMatchObject({ p_client_account_type: null, p_business_name: null });
    expect(profileDetailsRpcArgs({ ...details, middleName: ' ' }, 'worker').p_middle_name).toBeNull();
  });

  it('always saves the Santa Ana, Pateros service area, whatever the form state holds', () => {
    expect(profileDetailsRpcArgs({ ...details, barangay: 'San Roque', city: 'Taguig', province: 'Rizal' }, 'worker')).toMatchObject({
      p_address_barangay: 'Santa Ana', p_address_city: 'Pateros', p_address_province: 'Metro Manila',
    });
    expect(validateProfileDetails({ ...details, barangay: '', city: '', province: '' }, 'worker')).toEqual({});
  });

  it('splits a legacy full name for prefill only', () => {
    expect(splitLegacyName('  Maria  Clara Santos ')).toEqual({ firstName: 'Maria Clara', lastName: 'Santos' });
    expect(splitLegacyName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
  });
});

describe('REG-01 Worker resume', () => {
  it('computes age on the Manila date', () => {
    expect(ageOn('2008-11-03', TODAY)).toBe(18);
    expect(ageOn('2008-11-04', TODAY)).toBe(17);
    expect(ageOn('2001-02-30', TODAY)).toBeNaN();
    expect(ageOn('1990/05/21', TODAY)).toBeNaN();
  });

  it('accepts a complete resume and rejects each broken field', () => {
    expect(validateWorkerResume(resume, TODAY)).toEqual({});
    expect(validateWorkerResume({ ...resume, birthDate: '2010-01-01' }, TODAY).birthDate).toMatch(/18 to 80/);
    expect(validateWorkerResume({ ...resume, educationLevel: null }, TODAY).educationLevel).toBeTruthy();
    expect(validateWorkerResume({ ...resume, skills: [] }, TODAY).skills).toMatch(/at least one/);
    // REG-03 (owner, 2026-11-06): a skill is chosen without years of experience.
    expect(validateWorkerResume({ ...resume, skills: [{ skillId: 's' }] }, TODAY)).toEqual({});
    const badJob = validateWorkerResume({ ...resume, jobs: [{ employer: '', role: 'x', startYear: '2027', endYear: '2020', current: false }] }, TODAY);
    expect(Object.keys(badJob).sort()).toEqual(['job0.employer', 'job0.endYear', 'job0.startYear']);
    expect(validateWorkerResume({ ...resume, jobs: Array(4).fill(resume.jobs[1]) }, TODAY).jobs).toMatch(/up to 3/);
  });

  it('sends skill ids without years (REG-03) and null for a current job', () => {
    expect(workerResumeRpcArgs(resume)).toEqual({
      p_birth_date: '1990-05-21', p_education_level: 'vocational', p_school_name: null,
      p_work_history: [
        { employer: 'ABC Builders', role: 'Carpenter', start_year: 2018, end_year: 2021 },
        { employer: 'Self-employed', role: 'Plumber', start_year: 2021, end_year: null },
      ],
      p_skills: [{ skill_id: 'ac36af46-4c0c-4c6e-a5a7-4ae375521913' }],
    });
  });

  it('REG-03: prefills chosen skills by id only and never reads years of experience', async () => {
    const reads: [string, string][] = [];
    const rowsFor: Record<string, unknown> = {
      users: { first_name: 'Juan', last_name: 'Cruz', full_name: 'Juan Cruz', birth_date: '1990-05-21', profile_completed_at: '2026-11-03T00:00:00Z' },
      worker_profiles: { id: 'wp-1', education_level: 'vocational', school_name: null, work_history: [], resume_completed_at: '2026-11-03T00:00:00Z' },
      worker_skills: [{ skill_id: 'skill-a', years_experience: 4 }],
    };
    vi.mocked(supabase.from).mockImplementation(((table: string) => ({
      select: (columns: string) => {
        reads.push([table, columns]);
        const reply = { data: rowsFor[table], error: null };
        return { eq: () => (table === 'worker_skills' ? Promise.resolve(reply) : { maybeSingle: () => Promise.resolve(reply) }) };
      },
    })) as never);
    const mine = await loadMyProfileDetails('u1', 'worker');
    expect(mine.resume?.skills).toEqual([{ skillId: 'skill-a' }]);
    expect(reads.find(([table]) => table === 'worker_skills')).toEqual(['worker_skills', 'skill_id']);
    vi.mocked(supabase.from).mockReset();
  });
});

describe('REG-01 completion gate read', () => {
  it('answers only for an exact single row', async () => {
    rpc.mockResolvedValueOnce({ data: [{ profile_complete: true, resume_complete: false }], error: null } as never);
    await expect(loadProfileCompletion()).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: [{ profile_complete: true, resume_complete: true }], error: null } as never);
    await expect(loadProfileCompletion()).resolves.toBe(true);
    for (const data of [[], null, [{ profile_complete: true }], [{ profile_complete: 'yes', resume_complete: true }]]) {
      rpc.mockResolvedValueOnce({ data, error: null } as never);
      await expect(loadProfileCompletion()).rejects.toThrow();
    }
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } } as never);
    await expect(loadProfileCompletion()).rejects.toThrow();
  });
});

const id = '12345678-1234-1234-1234-123456789abc';
const clientRow = {
  user_id: id, role: 'client', full_name: 'Ana Santos', first_name: 'Ana', middle_name: null, last_name: 'Santos',
  name_suffix: null, email: 'ana@example.test', phone: '+639171234567', address_street: '5 B. Morcilla',
  address_barangay: 'Poblacion', address_city: 'Pateros', address_province: 'Metro Manila',
  client_account_type: 'business', business_name: 'Santos Bakery', profile_completed_at: '2026-11-03T00:00:00Z',
};
const workerRow = {
  ...clientRow, role: 'worker', client_account_type: null, business_name: null, birth_date: '1990-05-21',
  education_level: 'vocational', school_name: null, resume_completed_at: '2026-11-03T00:00:00Z',
  work_history: [{ employer: 'ABC', role: 'Carpenter', start_year: 2018, end_year: null }],
  skills: [{ name: 'Carpentry', proficiency: 'expert', years: 7 }],
};

describe('REG-01 Administrator profile read', () => {
  it('accepts exact Client and Worker objects for the requested account', () => {
    expect(parseAdminAccountProfile(clientRow, id)).toEqual(clientRow);
    expect(parseAdminAccountProfile(workerRow, id.toUpperCase())).toEqual(workerRow);
  });

  it('rejects extra or missing keys, another account, cross-role keys and malformed resume entries', () => {
    for (const bad of [
      { ...clientRow, password: 'x' }, { ...clientRow, phone: undefined }, { ...clientRow, user_id: '12345678-1234-1234-1234-123456789abd' },
      { ...clientRow, birth_date: null }, { ...workerRow, education_level: 'phd' }, { ...workerRow, skills: [{ name: 'X', years: 'many', proficiency: null }] },
      { ...workerRow, work_history: [{ employer: 'A', role: 'B', start_year: '2018', end_year: null }] }, { ...clientRow, role: 'administrator' }, null, [clientRow],
    ]) expect(() => parseAdminAccountProfile(bad, id)).toThrow();
  });

  it('calls the Administrator RPC and maps a denial', async () => {
    rpc.mockResolvedValueOnce({ data: workerRow, error: null } as never);
    await expect(loadAdminAccountProfile(id)).resolves.toMatchObject({ role: 'worker' });
    expect(rpc).toHaveBeenCalledWith('get_admin_account_profile', { p_user_id: id });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } } as never);
    await expect(loadAdminAccountProfile(id)).rejects.toThrow(/no longer have access/);
  });

  it('formats address, job years and birth date with age', () => {
    expect(formatHomeAddress(clientRow)).toBe('5 B. Morcilla, Brgy. Poblacion, Pateros, Metro Manila');
    expect(formatHomeAddress({ address_street: null, address_barangay: null, address_city: null, address_province: null })).toBeNull();
    expect(formatJobYears({ start_year: 2018, end_year: null })).toBe('2018 – Present');
    expect(formatBirthDate('1990-05-21', TODAY)).toBe('May 21, 1990 (age 36)');
  });
});

describe('REG-02 Client home pin', () => {
  it('saves the pin through the RPC and explains an out-of-area pin', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await saveMyHomeLocation({ latitude: 14.545, longitude: 121.069 });
    expect(rpc).toHaveBeenCalledWith('save_my_home_location', { p_latitude: 14.545, p_longitude: 121.069 });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } } as never);
    await expect(saveMyHomeLocation({ latitude: 14.6, longitude: 121.2 })).rejects.toThrow(/inside Barangay Santa Ana/);
  });

  it('labels the home with the saved street and the service area', () => {
    expect(homeAddressLabel(' 12  M. Almeda St. ')).toBe('12 M. Almeda St., Santa Ana, Pateros');
    expect(homeAddressLabel('')).toBe('Santa Ana, Pateros');
  });

  it('loads the sign-up home as a ready Job location, or null without a pin', async () => {
    const maybeSingle = vi.fn();
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) } as never);
    maybeSingle.mockResolvedValueOnce({ data: { home_latitude: 14.545, home_longitude: 121.069, address_street: '12 M. Almeda St.' }, error: null });
    await expect(loadMyHomeLocation('u1')).resolves.toEqual({ pin: { latitude: 14.545, longitude: 121.069 }, address: '12 M. Almeda St., Santa Ana, Pateros' });
    maybeSingle.mockResolvedValueOnce({ data: { home_latitude: null, home_longitude: null, address_street: 'x' }, error: null });
    await expect(loadMyHomeLocation('u1')).resolves.toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(loadMyHomeLocation('u1')).resolves.toBeNull();
  });
});
