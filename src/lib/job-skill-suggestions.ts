import type { CatalogSkill } from './skill-catalog';
import { validateAiImageInput, type AiImageInput } from './ai-image-input';

export type JobSkillSuggestion = { skill_id: string; explanation: string; confidence?: number };
export type JobSkillSuggestionsResponse = {
  mode: 'job_skill_suggestions'; suggestions: JobSkillSuggestion[]; source: 'gemini';
};
export type JobSkillSuggestionsRequest = {
  mode: 'job_skill_suggestions';
  description: string;
  image?: AiImageInput;
};

export type SuggestionOwnerToken = {
  ownerIdentity: object;
  ownerId: string;
  draftEpoch: number;
  sessionLifetime: object;
  sessionRevision: number;
  inputRevision: number;
  manualRevision: number;
  catalogRevision: number;
};
export type JobSkillSuggestionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: JobSkillSuggestionsResponse }
  | { status: 'empty' }
  | { status: 'error'; kind: JobSkillSuggestionsErrorKind };
export type JobSkillSuggestionsRequestOutcome = 'completed' | 'ignored' | 'invalidated' | 'invalid_input';
export type JobSkillSuggestionsRunner = {
  request(token: SuggestionOwnerToken, description: unknown, image?: unknown): Promise<JobSkillSuggestionsRequestOutcome>;
  reset(): void;
  dispose(): void;
  snapshot(): JobSkillSuggestionsState;
  apply(token: SuggestionOwnerToken, orderedIds?: readonly string[]): string[] | null;
};
export function createJobSkillSuggestionsRunner(config: {
  invoke: JobSkillSuggestionsInvoke;
  isCurrent(token: SuggestionOwnerToken): boolean;
  getCatalog(): readonly CatalogSkill[];
  publish?(state: JobSkillSuggestionsState): void;
}): JobSkillSuggestionsRunner {
  let state: JobSkillSuggestionsState = { status: 'idle' };
  let busy = false;
  let disposed = false;
  let generation = 0;
  let owner: SuggestionOwnerToken | null = null;
  function isCurrent(token: SuggestionOwnerToken): boolean {
    try { return config.isCurrent(token); } catch { return false; }
  }
  function currentCatalog(): readonly CatalogSkill[] | null {
    try { return config.getCatalog(); } catch { return null; }
  }
  function discard() {
    generation += 1; busy = false; owner = null; state = { status: 'idle' };
  }
  function owns(startedAt: number, token: SuggestionOwnerToken) {
    return !disposed && generation === startedAt && isCurrent(token);
  }
  function publish(next: JobSkillSuggestionsState): boolean {
    state = next;
    try { config.publish?.(copyState(next)); return true; }
    catch { discard(); return false; }
  }
  return {
    async request(token, description, image) {
      if (disposed || !isCurrent(token)) return 'invalidated';
      if (busy) return 'ignored';
      const request = buildJobSkillSuggestionsRequest(description, image);
      if (request === null) return 'invalid_input';
      const captured = { ...token };
      owner = captured;
      generation += 1;
      const startedAt = generation;
      busy = true;
      if (!publish({ status: 'loading' })) return 'invalidated';
      try {
        if (!owns(startedAt, captured)) return 'invalidated';
        const result = await config.invoke(request);
        if (!owns(startedAt, captured)) return 'invalidated';
        const catalog = currentCatalog();
        if (catalog === null) { discard(); return 'invalidated'; }
        const response = parseJobSkillSuggestionsResponse(result, catalog);
        if (response === null) throw new JobSkillSuggestionsError('service_error');
        if (!owns(startedAt, captured)) return 'invalidated';
        if (!publish(response.suggestions.length === 0 ? { status: 'empty' } : { status: 'ready', response })) {
          return 'invalidated';
        }
      } catch (error) {
        if (!owns(startedAt, captured)) return 'invalidated';
        if (!publish({ status: 'error', kind: error instanceof JobSkillSuggestionsError ? error.kind : 'service_error' })) {
          return 'invalidated';
        }
      } finally {
        // A discarded request cannot unlock a later request from reset().
        if (generation === startedAt) {
          busy = false;
          if (!owns(startedAt, captured)) { owner = null; state = { status: 'idle' }; }
        }
      }
      return 'completed';
    },
    reset() {
      if (disposed) return;
      generation += 1; busy = false; owner = null; publish({ status: 'idle' });
    },
    dispose() { disposed = true; generation += 1; busy = false; owner = null; state = { status: 'idle' }; },
    snapshot() { return owner !== null && owns(generation, owner) ? copyState(state) : { status: 'idle' }; },
    apply(token, orderedIds) {
      if (owner === null || state.status !== 'ready' || !owns(generation, owner) ||
          !isCurrent(token) || !sameOwner(owner, token)) return null;
      const catalog = currentCatalog();
      if (catalog === null) { discard(); return null; }
      const parsed = parseJobSkillSuggestionsResponse(state.response, catalog);
      if (parsed === null) return null;
      const suggestedIds = parsed.suggestions.map((item) => item.skill_id);
      const ids = orderedIds === undefined ? suggestedIds : [...orderedIds];
      if (ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length ||
          ids.some((id) => !suggestedIds.includes(id)) || !owns(generation, owner)) return null;
      // Return IDs synchronously; only the existing draft owner may write them.
      generation += 1; owner = null; busy = false;
      return publish({ status: 'idle' }) && isCurrent(token) ? ids : null;
    },
  };
}

function sameOwner(a: SuggestionOwnerToken, b: SuggestionOwnerToken): boolean {
  return a.ownerIdentity === b.ownerIdentity && a.ownerId === b.ownerId &&
    a.draftEpoch === b.draftEpoch && a.sessionLifetime === b.sessionLifetime &&
    a.sessionRevision === b.sessionRevision && a.inputRevision === b.inputRevision &&
    a.manualRevision === b.manualRevision && a.catalogRevision === b.catalogRevision;
}

function copyState(state: JobSkillSuggestionsState): JobSkillSuggestionsState {
  if (state.status !== 'ready') return { ...state };
  return { status: 'ready', response: {
    ...state.response, suggestions: state.response.suggestions.map((item) => ({ ...item })),
  } };
}

export type JobSkillSuggestionsErrorKind = 'rate_limited' | 'authorization' | 'service_error';
export class JobSkillSuggestionsError extends Error {
  constructor(public readonly kind: JobSkillSuggestionsErrorKind) {
    super('Skill suggestions are unavailable.');
    this.name = 'JobSkillSuggestionsError';
  }
}

export type JobSkillSuggestionsInvoke = (request: JobSkillSuggestionsRequest) => Promise<unknown>;
export type JobSkillSuggestionsFunctions = {
  invoke(name: string, options: { body: JobSkillSuggestionsRequest }): Promise<{ data: unknown; error: unknown }>;
};
export function createJobSkillSuggestionsInvoker(functions: JobSkillSuggestionsFunctions): JobSkillSuggestionsInvoke {
  return async (request) => {
    try {
      if (!isRecord(request) || !exactKeys(request, ['mode', 'description'], ['image']) ||
          request.mode !== 'job_skill_suggestions') throw new JobSkillSuggestionsError('service_error');
      const body = buildJobSkillSuggestionsRequest(request.description, request.image);
      if (body === null) throw new JobSkillSuggestionsError('service_error');
      const result = await functions.invoke('skillmatch-ai', { body });
      if (result.error) throw new JobSkillSuggestionsError(await classifyInvokeError(result.error));
      if (isRecord(result.data) && result.data.error === 'ai_limit_reached') {
        throw new JobSkillSuggestionsError('rate_limited');
      }
      return result.data;
    } catch (error) {
      if (error instanceof JobSkillSuggestionsError) throw error;
      throw new JobSkillSuggestionsError('service_error');
    }
  };
}

async function classifyInvokeError(error: unknown): Promise<JobSkillSuggestionsErrorKind> {
  const context = isRecord(error) ? error.context : null;
  const status = isRecord(context) ? context.status : null;
  if (status === 401 || status === 403) return 'authorization';
  if (status === 429) return 'rate_limited';
  if (await boundedLimitError(context)) return 'rate_limited';
  return 'service_error';
}

/** Read only the known error code, capped at 1024 bytes and 1.5 seconds.
 * Native responses without a readable stream use HTTP status only. */
async function boundedLimitError(context: unknown): Promise<boolean> {
  if (!isRecord(context) || !isRecord(context.body) || typeof context.body.getReader !== 'function') return false;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = (context.body as unknown as ReadableStream<Uint8Array>).getReader(); }
  catch { return false; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reading = async () => {
      let text = '';
      let total = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 1024) return false;
        // Error codes are ASCII. Never return or retain arbitrary server prose.
        for (const byte of part.value) text += String.fromCharCode(byte);
      }
      const value: unknown = JSON.parse(text);
      return isRecord(value) && value.error === 'ai_limit_reached';
    };
    return await Promise.race([
      reading(),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 1500); }),
    ]);
  } catch { return false; }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    // Cancellation is best effort and must not prevent the sanitized error.
    void reader.cancel().catch(() => undefined);
  }
}

export function parseJobSkillSuggestionsResponse(
  value: unknown, skills: readonly CatalogSkill[]
): JobSkillSuggestionsResponse | null {
  if (!isRecord(value) || !exactKeys(value, ['mode', 'suggestions', 'source']) ||
      value.mode !== 'job_skill_suggestions' || value.source !== 'gemini' ||
      !Array.isArray(value.suggestions) || value.suggestions.length > 2) return null;
  const ids = new Set(skills.map((skill) => skill.id));
  const seen = new Set<string>();
  const suggestions: JobSkillSuggestion[] = [];
  for (const item of value.suggestions) {
    if (!isRecord(item) || !exactKeys(item, ['skill_id', 'explanation'], ['confidence']) ||
        typeof item.skill_id !== 'string' || !UUID.test(item.skill_id) ||
        !ids.has(item.skill_id) || seen.has(item.skill_id) ||
        typeof item.explanation !== 'string' || item.explanation.trim() === '' ||
        Array.from(item.explanation).length > 160) return null;
    const suggestion: JobSkillSuggestion = { skill_id: item.skill_id, explanation: item.explanation };
    if (Object.prototype.hasOwnProperty.call(item, 'confidence')) {
      if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) ||
          item.confidence < 0 || item.confidence > 1) return null;
      suggestion.confidence = item.confidence;
    }
    seen.add(item.skill_id);
    suggestions.push(suggestion);
  }
  return { mode: 'job_skill_suggestions', suggestions, source: 'gemini' };
}

export function jobSkillSuggestionLabels(
  value: JobSkillSuggestionsResponse, skills: readonly CatalogSkill[]
): (JobSkillSuggestion & { skill_name: string })[] | null {
  const parsed = parseJobSkillSuggestionsResponse(value, skills);
  return parsed?.suggestions.map((item) => ({
    ...item, skill_name: skills.find((skill) => skill.id === item.skill_id)!.skill_name,
  })) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

export function buildJobSkillSuggestionsRequest(
  description: unknown,
  image?: unknown
): JobSkillSuggestionsRequest | null {
  if (typeof description !== 'string' || description.trim() === '') return null;
  let codepoints = 0;
  let bytes = 0;
  for (const char of description) {
    const point = char.codePointAt(0)!;
    codepoints += 1;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (codepoints > 2000 || bytes > 8000) return null;
  }
  if (image === undefined) return { mode: 'job_skill_suggestions', description };
  const normalized = validateAiImageInput(image);
  if (normalized === null) return null;
  return { mode: 'job_skill_suggestions', description, image: normalized };
}
