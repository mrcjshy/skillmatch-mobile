import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_REQUEST_TIMEOUT_MS, AuthRequestTimeoutError, withAuthRequestTimeout } from './auth-request-timeout';

const URL_BASE = 'https://synthetic.supabase.co';
type Call = { input: RequestInfo | URL; init?: RequestInit };
// A fetch that records what it was given and answers only when told to.
function scripted() {
  const calls: Call[] = []; const answers: ((response: Response) => void)[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Promise<Response>(resolve => answers.push(resolve));
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch, answer: (i: number, r = new Response('{}')) => answers[i](r) };
}
const settled = async (promise: Promise<unknown>) => {
  let done = false; promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
};

afterEach(() => { vi.useRealTimers(); });

describe('Auth-only request deadline', () => {
  it('defaults to 20 seconds', () => { expect(AUTH_REQUEST_TIMEOUT_MS).toBe(20_000); });

  it('settles an Auth request that never answers, as a connection failure, and aborts the underlying request', async () => {
    vi.useFakeTimers();
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher, timeoutMs: 20_000 });
    const pending = timed(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' });
    const outcome = pending.catch(error => error);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(await settled(pending)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(AuthRequestTimeoutError);
    expect(error).toBeInstanceOf(TypeError); // what fetch itself rejects with on a network failure
    expect(s.calls[0].init!.signal!.aborted).toBe(true);
  });

  it('ignores a late answer from a request that already timed out', async () => {
    vi.useFakeTimers();
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher, timeoutMs: 50 });
    const outcome = timed(`${URL_BASE}/auth/v1/token`).then(() => 'answered', () => 'timed out');
    await vi.advanceTimersByTimeAsync(50);
    s.answer(0, new Response(JSON.stringify({ access_token: 'stale' })));
    expect(await outcome).toBe('timed out');
  });

  it('returns a timely Auth answer unchanged and clears its deadline', async () => {
    vi.useFakeTimers();
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher, timeoutMs: 50 });
    const response = new Response('{"ok":true}');
    const outcome = timed(new URL(`${URL_BASE}/auth/v1/user`));
    s.answer(0, response);
    expect(await outcome).toBe(response);
    expect(vi.getTimerCount()).toBe(0);
    expect(s.calls[0].init!.signal!.aborted).toBe(false);
  });

  it('composes with a caller signal: a caller abort cancels the request and settles at once', async () => {
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher, timeoutMs: 60_000 });
    const caller = new AbortController();
    const outcome = timed(`${URL_BASE}/auth/v1/logout`, { method: 'POST', signal: caller.signal }).catch(error => error);
    caller.abort();
    const error = await outcome;
    expect(error).not.toBeInstanceOf(AuthRequestTimeoutError);
    expect((error as Error).name).toBe('AbortError');
    expect(s.calls[0].init!.signal!.aborted).toBe(true);
  });

  it('rejects at once without sending when the caller signal is already aborted', async () => {
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher });
    const caller = new AbortController(); caller.abort();
    await expect(timed(`${URL_BASE}/auth/v1/token`, { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.calls).toHaveLength(0);
  });

  it.each([
    ['database', `${URL_BASE}/rest/v1/bookings?select=id`],
    ['storage', `${URL_BASE}/storage/v1/object/job-photos/a.jpg`],
    ['edge function', `${URL_BASE}/functions/v1/booking-call`],
    ['a look-alike host', 'https://synthetic.supabase.co.evil.test/auth/v1/token'],
    ['a look-alike path', `${URL_BASE}/auth/v10/token`],
  ])('leaves %s requests untouched, with no deadline', async (_label, url) => {
    vi.useFakeTimers();
    const s = scripted(); const timed = withAuthRequestTimeout(URL_BASE, { fetch: s.fetcher, timeoutMs: 50 });
    const init = { method: 'GET', headers: { apikey: 'x' } };
    const pending = timed(url, init);
    expect(s.calls[0]).toEqual({ input: url, init });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled(pending)).toBe(false);
  });

  it('accepts a configured URL with a trailing slash', async () => {
    const s = scripted(); const timed = withAuthRequestTimeout(`${URL_BASE}/`, { fetch: s.fetcher, timeoutMs: 50 });
    void timed(`${URL_BASE}/auth/v1/health`).catch(() => {});
    expect(s.calls[0].init!.signal).toBeDefined();
  });

  it('uses the global fetch at call time when none is given', async () => {
    const original = globalThis.fetch;
    const stub = vi.fn(async () => new Response('{}'));
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
      await withAuthRequestTimeout(URL_BASE)(`${URL_BASE}/auth/v1/health`);
      expect(stub).toHaveBeenCalledOnce();
    } finally { globalThis.fetch = original; }
  });
});
