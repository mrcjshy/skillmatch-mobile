import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { withAuthRequestTimeout } from './auth-request-timeout';
import {
  createJobSkillSuggestionsInvoker, createJobSkillSuggestionsRunner,
  type SuggestionOwnerToken,
} from './job-skill-suggestions';

const BASE = 'http://127.0.0.1:54321';
const description = 'There is a dripping bathroom faucet and a flickering ceiling light. Need plumbing and electrical repairs.';
const catalog = [
  { id: 'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e', skill_name: 'Plumbing' },
  { id: '42300aaf-611f-434b-b504-f6f47bafa14d', skill_name: 'Electrical Work' },
];
const response = {
  mode: 'job_skill_suggestions', source: 'gemini',
  suggestions: [{ skill_id: catalog[0].id, explanation: 'The faucet needs plumbing repair.' }],
};

function client(send: typeof fetch) {
  return createClient(BASE, 'synthetic-public-key', {
    accessToken: async () => 'synthetic-user-token',
    global: { fetch: withAuthRequestTimeout(BASE, { fetch: send }) },
  });
}

describe('real installed Supabase SDK suggestion transport, mocked HTTP only', () => {
  it('sends the approved text-only body to the local function with caller auth and parses its real response', async () => {
    const send = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    }));
    const invoke = createJobSkillSuggestionsInvoker(client(send).functions);
    await expect(invoke({ mode: 'job_skill_suggestions', description })).resolves.toEqual(response);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe(BASE + '/functions/v1/skillmatch-ai');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ mode: 'job_skill_suggestions', description });
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer synthetic-user-token');
    expect(headers.get('apikey')).toBe('synthetic-public-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.signal).toBeUndefined();
  });

  it('reproduces G1-compatible transport failure without selection, automatic Apply or a second HTTP attempt', async () => {
    const send = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => { throw new TypeError('Network request failed'); });
    const owner: SuggestionOwnerToken = {
      ownerIdentity: {}, ownerId: 'synthetic-client', draftEpoch: 1, sessionLifetime: {},
      sessionRevision: 1, inputRevision: 1, manualRevision: 1, catalogRevision: 1,
    };
    const runner = createJobSkillSuggestionsRunner({
      invoke: createJobSkillSuggestionsInvoker(client(send).functions),
      isCurrent: () => true, getCatalog: () => catalog,
    });
    await runner.request(owner, description);
    expect(runner.snapshot()).toEqual({ status: 'error', kind: 'service_error' });
    expect(runner.apply(owner)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
