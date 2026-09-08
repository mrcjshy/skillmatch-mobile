/**
 * AI-03 — deterministic Skill Gap Identification: model, pure computation,
 * copy, and loaders.
 *
 * D-004 (LOCKED): the canonical Skill Gap result is a deterministic set
 * difference --
 *
 *     required Job skills  MINUS  the Worker's saved skills  =  missing skills
 *
 * -- and no model decides, adds, removes, or reorders any of it. A future AI
 * assist may only rephrase an already-computed result into optional guidance;
 * nothing of that kind exists in this module, which has no AI dependency at
 * all.
 *
 * SKILL IDENTITY IS `skill_id`, AND ONLY `skill_id`
 * -------------------------------------------------
 * Two skills are the same skill when their ids are equal. Names are labels
 * resolved from `public.skills` for display; they never decide matching, so
 * two rows that happen to share a name but not an id are two different
 * skills. Proficiency is a Worker-side annotation and is never consulted: a
 * shared id matches at Beginner exactly as it does at Expert. There is no
 * fuzzy matching, no similarity, no category inference, no synonyms.
 *
 * THE JOB UNIVERSE IS THE WORKER'S OWN OPPORTUNITY SURFACE
 * ---------------------------------------------------------
 * The Jobs offered for comparison come from `public.list_my_job_opportunities()`
 * called with ZERO arguments -- the same trusted RPC the Job Opportunities
 * screen (N8-UI) uses. The Worker is `auth.uid()` inside it, the rows are the
 * Jobs this Worker has already been matched into, and the server's ordering is
 * kept as received. This module never enumerates `job_postings` directly and
 * never reads Client identity or contact data. Zero rows is an ordinary empty
 * state with several legitimate causes, not an error.
 *
 * IDENTITY COMES FROM THE SESSION
 * -------------------------------
 * The Worker's own skills are derived from the authenticated account's `users`
 * row through `worker_profiles.user_id = account.id`, exactly as AI-02 does.
 * No Worker id is accepted from a route parameter, an input, or a caller.
 *
 * MALFORMED ROWS (the documented coercion rule)
 * ---------------------------------------------
 * Rows are never trusted for shape. A skill row with a non-string or blank id,
 * or a blank name, is ignored; duplicate ids appear once; and the rendered
 * order is deterministic (name, then id, compared by code unit rather than by
 * `localeCompare`, so device locale cannot change it) -- the same input always
 * produces the same output on every device.
 *
 * The one asymmetry is deliberate. A REQUIRED `skill_id` that cannot be
 * resolved to a valid `skills` row makes the requirements load an ERROR rather
 * than silently dropping the entry: omitting a requirement could turn a real
 * gap into a false "you meet every requirement", and a label must never be
 * invented from an id. A WORKER `skill_id` that cannot be resolved is simply
 * omitted, because it cannot equal any resolved required id (those all exist
 * in `skills`), so dropping it changes nothing about the gap -- only about
 * what is listed under "Your skills".
 *
 * NOT A MATCHING FACTOR
 * ---------------------
 * This is informational. It does not touch `private.compute_job_matches`,
 * the RPCs, the Skill 50 / Location 30 / Rating 20 weights, the verification
 * gate, or acceptance. It performs no writes.
 */

import { supabase } from '@/lib/supabase';
import type { AccountRecord } from '@/providers/account-provider';

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

export type Proficiency = 'beginner' | 'intermediate' | 'expert';

/** One skill as the gap sees it: identity is `id`, `name` is a label. */
export type SkillRef = { id: string; name: string };

/** A Worker's saved skill. Proficiency is display-only and never affects truth. */
export type WorkerSkillRef = SkillRef & { proficiency: Proficiency | null };

export type SkillGapResult = {
  /** Deterministically ordered, de-duplicated required skills. */
  requiredSkills: SkillRef[];
  /** Deterministically ordered, de-duplicated Worker skills. */
  workerSkills: WorkerSkillRef[];
  /** Required skills whose id the Worker has. Same order as `requiredSkills`. */
  matchedSkills: SkillRef[];
  /** Required skills whose id the Worker lacks. Same order as `requiredSkills`. */
  missingSkills: SkillRef[];
};

/** One row of the Worker's opportunity surface, limited to what this screen needs. */
export type GapOpportunity = {
  jobId: string;
  title: string;
  barangay: string | null;
  city: string | null;
  scheduledAt: string | null;
};

/* ------------------------------------------------------------------ *
 * Copy — every visible string, fixed.
 * ------------------------------------------------------------------ */

export const SKILL_GAP_COPY = {
  title: 'Skill Gap',
  compareWith: 'Compare with',
  required: 'REQUIRED JOB SKILLS',
  minus: 'minus',
  yours: 'YOUR SKILLS',
  equals: 'equals',
  missing: 'MISSING SKILLS',
  zeroGap: 'No missing skills. You meet every requirement for this job.',
  noOpportunities: 'No job opportunities are available to compare right now.',
  noWorkerSkills: 'No skills are currently saved on your Worker profile.',
  noProfile: 'You have not set up your Worker profile yet, so there are no saved skills to compare.',
  noRequirements: 'This job does not list any required skills, so there is nothing to compare.',
  loading: 'Loading…',
  loadingRequirements: 'Loading job requirements…',
  retry: 'Try again',
  loadFailed: 'Your skills and job opportunities could not be loaded. Please try again.',
  requirementsFailed: "This job's requirements could not be loaded. Please try again.",
  matchedHint: 'You have this skill.',
  missingHint: 'Not on your profile yet.',
} as const;

export const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class SkillGapError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'SkillGapError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

const PROFICIENCIES: readonly string[] = ['beginner', 'intermediate', 'expert'];

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function proficiencyOf(v: unknown): Proficiency | null {
  return typeof v === 'string' && PROFICIENCIES.includes(v) ? (v as Proficiency) : null;
}

/**
 * Coerces an untrusted value into a `SkillRef`, or null when its id or name
 * is missing, non-string, or blank. Ids are trimmed so that " abc" and "abc"
 * are the same skill, exactly as they would be as uuids.
 */
export function toSkillRef(v: unknown): SkillRef | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const id = text(r.id);
  const name = text(r.name);
  return id === null || name === null ? null : { id, name };
}

/**
 * Code-unit comparison, NOT `localeCompare`: the ordering must be identical on
 * every device regardless of the host locale, so a Worker and a panel member
 * looking at the same data see the same list. No case folding, no accent
 * folding -- those would be locale-flavoured judgements about text, and the
 * order is only a display convention.
 */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic display order: by name, then by id as the tie-break. */
function compareSkills(a: SkillRef, b: SkillRef): number {
  return compareText(a.name, b.name) || compareText(a.id, b.id);
}

/**
 * Applies the documented coercion rule to a list: malformed entries dropped,
 * duplicate ids collapsed to the first valid occurrence, deterministic order.
 * Generic so Worker skills keep their proficiency annotation.
 */
export function normalizeSkills<T extends SkillRef>(input: readonly (T | null | undefined)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const raw of input) {
    if (!raw) continue;
    const ref = toSkillRef(raw);
    if (ref === null) continue;
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push({ ...raw, id: ref.id, name: ref.name });
  }
  return out.sort(compareSkills);
}

/* ------------------------------------------------------------------ *
 * The pure computation
 * ------------------------------------------------------------------ */

/**
 * required − mine = missing, by `skill_id` only.
 *
 *   workerIds = Set(mine.map(id))
 *   matched   = required.filter(s =>  workerIds.has(s.id))
 *   missing   = required.filter(s => !workerIds.has(s.id))
 *
 * Both inputs are normalized first, so the result is independent of input
 * order, duplicates, and malformed entries. Pure: no I/O, no state.
 */
export function computeSkillGap(
  required: readonly (SkillRef | null | undefined)[],
  mine: readonly (WorkerSkillRef | null | undefined)[]
): SkillGapResult {
  const requiredSkills = normalizeSkills(required);
  const workerSkills = normalizeSkills(mine);
  const workerIds = new Set(workerSkills.map((s) => s.id));
  return {
    requiredSkills,
    workerSkills,
    matchedSkills: requiredSkills.filter((s) => workerIds.has(s.id)),
    missingSkills: requiredSkills.filter((s) => !workerIds.has(s.id)),
  };
}

/* ------------------------------------------------------------------ *
 * Loaders — authenticated SELECTs and one zero-argument RPC. No writes.
 * ------------------------------------------------------------------ */

function toOpportunity(row: unknown): GapOpportunity | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const jobId = text(r.job_id);
  const title = text(r.title);
  if (jobId === null || title === null) return null;
  return {
    jobId,
    title,
    barangay: text(r.barangay),
    city: text(r.city),
    scheduledAt: text(r.scheduled_at),
  };
}

/**
 * The Jobs this Worker may compare against: exactly the rows the trusted
 * opportunity RPC returns, in the server's order. Zero arguments -- the Worker
 * is `auth.uid()` server-side. Only the display fields this screen needs are
 * kept; scores, description and budget are not carried here.
 */
export async function loadMyOpportunities(): Promise<GapOpportunity[]> {
  const res = await supabase.rpc('list_my_job_opportunities');
  if (res.error) throw new SkillGapError('opportunities read failed', res.error.code ?? null);
  const rows = Array.isArray(res.data) ? (res.data as unknown[]) : [];
  const out: GapOpportunity[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const o = toOpportunity(row);
    if (o === null || seen.has(o.jobId)) continue;
    seen.add(o.jobId);
    out.push(o); // server order preserved; no client-side ranking
  }
  return out;
}

/** Resolves ids to master names through `public.skills`. Blank names are dropped. */
async function loadSkillNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const res = await supabase.from('skills').select('id, skill_name').in('id', [...ids]);
  if (res.error) throw new SkillGapError('skill names read failed', res.error.code ?? null);
  const names = new Map<string, string>();
  for (const row of (res.data ?? []) as Record<string, unknown>[]) {
    const id = text(row.id);
    const name = text(row.skill_name);
    if (id !== null && name !== null && !names.has(id)) names.set(id, name);
  }
  return names;
}

/**
 * The signed-in Worker's saved skills. `account` is the authenticated user's
 * own `users` row from the account provider -- the only identity input.
 * Returns null when the Worker has no `worker_profiles` row yet. A saved
 * skill whose id no longer resolves in `skills` is omitted (see the module
 * note on why that is truth-preserving).
 */
export async function loadMyWorkerSkills(account: AccountRecord): Promise<WorkerSkillRef[] | null> {
  const profileRes = await supabase
    .from('worker_profiles')
    .select('id')
    .eq('user_id', account.id)
    .maybeSingle();
  if (profileRes.error) throw new SkillGapError('profile read failed', profileRes.error.code ?? null);
  if (!profileRes.data) return null;
  const workerId = text((profileRes.data as Record<string, unknown>).id);
  if (workerId === null) return null;

  const rowsRes = await supabase
    .from('worker_skills')
    .select('skill_id, proficiency_level')
    .eq('worker_id', workerId);
  if (rowsRes.error) throw new SkillGapError('skills read failed', rowsRes.error.code ?? null);

  const rows = (rowsRes.data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => text(r.skill_id)).filter((id): id is string => id !== null);
  const names = await loadSkillNames(ids);

  return normalizeSkills(
    rows.map((r): WorkerSkillRef | null => {
      const id = text(r.skill_id);
      const name = id === null ? undefined : names.get(id);
      return id === null || name === undefined
        ? null
        : { id, name, proficiency: proficiencyOf(r.proficiency_level) };
    })
  );
}

/**
 * The required skills of one Job that is already in this Worker's opportunity
 * set. Reads `job_skills` for that id, resolves names through `skills`, and
 * FAILS (rather than omits) if any required id cannot be resolved to a valid
 * name, so a gap is never understated and no label is invented. An empty
 * list is a legitimate shape: the Job lists no requirements.
 */
export async function loadJobRequiredSkills(jobId: string): Promise<SkillRef[]> {
  const res = await supabase.from('job_skills').select('skill_id').eq('job_id', jobId);
  if (res.error) throw new SkillGapError('requirements read failed', res.error.code ?? null);

  const ids = ((res.data ?? []) as Record<string, unknown>[])
    .map((r) => text(r.skill_id))
    .filter((id): id is string => id !== null);
  const unique = [...new Set(ids)];
  const names = await loadSkillNames(unique);

  const refs: SkillRef[] = [];
  for (const id of unique) {
    const name = names.get(id);
    if (name === undefined) throw new SkillGapError('required skill unresolved', null);
    refs.push({ id, name });
  }
  return normalizeSkills(refs);
}
