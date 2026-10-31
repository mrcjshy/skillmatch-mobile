// @ts-expect-error -- Node-only source boundary check.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Option B (2026-10-21): the continuation path may navigate and scroll, nothing else. These source checks pin
// the boundary the behavioural tests cannot see: no sign-out, push-token, provisioning, persistence, sharing,
// call or global Back side effect is reachable from the continuation code.
const read = (file: string) => readFileSync(`${process.cwd()}/src/${file}`, 'utf8');
const continuation = read('lib/session-route-continuation.ts');
const restore = read('hooks/use-session-continuation-restore.ts');
const chat = read('components/booking-chat.tsx');
const account = read('providers/account-provider.tsx');

describe('Option B continuation boundary (source)', () => {
  it.each([['session-route-continuation.ts', continuation], ['use-session-continuation-restore.ts', restore]])(
    '%s reaches no sign-out, push, provisioning, storage, sharing, call or Back-trap API', (_name, source) => {
      for (const forbidden of ['signOutCurrentUser', 'signOut(', 'deactivateExpoPushToken', 'push-notifications', '.insert(', '.upsert(',
        'AsyncStorage', 'SecureStore', 'MMKV', 'localStorage', 'location-sharing', 'use-location-sharing', 'watchPositionAsync',
        'start_my_booking_location_share', 'booking-video', 'BackHandler', 'supabase', 'Linking.']) {
        expect(source).not.toContain(forbidden);
      }
    });

  it('the parent-chain allowlist contains no post, payment, report, video, auth or recovery screen', () => {
    const allowlist = continuation.slice(continuation.indexOf('const CHAIN_ROUTES'), continuation.indexOf('const TAB_ROOTS'));
    for (const screen of ['post-job', 'video', 'report', 'payment', 'login', 'register', 'update-password', 'verify', 'legal-consent', 'portfolio'])
      expect(allowlist).not.toContain(screen);
  });

  it('Chat adds no Back trap, persistence or content capture to the continuation', () => {
    expect(chat).not.toContain('BackHandler');
    expect(chat).not.toMatch(/AsyncStorage|SecureStore|MMKV/);
    // Only an id and an offset leave the screen.
    const capture = chat.slice(chat.indexOf('function scrolled('), chat.indexOf('return (', chat.indexOf('function scrolled(')));
    expect(capture).toContain('rememberChatAnchor');
    expect(capture).not.toMatch(/\.content\b|created_at|sender_id/);
  });

  it('the account recheck returns before the only INSERT and adds no sign-out or push-token call', () => {
    const recheckGuard = account.indexOf("if (mode === 'recheck')");
    expect(recheckGuard).toBeGreaterThan(0);
    expect(recheckGuard).toBeLessThan(account.indexOf(".from('users').insert("));
    expect(account.match(/\.insert\(/g)).toHaveLength(1);
    for (const forbidden of ['signOutCurrentUser', 'auth.signOut', 'deactivateExpoPushToken', '.upsert(']) expect(account).not.toContain(forbidden);
  });
});
