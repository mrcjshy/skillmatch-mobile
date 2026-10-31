import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAuthRequestTimeout } from './auth-request-timeout';
import {
  createJobSkillSuggestionsInvoker, createJobSkillSuggestionsRunner,
  type JobSkillSuggestionsState, type SuggestionOwnerToken,
} from './job-skill-suggestions';

const base = 'http://127.0.0.1:54321';
const id = '11111111-1111-4111-8111-111111111111';
const description = 'Synthetic leaking pipe repair';
const catalog = [{ id, skill_name: 'Plumbing' }];
const response = {
  mode: 'job_skill_suggestions', source: 'gemini',
  suggestions: [{ skill_id: id, explanation: 'Repairs the pipe.' }],
};
const token: SuggestionOwnerToken = {
  ownerIdentity: {}, ownerId: 'synthetic-client', draftEpoch: 1, sessionLifetime: {},
  sessionRevision: 1, inputRevision: 1, manualRevision: 1, catalogRevision: 1,
};

type FetchBoundary = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function harness(send: FetchBoundary) {
  // No saved/device session, Auth initialization, real fetch, or refresh timer.
  const client = createClient(base, 'synthetic-public-key', {
    accessToken: async () => 'synthetic-user-token',
    global: { fetch: withAuthRequestTimeout(base, { fetch: send }) },
  });
  let current = true;
  const states: JobSkillSuggestionsState[] = [];
  const runner = createJobSkillSuggestionsRunner({
    invoke: createJobSkillSuggestionsInvoker(client.functions),
    isCurrent: () => current, getCatalog: () => catalog,
    publish: state => states.push(state),
  });
  return { runner, states, invalidate: () => { current = false; } };
}

function sendResponse(make: () => Response) {
  return vi.fn<FetchBoundary>(async (input, init) => {
    // Every permitted fake request is checked; every other request fails closed.
    if (input !== base + '/functions/v1/skillmatch-ai' || init?.method !== 'POST' ||
      init.body !== JSON.stringify({ mode: 'job_skill_suggestions', description })) {
      throw new Error('Unstubbed request is forbidden');
    }
    return make();
  });
}

afterEach(() => vi.useRealTimers());

describe('actual SDK error/response boundary with synthetic HTTP only', () => {
  // These are possible causes of the same sanitized UI branch, not a diagnosis
  // of the historical physical G1 request or real provider/gateway evidence.
  it.each([
    { label: 'HTTP 401', status: 401, body: '{"error":"private"}', kind: 'authorization' },
    { label: 'HTTP 403', status: 403, body: '{"error":"private"}', kind: 'authorization' },
    { label: 'HTTP 429', status: 429, body: '{"error":"private"}', kind: 'rate_limited' },
    { label: 'HTTP 503 quota code', status: 503, body: '{"error":"ai_limit_reached"}', kind: 'rate_limited' },
    { label: 'HTTP 503 unavailable', status: 503, body: '{"error":"ai_unavailable"}', kind: 'service_error' },
    { label: 'relay error', status: 502, body: 'PRIVATE_GATEWAY_TEXT', kind: 'service_error', relay: true },
    { label: 'HTTP 200 malformed JSON', status: 200, body: 'PRIVATE_INVALID_JSON', kind: 'service_error' },
    { label: 'HTTP 200 unknown catalog ID', status: 200, body: JSON.stringify({
      ...response, suggestions: [{ skill_id: '22222222-2222-4222-8222-222222222222', explanation: 'Unknown' }],
    }), kind: 'service_error' },
    { label: 'HTTP 200 text instead of JSON', status: 200, body: JSON.stringify(response), kind: 'service_error', text: true },
  ])('handles $label without retry or Apply authority', async fixture => {
    const send = sendResponse(() => new Response(fixture.body, {
      status: fixture.status,
      headers: {
        'Content-Type': fixture.text ? 'text/plain' : 'application/json',
        ...(fixture.relay ? { 'x-relay-error': 'true' } : {}),
      },
    }));
    const h = harness(send);
    expect(await h.runner.request(token, description)).toBe('completed');
    expect(h.runner.snapshot()).toEqual({ status: 'error', kind: fixture.kind });
    expect(h.runner.apply(token, [id])).toBeNull();
    expect(h.states).toEqual([{ status: 'loading' }, { status: 'error', kind: fixture.kind }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.states)).not.toContain('PRIVATE');
  });

  it('settles a stalled SDK HTTP error body at the bounded deadline without a silent retry', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const send = sendResponse(() => new Response(body, { status: 503 }));
    const h = harness(send);
    const task = h.runner.request(token, description);
    await vi.advanceTimersByTimeAsync(1499);
    expect(h.runner.snapshot()).toEqual({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(1);
    expect(await task).toBe('completed');
    expect(h.runner.snapshot()).toEqual({ status: 'error', kind: 'service_error' });
    expect(h.runner.apply(token, [id])).toBeNull();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not publish a late quota error after the owning session becomes obsolete', async () => {
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        finish = () => {
          controller.enqueue(new TextEncoder().encode('{"error":"ai_limit_reached"}'));
          controller.close();
        };
      },
    });
    const send = sendResponse(() => new Response(body, { status: 503 }));
    const h = harness(send);
    const task = h.runner.request(token, description);
    for (let i = 0; i < 25; i++) await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(h.runner.snapshot()).toEqual({ status: 'loading' });
    h.invalidate();
    finish();
    expect(await task).toBe('invalidated');
    expect(h.runner.snapshot()).toEqual({ status: 'idle' });
    expect(h.runner.apply(token, [id])).toBeNull();
    expect(h.states).toEqual([{ status: 'loading' }]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
