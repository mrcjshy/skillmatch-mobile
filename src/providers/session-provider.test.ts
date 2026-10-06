import type { Session } from '@supabase/supabase-js';
import { fromByteArray } from 'base64-js';
import { describe, expect, it, vi } from 'vitest';
import { createSessionLifecycle, extractSessionMarker } from './session-provider';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('expo-linking', () => ({}));
vi.mock('react-native', () => ({}));
const URL = 'https://synthetic.supabase.co';
const USER = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const claims = { iss: URL + '/auth/v1', sub: USER, session_id: ID };
function session(payload: unknown = claims, userId = USER): Session {
  const json = JSON.stringify(payload);
  const encoded = fromByteArray(new Uint8Array(Array.from(json, char => char.charCodeAt(0)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { access_token: 'e30.' + encoded + '.c2ln', user: { id: userId } } as Session;
}
describe('synchronous local session lifetime (offline, not authorization)', () => {
  it('correlates changed token bytes only with matching valid marker and identity', () => {
    const lifecycle = createSessionLifecycle(); lifecycle.replace(session(), URL);
    const lifetime = lifecycle.lifetime!, revision = lifecycle.revision;
    lifecycle.replace(session({ ...claims, exp: 999999, iat: 7 }), URL);
    expect(lifecycle.lifetime).toBe(lifetime); expect(lifetime.isCurrent()).toBe(true);
    expect(lifecycle.isRevisionCurrent(revision)).toBe(false);
  });
  it.each([
    { ...claims, session_id: undefined }, { ...claims, session_id: '' }, { ...claims, session_id: 1 },
    { ...claims, session_id: 'x'.repeat(10000) }, { ...claims, session_id: 'not-uuid' },
    { ...claims, sub: ID }, { ...claims, iss: 'https://other.supabase.co/auth/v1' }, null,
  ])('fails closed for ambiguous claims %# without throwing', payload => {
    expect(extractSessionMarker(session(payload), URL)).toBeNull();
    const lifecycle = createSessionLifecycle(); lifecycle.replace(session(), URL); const previous = lifecycle.lifetime!;
    lifecycle.replace(session(payload), URL); expect(previous.isCurrent()).toBe(false);
    expect(lifecycle.lifetime).not.toBe(previous);
  });
  it.each(['', 'not-jwt', 'e30.a.c2ln', 'e30.____.c2ln', 'e30.e30=.c2ln', 'x'.repeat(32769)])('rejects malformed token %#', access_token => {
    expect(extractSessionMarker({ ...session(), access_token }, URL)).toBeNull();
  });
  it('clears the old handle for a changed marker even when the user matches', () => {
    const lifecycle = createSessionLifecycle(); lifecycle.replace(session(), URL); const old = lifecycle.lifetime!;
    lifecycle.replace(session({ ...claims, session_id: '33333333-3333-4333-8333-333333333333' }), URL);
    expect(old.isCurrent()).toBe(false); expect(lifecycle.lifetime).not.toBe(old);
  });
  it.each(['null', 'signed-out', 'recovery'] as const)('cannot inherit through synchronous %s termination and batched same-account entry', cause => {
    const lifecycle = createSessionLifecycle(); lifecycle.replace(session(), URL); const old = lifecycle.lifetime!;
    if (cause === 'null') lifecycle.replace(null, URL);
    else if (cause === 'signed-out') lifecycle.replace(session(), URL, true);
    else lifecycle.terminate();
    lifecycle.replace(session(), URL); expect(old.isCurrent()).toBe(false); expect(lifecycle.lifetime).not.toBe(old);
  });
  it('missing configured issuer permits only a fresh lifetime, never correlation', () => {
    expect(extractSessionMarker(session(), undefined)).toBeNull();
    const lifecycle = createSessionLifecycle(); lifecycle.replace(session(), undefined); const old = lifecycle.lifetime!;
    lifecycle.replace(session(), undefined); expect(old.isCurrent()).toBe(false);
  });
});
