/**
 * AI-02 — deterministic Auto Resume Builder: data, model, and fixed template.
 *
 * D-004 (LOCKED): source data is the Worker's EXISTING profile, skills and
 * portfolio; identifiers and personal data are merged client-side and never
 * sent to an external model; the output is a fixed HTML/CSS printable PDF;
 * no new table. This module is the deterministic core of that. No model of
 * any kind is involved here -- every string in the PDF is either a value read
 * from the Worker's own rows or a fixed label in this file.
 *
 * THE FACT SURFACE IS THE SCHEMA, AND ONLY THE SCHEMA
 * --------------------------------------------------
 * A resume normally has education, employment history, certificates, years
 * of experience, references. SkillMatch stores NONE of those, so the resume
 * has no such sections -- not empty ones, not placeholders, none. A section
 * exists only when a real source field exists AND holds data. The absence of
 * a field means the absence of the section. That is what "no invention"
 * means in practice, and it is enforced by the model shape: there is no
 * property a template could render for a fact the database cannot hold.
 *
 * IDENTITY COMES FROM THE SESSION
 * -------------------------------
 * The loader takes the authenticated account's own `users` row (already read
 * under RLS by the account provider) and derives everything else from
 * `worker_profiles.user_id = that id`. No Worker id is accepted from a caller.
 * Every read is an existing authenticated SELECT -- no RPC, no SECURITY
 * DEFINER, no broadened policy.
 *
 * RATING IS ONLY SHOWN WHEN IT IS REAL
 * -----------------------------------
 * `worker_profiles.rating_avg` defaults to 0 and is rewritten only by the
 * trusted rating routine, which stores the average of 1..5 scores. It can
 * therefore never be 0 once a rating exists, so 0 means exactly "no ratings
 * yet" and is rendered as that -- never as a score.
 *
 * ESCAPING
 * --------
 * Every Worker-controlled string is HTML-escaped before it touches the
 * template. The PDF is rendered locally, but the generated HTML is still a
 * document built from user input, and there is no reason to let a stray `<`
 * in a bio become markup.
 */

import { supabase } from '@/lib/supabase';
import type { AccountRecord } from '@/providers/account-provider';

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

export type Proficiency = 'beginner' | 'intermediate' | 'expert';
export type ProjectScale = 'small' | 'medium' | 'large';
export type Availability = 'available' | 'busy' | 'offline';

export type ResumeSkill = { name: string; proficiency: Proficiency | null };

export type ResumeProject = {
  title: string;
  description: string | null;
  scale: ProjectScale | null;
};

/**
 * Exactly what the fixed template can render. Optional sections are `null`
 * when their source data is absent, and the template omits them entirely.
 */
export type ResumeModel = {
  fullName: string;
  email: string;
  phone: string;
  barangay: string;
  city: string;
  /** `worker_profiles.bio`, trimmed; null when blank. The ONLY summary source. */
  summary: string | null;
  isVerified: boolean;
  availability: Availability | null;
  /** Genuine average when > 0; null means no ratings exist yet. */
  ratingAvg: number | null;
  skills: ResumeSkill[];
  projects: ResumeProject[];
};

/* ------------------------------------------------------------------ *
 * Copy (UI + PDF labels). Fixed.
 * ------------------------------------------------------------------ */

export const RESUME_COPY = {
  title: 'Auto Resume Builder',
  heading: 'Your resume, from your profile',
  disclosure:
    'SkillMatch uses only information already saved in your profile. It will not invent work history, education, certificates, or experience.',
  included: 'What will be included',
  personal: 'Personal information',
  summary: 'Professional summary',
  skills: 'Skills',
  projects: 'Portfolio / Projects',
  profile: 'SkillMatch profile',
  noSummary: 'No About Me text yet — this section will be left out.',
  noSkills: 'No skills selected yet — the resume will not list any.',
  noProjects: 'No portfolio items yet — this section will be left out.',
  noProfile: 'You have not set up your Worker profile yet. Add your About Me and skills on the dashboard first.',
  generate: 'Generate & Share PDF',
  generating: 'Generating…',
  loading: 'Loading your profile…',
  retry: 'Try again',
  loadFailed: 'Your profile could not be loaded. Please try again.',
  generateFailed: 'The PDF could not be generated. Please try again.',
  shareUnavailable: 'Sharing is not available on this device.',
  /* PDF section labels */
  pdfContact: 'Contact',
  pdfSummary: 'Professional Summary',
  pdfSkills: 'Skills',
  pdfProjects: 'Selected Projects',
  pdfProfile: 'SkillMatch Profile',
  pdfVerified: 'Verified SkillMatch Worker',
  pdfUnverified: 'SkillMatch Worker (verification pending)',
  pdfAvailability: 'Availability',
  pdfRating: 'Client rating',
  pdfNoRating: 'New — no ratings yet',
  pdfFooter: 'Generated by SkillMatch from the Worker’s saved profile.',
} as const;

const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

const SCALE_LABEL: Record<ProjectScale, string> = {
  small: 'Small project',
  medium: 'Medium project',
  large: 'Large project',
};

const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available for work',
  busy: 'Currently busy',
  offline: 'Offline',
};

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class ResumeError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'ResumeError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

const PROFICIENCIES: readonly string[] = ['beginner', 'intermediate', 'expert'];
const SCALES: readonly string[] = ['small', 'medium', 'large'];
const AVAILABILITIES: readonly string[] = ['available', 'busy', 'offline'];

function oneOf<T extends string>(v: unknown, allowed: readonly string[]): T | null {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : null;
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/* ------------------------------------------------------------------ *
 * Loader
 * ------------------------------------------------------------------ */

/**
 * Builds the model for the signed-in Worker. `account` is the authenticated
 * user's own `users` row, already resolved by the account provider; it is the
 * only identity input and it is never taken from a parameter a caller could
 * forge. Returns null when the Worker has no `worker_profiles` row yet.
 */
export async function loadResume(account: AccountRecord): Promise<ResumeModel | null> {
  const profileRes = await supabase
    .from('worker_profiles')
    .select('id, bio, is_verified, availability_status, rating_avg')
    .eq('user_id', account.id)
    .maybeSingle();
  if (profileRes.error) throw new ResumeError('profile read failed', profileRes.error.code ?? null);
  if (!profileRes.data) return null;
  const profile = profileRes.data as Record<string, unknown>;
  const workerId = typeof profile.id === 'string' ? profile.id : null;
  if (workerId === null) return null;

  const [skillRowsRes, projectsRes] = await Promise.all([
    supabase.from('worker_skills').select('skill_id, proficiency_level').eq('worker_id', workerId),
    supabase
      .from('portfolio_items')
      .select('title, description, project_scale, created_at')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false }),
  ]);
  if (skillRowsRes.error) throw new ResumeError('skills read failed', skillRowsRes.error.code ?? null);
  if (projectsRes.error) throw new ResumeError('portfolio read failed', projectsRes.error.code ?? null);

  const skillRows = (skillRowsRes.data ?? []) as Record<string, unknown>[];
  const skillIds = skillRows
    .map((r) => r.skill_id)
    .filter((id): id is string => typeof id === 'string');

  let names = new Map<string, string>();
  if (skillIds.length > 0) {
    const namesRes = await supabase.from('skills').select('id, skill_name').in('id', skillIds);
    if (namesRes.error) throw new ResumeError('skill names read failed', namesRes.error.code ?? null);
    names = new Map(
      ((namesRes.data ?? []) as Record<string, unknown>[])
        .map((r) => [r.id, text(r.skill_name)] as const)
        .filter((pair): pair is readonly [string, string] => typeof pair[0] === 'string' && pair[1] !== null)
    );
  }

  const skills: ResumeSkill[] = skillRows
    .map((r) => {
      const name = typeof r.skill_id === 'string' ? names.get(r.skill_id) : undefined;
      return name === undefined
        ? null
        : { name, proficiency: oneOf<Proficiency>(r.proficiency_level, PROFICIENCIES) };
    })
    .filter((s): s is ResumeSkill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const projects: ResumeProject[] = ((projectsRes.data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const title = text(r.title);
      return title === null
        ? null
        : {
            title,
            description: text(r.description),
            scale: oneOf<ProjectScale>(r.project_scale, SCALES),
          };
    })
    .filter((p): p is ResumeProject => p !== null);

  const rating = typeof profile.rating_avg === 'number' ? profile.rating_avg : 0;

  return {
    fullName: account.full_name,
    email: account.email,
    phone: account.phone,
    barangay: account.barangay,
    city: account.city,
    summary: text(profile.bio),
    isVerified: profile.is_verified === true,
    availability: oneOf<Availability>(profile.availability_status, AVAILABILITIES),
    // 0 is the untouched default; the rating routine never writes 0.
    ratingAvg: rating > 0 ? rating : null,
    skills,
    projects,
  };
}

/* ------------------------------------------------------------------ *
 * HTML
 * ------------------------------------------------------------------ */

/** Escapes the five characters that matter in HTML text and attributes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes, then turns newlines into paragraph breaks. */
function paragraphs(s: string): string {
  return s
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

function formatRating(avg: number): string {
  return `${(Math.round(avg * 10) / 10).toFixed(1)} / 5`;
}

/**
 * The fixed template. One column, A4, restrained. Sections render only when
 * the model has data for them; there is no branch that renders a heading
 * over nothing, and no heading exists for any fact the schema cannot hold.
 */
export function buildResumeHtml(m: ResumeModel): string {
  const e = escapeHtml;

  const summary =
    m.summary === null
      ? ''
      : `<section><h2>${RESUME_COPY.pdfSummary}</h2>${paragraphs(m.summary)}</section>`;

  const skills =
    m.skills.length === 0
      ? ''
      : `<section><h2>${RESUME_COPY.pdfSkills}</h2><ul class="skills">${m.skills
          .map(
            (s) =>
              `<li><span class="skill">${e(s.name)}</span>${
                s.proficiency === null ? '' : `<span class="level">${PROFICIENCY_LABEL[s.proficiency]}</span>`
              }</li>`
          )
          .join('')}</ul></section>`;

  const projects =
    m.projects.length === 0
      ? ''
      : `<section><h2>${RESUME_COPY.pdfProjects}</h2>${m.projects
          .map(
            (p) =>
              `<article class="project"><h3>${e(p.title)}</h3>${
                p.scale === null ? '' : `<div class="scale">${SCALE_LABEL[p.scale]}</div>`
              }${p.description === null ? '' : paragraphs(p.description)}</article>`
          )
          .join('')}</section>`;

  const profileLines = [
    `<li>${m.isVerified ? RESUME_COPY.pdfVerified : RESUME_COPY.pdfUnverified}</li>`,
    m.availability === null
      ? ''
      : `<li>${RESUME_COPY.pdfAvailability}: ${AVAILABILITY_LABEL[m.availability]}</li>`,
    `<li>${RESUME_COPY.pdfRating}: ${
      m.ratingAvg === null ? RESUME_COPY.pdfNoRating : formatRating(m.ratingAvg)
    }</li>`,
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(m.fullName)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #1d4ed8; padding-bottom: 8pt; margin-bottom: 14pt; }
  h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: 0.2pt; }
  .contact { font-size: 10pt; color: #333; }
  .contact span + span::before { content: " \\00a0|\\00a0 "; color: #999; }
  h2 { font-size: 12.5pt; text-transform: uppercase; letter-spacing: 0.8pt; color: #1d4ed8; margin: 14pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
  h3 { font-size: 11.5pt; margin: 8pt 0 2pt; }
  p { margin: 0 0 6pt; }
  ul { margin: 0; padding-left: 0; list-style: none; }
  ul.skills li { display: flex; justify-content: space-between; padding: 3pt 0; border-bottom: 1px dotted #e5e5e5; }
  .level { color: #555; font-size: 10pt; }
  .project .scale { font-size: 10pt; color: #555; margin-bottom: 3pt; }
  ul.profile li { padding: 2pt 0; }
  footer { margin-top: 18pt; font-size: 8.5pt; color: #777; border-top: 1px solid #ddd; padding-top: 6pt; }
</style>
</head>
<body>
<header>
  <h1>${e(m.fullName)}</h1>
  <div class="contact"><span>${e(m.email)}</span><span>${e(m.phone)}</span><span>${e(m.barangay)}, ${e(m.city)}</span></div>
</header>
${summary}
${skills}
${projects}
<section><h2>${RESUME_COPY.pdfProfile}</h2><ul class="profile">${profileLines}</ul></section>
<footer>${RESUME_COPY.pdfFooter}</footer>
</body>
</html>`;
}
