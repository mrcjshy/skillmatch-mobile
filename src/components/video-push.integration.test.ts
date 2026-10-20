// @ts-expect-error -- Node-only component harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only component harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import * as push from '@/lib/push-notifications';

const bookingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const callId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
function harness(path: string, request: ReturnType<typeof vi.fn>) {
  push.resetPushClientState();
  push.captureNotificationResponse({ notification: { request: { content: { data: { kind: 'call', booking_id: bookingId, call_id: callId } } } } });
  const effects: (() => void | (() => void))[] = [];
  const router = { push: vi.fn(), replace: vi.fn() };
  const modules: Record<string, unknown> = {
    'expo-notifications': { getLastNotificationResponseAsync: async () => null, addNotificationResponseReceivedListener: () => ({ remove() {} }), clearLastNotificationResponseAsync: vi.fn() },
    'expo-router': { usePathname: () => path, useRouter: () => router },
    react: { useEffect: (cb: () => void) => effects.push(cb), useState: () => [0, () => {}] },
    '@/app/_layout': { deriveAccessState: () => 'worker' },
    '@/lib/booking-records': {}, '@/lib/supabase': {}, '@/lib/push-notifications': push,
    '@/lib/video-call': { createVideoCallApi: () => ({ request }), terminalCall: (c: { state: string }) => !['ringing', 'accepted'].includes(c.state) },
    '@/providers/account-provider': { useAccount: () => ({ status: 'resolved', account: { role: 'worker', is_active: true } }) },
    '@/providers/session-provider': { useSession: () => ({ session: {}, isSessionLoading: false }) },
  };
  const exports: Record<string, () => void> = {};
  runInNewContext(ts.transpileModule(readFileSync('src/components/push-notification-inbox-intent.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
  exports.PushNotificationInboxIntent();
  const cleanup = effects[1]();
  return { router, cleanup };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
it('cold-start call intent waits for role Home before reauthorization and never accepts from a push', async () => {
  const request = vi.fn(async () => ({ call: { call_id: callId, booking_id: bookingId, state: 'ringing' } }));
  const cold = harness('/', request); await flush();
  expect(request).not.toHaveBeenCalled(); expect(cold.router.push).not.toHaveBeenCalled();
  const home = harness('/worker', request); await flush();
  expect(request).toHaveBeenCalledExactlyOnceWith('status', bookingId);
  expect(home.router.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/worker/video', params: { bookingId } });
  expect(push.getPendingCall()).toBeNull();
});
it('a replaced or terminal call hint falls back to the inbox', async () => {
  const h = harness('/worker', vi.fn(async () => ({ call: { call_id: callId, booking_id: bookingId, state: 'ended' } })));
  await flush(); expect(h.router.push).not.toHaveBeenCalled();
  expect(h.router.replace).toHaveBeenCalledWith('/worker/notifications');
});
it('account or route cleanup prevents a late authorization from navigating', async () => {
  let resolve!: (value: unknown) => void;
  const h = harness('/worker', vi.fn(() => new Promise(r => { resolve = r; })));
  h.cleanup?.(); resolve({ call: { call_id: callId, booking_id: bookingId, state: 'ringing' } }); await flush();
  expect(h.router.push).not.toHaveBeenCalled(); expect(h.router.replace).not.toHaveBeenCalled();
});
it('call payload retains only valid identifiers', () => {
  expect(push.parseCallPushData({ kind: 'call', booking_id: bookingId, call_id: callId, token: 'untrusted', latitude: 14 })).toEqual({ bookingId, callId });
  expect(push.parseCallPushData({ kind: 'call', booking_id: bookingId, call_id: 'bad' })).toBeNull();
});
