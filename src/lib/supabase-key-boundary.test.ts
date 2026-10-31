import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fromByteArray } from 'base64-js';

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_secret_synthetic-do-not-ship');
});
afterEach(() => { vi.unstubAllEnvs(); });

function legacyKey(claims: unknown) {
  const encode = (value: unknown) => fromByteArray(new TextEncoder().encode(JSON.stringify(value)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.c3ludGhldGlj`;
}

it('refuses a server secret key in the public mobile client configuration', async () => {
  await expect(import('./supabase')).rejects.toThrow('public Supabase client');
});

it('refuses a legacy service-role JWT before constructing the public client', async () => {
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', legacyKey({ role: 'service_role' }));
  await expect(import('./supabase')).rejects.toThrow('public Supabase client');
});

it.each(['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const)(
  'accepts only a public-format key through %s', async field => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv(field, field === 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
      ? legacyKey({ role: 'anon', note: 'synthetic' }) : 'sb_publishable_synthetic');
    const { supabase } = await import('./supabase');
    expect(supabase.functions).toBeDefined();
  }
);

it.each([
  'sb_secret_synthetic', 'sb_publishable_', 'not-a-key', 'a.b.c',
  legacyKey(null), legacyKey([]), legacyKey({}), legacyKey({ role: 'authenticated' }),
  legacyKey({ role: 'postgres' }), legacyKey({ role: 'anon' }) + '\n',
])('rejects malformed or non-public configuration case %# without leaking it', async key => {
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', key);
  let failure: unknown;
  try { await import('./supabase'); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain('public Supabase client');
  expect((failure as Error).message).not.toContain(key);
});

it('preserves ambiguous-key rejection', async () => {
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic');
  await expect(import('./supabase')).rejects.toThrow('Ambiguous');
});

it('preserves missing-key rejection', async () => {
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
  await expect(import('./supabase')).rejects.toThrow('Missing Supabase client key');
});
