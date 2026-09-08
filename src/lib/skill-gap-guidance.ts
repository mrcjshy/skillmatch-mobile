import { supabase } from '@/lib/supabase';

const MAX_GUIDANCE_CHARS = 1_200;

export const SKILL_GAP_GUIDANCE_COPY = {
  title: 'AI Guidance',
  get: 'Get AI Guidance',
  loading: 'Getting AI guidance…',
  unavailable: 'AI guidance is unavailable right now.',
  retry: 'Try again',
  deterministicSource: 'Based on the deterministic result above.',
  geminiSource: 'Optional guidance for the missing skills above.',
} as const;

export type SkillGapGuidanceSource = 'deterministic' | 'gemini';

export type SkillGapGuidance = {
  guidance: string;
  source: SkillGapGuidanceSource;
};

export type GuidanceOwner = {
  accountId: string;
  jobId: string;
  baseRetry: number;
  requirementsRetry: number;
};

export class SkillGapGuidanceError extends Error {
  constructor() {
    super(SKILL_GAP_GUIDANCE_COPY.unavailable);
    this.name = 'SkillGapGuidanceError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonBlankText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function exactStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings: string[] = [];
  for (const item of value) {
    const text = nonBlankText(item);
    if (text === null) return null;
    strings.push(text);
  }
  return strings;
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

/**
 * The only network body this feature may create. Expected missing names are
 * deliberately absent: they are local response-validation context, never
 * client authority sent to the server.
 */
export function buildSkillGapGuidanceRequest(jobId: string) {
  return {
    mode: 'skill_gap_guidance' as const,
    job_id: jobId,
  };
}

/** Stable React ownership key; changing any lifecycle dimension resets AI state. */
export function guidanceOwnerKey(owner: GuidanceOwner): string {
  return JSON.stringify([
    owner.accountId,
    owner.jobId,
    owner.baseRetry,
    owner.requirementsRetry,
  ]);
}

/**
 * Validate the deployed Edge Function's actual success shape. The returned
 * missing names are only a consistency assertion against the current local
 * ID-derived equation. They never become Skill Gap truth or UI input.
 */
export function parseSkillGapGuidanceResponse(
  value: unknown,
  expectedMissingNames: readonly string[]
): SkillGapGuidance | null {
  if (!isObject(value) || value.mode !== 'skill_gap_guidance') return null;

  const missingSkills = exactStrings(value.missing_skills);
  if (missingSkills === null || !sameStrings(missingSkills, expectedMissingNames)) return null;

  const guidance = nonBlankText(value.guidance);
  if (guidance === null || guidance.length > MAX_GUIDANCE_CHARS) return null;

  const expectedSource: SkillGapGuidanceSource =
    expectedMissingNames.length === 0 ? 'deterministic' : 'gemini';
  if (value.source !== expectedSource) return null;

  return { guidance, source: expectedSource };
}

type InvokeGuidance = (jobId: string) => Promise<unknown>;

async function invokeHostedGuidance(jobId: string): Promise<unknown> {
  const response = await supabase.functions.invoke('skillmatch-ai', {
    body: buildSkillGapGuidanceRequest(jobId),
  });
  if (response.error) throw new SkillGapGuidanceError();
  return response.data;
}

/**
 * Resolve optional guidance without changing deterministic truth. A zero gap
 * returns existing AI-03 copy before the invocation function is reached.
 */
export async function loadSkillGapGuidance(
  jobId: string,
  expectedMissingNames: readonly string[],
  zeroGapCopy: string,
  invoke: InvokeGuidance = invokeHostedGuidance
): Promise<SkillGapGuidance> {
  if (expectedMissingNames.length === 0) {
    const guidance = nonBlankText(zeroGapCopy);
    if (guidance === null) throw new SkillGapGuidanceError();
    return { guidance, source: 'deterministic' };
  }

  try {
    const value = await invoke(jobId);
    const parsed = parseSkillGapGuidanceResponse(value, expectedMissingNames);
    if (parsed === null) throw new SkillGapGuidanceError();
    return parsed;
  } catch {
    throw new SkillGapGuidanceError();
  }
}

/* ------------------------------------------------------------------ *
 * Lifecycle-owned runner
 * ------------------------------------------------------------------ */

export type GuidanceState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; guidance: string; source: SkillGapGuidanceSource }
  | { kind: 'error' };

export type GuidanceEmit = (state: GuidanceState) => void;

type GuidanceLoad = (
  jobId: string,
  expectedMissingNames: readonly string[],
  zeroGapCopy: string
) => Promise<SkillGapGuidance>;

export type SkillGapGuidanceRunner = {
  /** Starts one request for this owner. A press while busy is ignored. */
  request(emit: GuidanceEmit): void;
  /** Ends the owner. Every in-flight and later result becomes unrenderable. */
  dispose(): void;
};

/**
 * One runner belongs to exactly one deterministic owner: account + Job + both
 * AI-03 Retry generations. The screen holds it for that owner's whole life and
 * disposes it when the owner ends, so a result for Worker A + Job A can never
 * be emitted into Worker B, Job B, a later Retry generation, or an unmounted
 * screen. The missing names are copied once: they are validation context for
 * the response and are never sent to the server.
 */
export function createGuidanceRunner(config: {
  jobId: string;
  missingSkillNames: readonly string[];
  zeroGapCopy: string;
  load?: GuidanceLoad;
}): SkillGapGuidanceRunner {
  const load = config.load ?? loadSkillGapGuidance;
  const missingSkillNames = [...config.missingSkillNames];
  let generation = 0;
  let disposed = false;
  let busy = false;

  /** True only while the settling request is still this owner's current one. */
  function owns(startedAt: number): boolean {
    return !disposed && generation === startedAt;
  }

  return {
    request(emit) {
      if (disposed || busy) return;
      busy = true;
      generation += 1;
      const startedAt = generation;
      emit({ kind: 'loading' });
      void load(config.jobId, missingSkillNames, config.zeroGapCopy).then(
        (result) => {
          if (!owns(startedAt)) return;
          busy = false;
          emit({ kind: 'success', guidance: result.guidance, source: result.source });
        },
        () => {
          if (!owns(startedAt)) return;
          busy = false;
          emit({ kind: 'error' });
        }
      );
    },
    dispose() {
      disposed = true;
      generation += 1;
      busy = false;
    },
  };
}
