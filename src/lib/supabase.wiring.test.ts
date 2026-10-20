import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real client module, offline: only its React Native dependencies and the network are stubbed.
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return { default: { getItem: async (k: string) => memory.get(k) ?? null, setItem: async (k: string, v: string) => { memory.set(k, v); }, removeItem: async (k: string) => { memory.delete(k); } } };
});

const BASE = 'https://synthetic.supabase.co';
type Seen = { url: string; signal: AbortSignal | null | undefined };
let seen: Seen[];

beforeEach(() => {
  seen = [];
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', BASE);
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    seen.push({ url, signal: init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined) });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('app Supabase client: the request deadline applies to Auth only', () => {
  it('gives Auth requests a deadline signal and leaves database, Storage and function requests as they were', async () => {
    const { supabase } = await import('./supabase');
    await supabase.from('skills').select('id');
    await supabase.storage.from('job-photos').list();
    await supabase.functions.invoke('booking-call', { body: {} });
    await supabase.auth.getUser('e30.e30.c2ln');
    const byPath = (part: string) => seen.find(entry => new URL(entry.url).pathname.startsWith(part));
    expect(byPath('/auth/v1/')?.signal).toBeInstanceOf(AbortSignal);
    for (const part of ['/rest/v1/', '/storage/v1/', '/functions/v1/']) {
      expect(byPath(part), part).toBeDefined();
      expect(byPath(part)!.signal ?? null, part).toBeNull();
    }
  });
});
