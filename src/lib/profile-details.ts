import { isCanonicalUserId } from './admin-user-detail';
import type { CanonicalJobLocation } from './canonical-job-location';
import type { JobPin } from './job-location';
import type { CatalogSkill } from './skill-catalog';
import { supabase } from './supabase';

/**
 * REG-01: structured registration details for Workers and Clients and the lean Worker resume.
 *
 * Every rule here mirrors `save_my_profile_details` / `save_my_worker_resume`; the server is the
 * authority and re-checks all of it. SkillMatch's beneficiaries all live in Barangay Santa Ana,
 * Pateros (owner, 2026-11-04), so the home address is the house number and street only; barangay,
 * city and province are always the service area. It is still stored apart from the deployment
 * scope (`users.barangay` / `users.city`) that matching reads.
 */

export const NAME_MAX = 60;
export const SUFFIX_MAX = 10;
export const STREET_MAX = 160;
export const PLACE_MAX = 80;
export const BUSINESS_MAX = 120;
export const SCHOOL_MAX = 120;
export const EMPLOYER_MAX = 120;
export const JOB_ROLE_MAX = 80;
export const MAX_JOBS = 3;
export const MAX_RESUME_SKILLS = 10;
export const MIN_WORKER_AGE = 18;
export const MAX_WORKER_AGE = 80;
export const FIRST_JOB_YEAR = 1960;

/** The only service area: every Worker and Client lives here. Never user-supplied. */
export const SERVICE_AREA = { barangay: 'Santa Ana', city: 'Pateros', province: 'Metro Manila' } as const;
export const SERVICE_AREA_LABEL = `Barangay ${SERVICE_AREA.barangay}, ${SERVICE_AREA.city}, ${SERVICE_AREA.province}`;

export const EDUCATION_LEVELS = [
  'none', 'elementary', 'high_school', 'senior_high', 'vocational', 'college_undergrad', 'college_graduate', 'postgraduate',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  none: 'No formal schooling',
  elementary: 'Elementary',
  high_school: 'High school',
  senior_high: 'Senior high school',
  vocational: 'Vocational / TESDA',
  college_undergrad: 'Some college',
  college_graduate: 'College graduate',
  postgraduate: 'Postgraduate',
};
export const isEducationLevel = (value: unknown): value is EducationLevel =>
  typeof value === 'string' && (EDUCATION_LEVELS as readonly string[]).includes(value);

export type ClientAccountType = 'individual' | 'business';

export type ProfileDetailsInput = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  /** Clients only. */
  accountType: ClientAccountType | null;
  businessName: string;
};

export type WorkHistoryEntry = { employer: string; role: string; startYear: string; endYear: string; current: boolean };
/** REG-03 (owner, 2026-11-06): a resume skill is its catalog id only; years of experience are not asked. */
export type ResumeSkillInput = { skillId: string };

export type WorkerResumeInput = {
  /** YYYY-MM-DD. */
  birthDate: string;
  educationLevel: EducationLevel | null;
  schoolName: string;
  jobs: WorkHistoryEntry[];
  skills: ResumeSkillInput[];
};

export type FieldErrors = Partial<Record<string, string>>;

/** Collapses inner whitespace and trims, as the server does. */
export const tidy = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function composeFullName(input: Pick<ProfileDetailsInput, 'firstName' | 'middleName' | 'lastName' | 'suffix'>): string {
  return [input.firstName, input.middleName, input.lastName, input.suffix].map(tidy).filter(Boolean).join(' ');
}

function text(errors: FieldErrors, key: string, value: string, max: number, required: boolean, label: string) {
  const v = tidy(value);
  if (!v && required) errors[key] = `Enter your ${label}.`;
  else if (v.length > max) errors[key] = `Keep your ${label} to ${max} characters.`;
}

export function validateProfileDetails(input: ProfileDetailsInput, role: 'worker' | 'client'): FieldErrors {
  const errors: FieldErrors = {};
  text(errors, 'firstName', input.firstName, NAME_MAX, true, 'first name');
  text(errors, 'middleName', input.middleName, NAME_MAX, false, 'middle name');
  text(errors, 'lastName', input.lastName, NAME_MAX, true, 'last name');
  text(errors, 'suffix', input.suffix, SUFFIX_MAX, false, 'suffix');
  text(errors, 'street', input.street, STREET_MAX, true, 'house number and street');
  return errors;
}

/** Whole years between a YYYY-MM-DD birth date and today's date in Manila. NaN when invalid. */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return Number.NaN;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return Number.NaN;
  const manila = new Date(today.getTime() + 8 * 3600 * 1000);
  const [ty, tm, td] = [manila.getUTCFullYear(), manila.getUTCMonth() + 1, manila.getUTCDate()];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export function manilaYear(today: Date = new Date()): number {
  return new Date(today.getTime() + 8 * 3600 * 1000).getUTCFullYear();
}

const wholeNumber = (value: string): number | null => (/^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : null);

export function validateWorkerResume(input: WorkerResumeInput, today: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  const age = ageOn(input.birthDate, today);
  if (!input.birthDate) errors.birthDate = 'Enter your birth date.';
  else if (Number.isNaN(age)) errors.birthDate = 'Enter a real date as YYYY-MM-DD, such as 1990-05-21.';
  else if (age < MIN_WORKER_AGE || age > MAX_WORKER_AGE) errors.birthDate = `Workers must be ${MIN_WORKER_AGE} to ${MAX_WORKER_AGE} years old.`;
  if (input.educationLevel === null) errors.educationLevel = 'Choose your highest education.';
  text(errors, 'schoolName', input.schoolName, SCHOOL_MAX, false, 'school name');
  if (input.jobs.length > MAX_JOBS) errors.jobs = `Add up to ${MAX_JOBS} past jobs.`;
  const year = manilaYear(today);
  input.jobs.forEach((job, index) => {
    text(errors, `job${index}.employer`, job.employer, EMPLOYER_MAX, true, 'employer');
    text(errors, `job${index}.role`, job.role, JOB_ROLE_MAX, true, 'job title');
    const start = wholeNumber(job.startYear);
    if (start === null || start < FIRST_JOB_YEAR || start > year) errors[`job${index}.startYear`] = `Enter a start year from ${FIRST_JOB_YEAR} to ${year}.`;
    if (!job.current) {
      const end = wholeNumber(job.endYear);
      if (end === null || end > year || (start !== null && end < start)) errors[`job${index}.endYear`] = 'Enter an end year on or after the start year, or mark it as your current job.';
    }
  });
  if (input.skills.length === 0) errors.skills = 'Choose at least one skill.';
  else if (input.skills.length > MAX_RESUME_SKILLS) errors.skills = `Choose up to ${MAX_RESUME_SKILLS} skills.`;
  return errors;
}

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;

const orNull = (value: string): string | null => tidy(value) || null;

export function profileDetailsRpcArgs(input: ProfileDetailsInput, role: 'worker' | 'client') {
  return {
    p_first_name: tidy(input.firstName),
    p_middle_name: orNull(input.middleName),
    p_last_name: tidy(input.lastName),
    p_name_suffix: orNull(input.suffix),
    p_address_street: tidy(input.street),
    p_address_barangay: SERVICE_AREA.barangay,
    p_address_city: SERVICE_AREA.city,
    p_address_province: SERVICE_AREA.province,
    // Owner (2026-11-04): Clients are not asked Individual/Business; REG-02 made it optional.
    p_client_account_type: null,
    p_business_name: null,
  };
}

export function workerResumeRpcArgs(input: WorkerResumeInput) {
  return {
    p_birth_date: input.birthDate,
    p_education_level: input.educationLevel,
    p_school_name: orNull(input.schoolName),
    p_work_history: input.jobs.map((job) => ({
      employer: tidy(job.employer),
      role: tidy(job.role),
      start_year: Number(job.startYear.trim()),
      end_year: job.current ? null : Number(job.endYear.trim()),
    })),
    p_skills: input.skills.map((skill) => ({ skill_id: skill.skillId })),
  };
}

export class ProfileDetailsError extends Error {}

function saveError(code: string | undefined): ProfileDetailsError {
  if (code === '42501') return new ProfileDetailsError('Your account cannot save these details right now. Please sign in again.');
  if (code === '22023') return new ProfileDetailsError('Some details are not valid. Please check each field and try again.');
  return new ProfileDetailsError('Your details could not be saved. Please check your connection and try again.');
}

export async function saveMyProfileDetails(input: ProfileDetailsInput, role: 'worker' | 'client'): Promise<void> {
  const { error } = await supabase.rpc('save_my_profile_details', profileDetailsRpcArgs(input, role));
  if (error) throw saveError(error.code);
}

export async function saveMyWorkerResume(input: WorkerResumeInput): Promise<void> {
  const { error } = await supabase.rpc('save_my_worker_resume', workerResumeRpcArgs(input));
  if (error) throw saveError(error.code);
}

/* ------------------------------------------------------------------ *
 * Own details: prefill and the completion gate
 * ------------------------------------------------------------------ */

export type MyProfileDetails = {
  details: ProfileDetailsInput;
  /** REG-02: the Client's saved home pin; null for Workers or when not pinned yet. */
  homePin: JobPin | null;
  profileComplete: boolean;
  resume: WorkerResumeInput | null;
  resumeComplete: boolean;
};

const DETAIL_COLUMNS = 'first_name, middle_name, last_name, name_suffix, address_street, address_barangay, address_city, address_province, client_account_type, business_name, birth_date, profile_completed_at, full_name, home_latitude, home_longitude';
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Best-effort split of a legacy full name into first and last for prefill only. */
export function splitLegacyName(fullName: string): { firstName: string; lastName: string } {
  const parts = tidy(fullName).split(' ').filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/** Untrusted sign-up hints (registration_first_name / registration_last_name), used only to prefill. */
export type NameHint = { firstName?: unknown; lastName?: unknown };

export async function loadMyProfileDetails(userId: string, role: 'worker' | 'client', hint: NameHint = {}): Promise<MyProfileDetails> {
  const own = await supabase.from('users').select(DETAIL_COLUMNS).eq('id', userId).maybeSingle();
  if (own.error || !own.data) throw new ProfileDetailsError('Your details could not be loaded. Please try again.');
  const u = own.data as Record<string, unknown>;
  const legacy = typeof hint.firstName === 'string' && typeof hint.lastName === 'string' && tidy(hint.firstName) && tidy(hint.lastName)
    ? { firstName: tidy(hint.firstName).slice(0, NAME_MAX), lastName: tidy(hint.lastName).slice(0, NAME_MAX) }
    : splitLegacyName(str(u.full_name));
  const details: ProfileDetailsInput = {
    firstName: str(u.first_name) || legacy.firstName,
    middleName: str(u.middle_name),
    lastName: str(u.last_name) || legacy.lastName,
    suffix: str(u.name_suffix),
    street: str(u.address_street),
    barangay: SERVICE_AREA.barangay,
    city: SERVICE_AREA.city,
    province: SERVICE_AREA.province,
    accountType: u.client_account_type === 'individual' || u.client_account_type === 'business' ? u.client_account_type : null,
    businessName: str(u.business_name),
  };
  const profileComplete = typeof u.profile_completed_at === 'string';
  const homePin = parsePin(u.home_latitude, u.home_longitude);
  if (role === 'client') return { details, homePin, profileComplete, resume: null, resumeComplete: true };
  return loadWorkerResumePart(userId, details, profileComplete, u);
}

async function loadWorkerResumePart(
  userId: string, details: ProfileDetailsInput, profileComplete: boolean, u: Record<string, unknown>,
): Promise<MyProfileDetails> {
  const homePin = null;
  const wp = await supabase
    .from('worker_profiles')
    .select('id, education_level, school_name, work_history, resume_completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (wp.error) throw new ProfileDetailsError('Your resume could not be loaded. Please try again.');
  const p = (wp.data ?? {}) as Record<string, unknown>;
  let skills: ResumeSkillInput[] = [];
  if (typeof p.id === 'string') {
    const ws = await supabase.from('worker_skills').select('skill_id').eq('worker_id', p.id);
    if (ws.error) throw new ProfileDetailsError('Your skills could not be loaded. Please try again.');
    skills = ((ws.data ?? []) as Record<string, unknown>[])
      .filter((row) => typeof row.skill_id === 'string')
      .map((row) => ({ skillId: row.skill_id as string }));
  }
  const jobs = Array.isArray(p.work_history) ? (p.work_history as Record<string, unknown>[]) : [];
  return {
    details,
    homePin,
    profileComplete,
    resume: {
      birthDate: str(u.birth_date),
      educationLevel: isEducationLevel(p.education_level) ? p.education_level : null,
      schoolName: str(p.school_name),
      jobs: jobs.slice(0, MAX_JOBS).map((job) => ({
        employer: str(job.employer),
        role: str(job.role),
        startYear: Number.isInteger(job.start_year) ? String(job.start_year) : '',
        endYear: Number.isInteger(job.end_year) ? String(job.end_year) : '',
        current: job.end_year === null,
      })),
      skills,
    },
    resumeComplete: typeof p.resume_completed_at === 'string',
  };
}

/**
 * The caller's own completion (get_my_profile_completion). Returns true / false only for an exact
 * single-row answer; anything else throws, and the gate then lets the person through (it is a UX
 * step, never authorization) and asks again on a later launch.
 */
export async function loadProfileCompletion(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_my_profile_completion');
  const row = Array.isArray(data) && data.length === 1 ? (data[0] as Record<string, unknown>) : null;
  if (error || !row || Object.keys(row).length !== 2 ||
      typeof row.profile_complete !== 'boolean' || typeof row.resume_complete !== 'boolean') {
    throw new ProfileDetailsError('Profile completion could not be loaded.');
  }
  return row.profile_complete && row.resume_complete;
}

function parsePin(latitude: unknown, longitude: unknown): JobPin | null {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude } : null;
}

/** REG-02: the Client's own home pin; the server checks it is inside Santa Ana, Pateros. */
export async function saveMyHomeLocation(pin: JobPin): Promise<void> {
  const { error } = await supabase.rpc('save_my_home_location', { p_latitude: pin.latitude, p_longitude: pin.longitude });
  if (error) {
    if (error.code === '22023') throw new ProfileDetailsError('Your home pin must be inside Barangay Santa Ana, Pateros. Move the map and try again.');
    throw saveError(error.code);
  }
}

/** The address shown for a home pin: the saved street plus the fixed service area. */
export function homeAddressLabel(street: string): string {
  const s = tidy(street);
  return s ? `${s}, ${SERVICE_AREA.barangay}, ${SERVICE_AREA.city}` : `${SERVICE_AREA.barangay}, ${SERVICE_AREA.city}`;
}

/**
 * REG-02: the signed-in Client's sign-up home as a ready Job location (pin + address), or null when
 * not pinned yet or unreadable. Own-row read only.
 */
export async function loadMyHomeLocation(userId: string): Promise<CanonicalJobLocation | null> {
  const { data, error } = await supabase.from('users').select('home_latitude, home_longitude, address_street').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const pin = parsePin(row.home_latitude, row.home_longitude);
  return pin ? { pin, address: homeAddressLabel(str(row.address_street)) } : null;
}

/**
 * The caller's saved first name, used as the Home greeting name (owner, 2026-11-04). Null when
 * not saved yet or unreadable; callers then fall back to the first word of the full name.
 */
export async function loadMyFirstName(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('first_name').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const value = (data as Record<string, unknown>).first_name;
  return typeof value === 'string' && tidy(value) ? tidy(value) : null;
}

export async function loadSkillCatalog(): Promise<CatalogSkill[]> {
  const { data, error } = await supabase.from('skills').select('id, skill_name').order('skill_name');
  if (error) throw new ProfileDetailsError('The skill list could not be loaded. Please try again.');
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => typeof row.id === 'string' && typeof row.skill_name === 'string')
    .map((row) => ({ id: row.id as string, skill_name: row.skill_name as string }));
}

/* ------------------------------------------------------------------ *
 * Administrator read (get_admin_account_profile)
 * ------------------------------------------------------------------ */

export type AdminJob = { employer: string; role: string; start_year: number; end_year: number | null };
/** The RPC still sends proficiency and years (installed builds parse them); no screen shows either. */
export type AdminSkill = { name: string; proficiency: string | null; years: number | null };
export type AdminAccountProfile = {
  user_id: string;
  role: 'worker' | 'client';
  full_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  name_suffix: string | null;
  email: string;
  phone: string;
  address_street: string | null;
  address_barangay: string | null;
  address_city: string | null;
  address_province: string | null;
  client_account_type: ClientAccountType | null;
  business_name: string | null;
  profile_completed_at: string | null;
  birth_date?: string | null;
  education_level?: EducationLevel | null;
  school_name?: string | null;
  work_history?: AdminJob[];
  skills?: AdminSkill[];
  resume_completed_at?: string | null;
};

const COMMON_PROFILE_KEYS = [
  'user_id', 'role', 'full_name', 'first_name', 'middle_name', 'last_name', 'name_suffix', 'email', 'phone',
  'address_street', 'address_barangay', 'address_city', 'address_province', 'client_account_type', 'business_name',
  'profile_completed_at',
];
const WORKER_PROFILE_KEYS = [...COMMON_PROFILE_KEYS, 'birth_date', 'education_level', 'school_name', 'work_history', 'resume_completed_at', 'skills'];

const nullableString = (value: unknown): boolean => value === null || typeof value === 'string';
const nullableInt = (value: unknown): boolean => value === null || Number.isInteger(value);

export function parseAdminAccountProfile(value: unknown, targetUserId: string): AdminAccountProfile {
  const fail = () => { throw new ProfileDetailsError('Invalid profile response'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  const keys = row.role === 'worker' ? WORKER_PROFILE_KEYS : row.role === 'client' ? COMMON_PROFILE_KEYS : null;
  const actual = Object.keys(row);
  if (!keys || actual.length !== keys.length || !actual.every((k) => keys.includes(k)) ||
      !isCanonicalUserId(row.user_id) || row.user_id.toLowerCase() !== targetUserId.toLowerCase() ||
      typeof row.full_name !== 'string' || typeof row.email !== 'string' || typeof row.phone !== 'string' ||
      !['first_name', 'middle_name', 'last_name', 'name_suffix', 'address_street', 'address_barangay', 'address_city',
        'address_province', 'business_name', 'profile_completed_at'].every((k) => nullableString(row[k])) ||
      !(row.client_account_type === null || row.client_account_type === 'individual' || row.client_account_type === 'business')) {
    fail();
  }
  if (row.role === 'worker') {
    if (!nullableString(row.birth_date) || !(row.education_level === null || isEducationLevel(row.education_level)) ||
        !nullableString(row.school_name) || !nullableString(row.resume_completed_at) ||
        !Array.isArray(row.work_history) || !Array.isArray(row.skills) ||
        !(row.work_history as unknown[]).every((j) => !!j && typeof j === 'object' &&
          typeof (j as AdminJob).employer === 'string' && typeof (j as AdminJob).role === 'string' &&
          Number.isInteger((j as AdminJob).start_year) && nullableInt((j as AdminJob).end_year)) ||
        !(row.skills as unknown[]).every((s) => !!s && typeof s === 'object' && typeof (s as AdminSkill).name === 'string' &&
          nullableString((s as AdminSkill).proficiency) && nullableInt((s as AdminSkill).years))) {
      fail();
    }
  }
  return row as AdminAccountProfile;
}

export class AdminProfileAccessError extends Error {}

export async function loadAdminAccountProfile(targetUserId: string): Promise<AdminAccountProfile> {
  if (!isCanonicalUserId(targetUserId)) throw new ProfileDetailsError('Invalid profile target');
  const { data, error } = await supabase.rpc('get_admin_account_profile', { p_user_id: targetUserId });
  if (error) {
    if (error.code === '42501') throw new AdminProfileAccessError('You no longer have access to Admin profiles.');
    throw new ProfileDetailsError('Unable to load this profile. Please try again.');
  }
  return parseAdminAccountProfile(data, targetUserId);
}

/* ------------------------------------------------------------------ *
 * Shared presentation
 * ------------------------------------------------------------------ */

export function formatHomeAddress(p: { address_street: string | null; address_barangay: string | null; address_city: string | null; address_province: string | null }): string | null {
  const parts = [p.address_street, p.address_barangay ? `Brgy. ${p.address_barangay}` : null, p.address_city, p.address_province].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function formatJobYears(job: { start_year: number; end_year: number | null }): string {
  return `${job.start_year} – ${job.end_year ?? 'Present'}`;
}

export function formatBirthDate(birthDate: string | null | undefined, today: Date = new Date()): string | null {
  if (!birthDate) return null;
  const age = ageOn(birthDate, today);
  const [y, m, d] = birthDate.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
  return Number.isNaN(age) ? label : `${label} (age ${age})`;
}
