import { expect, it, vi } from 'vitest';
import { createVideoCallApi, createVideoSession, type CallReply, type VideoCall } from './video-call';
vi.mock('./supabase', () => ({ supabase: {} }));
const booking = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const call: VideoCall = { call_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', booking_id: booking, role: 'callee', state: 'ringing', server_now: '2026-10-15T00:00:00Z', ring_expires_at: '2026-10-15T00:00:45Z', counterpart_away: false };
it('strips unexpected pre-acceptance tokens at the client boundary', async () => {
  const api = createVideoCallApi(async () => ({ data: { call, token: 'secret', url: 'wss://example.test' }, error: null }));
  expect(await api.request('start', booking)).not.toHaveProperty('token');
  expect(await api.request('status', booking)).not.toHaveProperty('token');
});
it('a late accepted response after navigation ends the call without opening media', async () => {
  let resolve!: (reply: CallReply) => void;
  const accepted = new Promise<CallReply>(r => { resolve = r; });
  const invoke = vi.fn(async (body: Record<string, string>) => ({ data: body.action === 'status' ? { call } : body.action === 'accept' ? await accepted : { call: { ...call, state: 'ended' }, ok: true }, error: null }));
  const media = vi.fn(() => ({ connect: vi.fn(), stop: vi.fn() }));
  const owner = createVideoSession({ bookingId: booking, request: createVideoCallApi(invoke).request, media, onChange: () => {} });
  owner.setActive(true); await owner.refresh();
  const pending = owner.act('accept'); owner.end();
  resolve({ call: { ...call, state: 'accepted' }, ok: true, token: 'token', url: 'wss://example.test' });
  await pending;
  expect(media).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith({ action: 'end', call_id: call.call_id });
});
it('background stops media, returning requires explicit rejoin, End never auto-rejoins', async () => {
  const stop = vi.fn(); const connect = vi.fn(async () => {});
  const request = vi.fn(async () => ({ call: { ...call, state: 'accepted' as const }, ok: true, token: 'token', url: 'wss://example.test' }));
  const owner = createVideoSession({ bookingId: booking, request, media: () => ({ stop, connect }), onChange: () => {} });
  owner.setActive(true); await owner.refresh(); await owner.act('rejoin');
  expect(owner.view.connected).toBe(true);
  owner.setActive(false); owner.setActive(true);
  expect(stop).toHaveBeenCalledOnce(); expect(connect).toHaveBeenCalledOnce();
  owner.end(); await owner.act('rejoin');
  expect(connect).toHaveBeenCalledOnce();
});
it('terminal state cannot be resurrected by a later status response', async () => {
  let state: VideoCall['state'] = 'ended';
  const owner = createVideoSession({ bookingId: booking, request: async () => ({ call: { ...call, state } }), media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh(); state = 'accepted'; await owner.refresh();
  expect(owner.view.call?.state).toBe('ended');
});
it('a fresh call identity can appear after the previous call ends', async () => {
  let current = { ...call, state: 'ended' as VideoCall['state'] };
  const owner = createVideoSession({ bookingId: booking, request: async () => ({ call: current }), media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh();
  current = { ...call, call_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }; await owner.refresh();
  expect(owner.view.call?.call_id).toBe(current.call_id);
});
it('authoritative status replaces a missed terminal identity and retires its late responses', async () => {
  let current = { ...call, state: 'accepted' as VideoCall['state'] };
  const owner = createVideoSession({ bookingId: booking, request: async () => ({ call: current }), media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh();
  const next = { ...call, call_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };
  current = next; await owner.refresh();
  expect(owner.view.call?.call_id).toBe(next.call_id);
  current = { ...call, state: 'accepted' }; await owner.refresh();
  expect(owner.view.call?.call_id).toBe(next.call_id);
});

it('restores away if background crosses a successful connection back acknowledgement', async () => {
  let resolve!: (reply: CallReply) => void;
  const pending = new Promise<CallReply>(r => { resolve = r; });
  const accepted = { call: { ...call, state: 'accepted' as const }, ok: true, token: 'token', url: 'wss://test.invalid' };
  const request = vi.fn(async (action: string): Promise<CallReply> => action === 'back' ? pending : accepted);
  const owner = createVideoSession({ bookingId: booking, request, media: () => ({ connect: async () => {}, stop: vi.fn() }), onChange: () => {} });
  owner.setActive(true); await owner.refresh();
  const joining = owner.act('rejoin');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(request).toHaveBeenLastCalledWith('back', call.call_id);
  owner.setActive(false); resolve(accepted); await joining;
  expect(request).toHaveBeenLastCalledWith('away', call.call_id);
  expect(owner.view.connected).toBe(false);
});
it('failed end remains visibly unresolved', async () => {
  const owner = createVideoSession({ bookingId: booking, request: async action => { if (action === 'status') return { call }; throw Error('offline'); }, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh(); owner.end(); await Promise.resolve(); await Promise.resolve();
  expect(owner.view.cleanupPending).toBe(true);
});

it('retry End follows a ringing-to-accepted race instead of repeating cancel forever', async () => {
  const request = vi.fn(async (action: string): Promise<CallReply> => {
    if (action === 'status') return { call: { ...call, role: 'caller' } };
    if (action === 'cancel') return { ok: false, call: { ...call, state: 'accepted' } };
    return { ok: true, call: { ...call, state: 'ended' } };
  });
  const owner = createVideoSession({ bookingId: booking, request, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh(); owner.end(); await Promise.resolve();
  owner.retryEnd(); await Promise.resolve();
  expect(request).toHaveBeenLastCalledWith('end', call.call_id);
  expect(owner.view.cleanupPending).toBe(false);
});

it('a final media disconnect leaves the accepted call available only for explicit rejoin', async () => {
  let disconnect!: () => void;
  const connect = vi.fn(async () => {}), stop = vi.fn();
  const request = vi.fn(async (): Promise<CallReply> => ({ call: { ...call, state: 'accepted' }, ok: true, token: 'token', url: 'wss://test.invalid' }));
  const owner = createVideoSession({ bookingId: booking, request,
    media: onDisconnected => { disconnect = onDisconnected; return { connect, stop }; }, onChange: () => {} });
  owner.setActive(true); await owner.refresh(); await owner.act('rejoin');
  expect(owner.view.connected).toBe(true);
  disconnect?.();
  expect(owner.view.connected).toBe(false);
  expect(owner.view.call?.state).toBe('accepted');
  expect(stop).toHaveBeenCalled();
  expect(connect).toHaveBeenCalledOnce();
  await owner.refresh();
  expect(connect).toHaveBeenCalledOnce();
  await owner.act('rejoin');
  expect(connect).toHaveBeenCalledTimes(2);
});

it('a queued disconnect from retired media cannot interrupt an explicit rejoin', async () => {
  const callbacks: (() => void)[] = [];
  const request = async (): Promise<CallReply> => ({ call: { ...call, state: 'accepted' }, ok: true, token: 'token', url: 'wss://test.invalid' });
  const owner = createVideoSession({ bookingId: booking, request,
    media: onDisconnected => { callbacks.push(onDisconnected); return { connect: async () => {}, stop: () => {} }; }, onChange: () => {} });
  owner.setActive(true); await owner.refresh(); await owner.act('rejoin');
  owner.setActive(false); owner.setActive(true); await owner.act('rejoin');
  callbacks[0]();
  expect(owner.view.connected).toBe(true);
  expect(owner.view.message).toBe(null);
});

it('a queued disconnect cannot replace terminal state or its message', async () => {
  let disconnected!: () => void, ended = false;
  const request = async (): Promise<CallReply> => ({ call: { ...call, state: ended ? 'ended' : 'accepted' }, ok: true, token: 'token', url: 'wss://test.invalid' });
  const owner = createVideoSession({ bookingId: booking, request,
    media: onDisconnected => { disconnected = onDisconnected; return { connect: async () => {}, stop: () => {} }; }, onChange: () => {} });
  owner.setActive(true); await owner.refresh(); await owner.act('rejoin');
  ended = true; await owner.refresh(); disconnected();
  expect(owner.view.call?.state).toBe('ended');
  expect(owner.view.connected).toBe(false);
  expect(owner.view.message).toBe(null);
});

it('a disconnect crossing a pending back acknowledgement cannot restore Connected', async () => {
  let disconnected!: () => void, resolve!: (reply: CallReply) => void;
  const pending = new Promise<CallReply>(r => { resolve = r; });
  const accepted: CallReply = { call: { ...call, state: 'accepted' }, ok: true, token: 'token', url: 'wss://test.invalid' };
  const request = vi.fn(async (action: string) => action === 'back' ? pending : accepted);
  const owner = createVideoSession({ bookingId: booking, request,
    media: onDisconnected => { disconnected = onDisconnected; return { connect: async () => {}, stop: () => {} }; }, onChange: () => {} });
  owner.setActive(true); await owner.refresh();
  const joining = owner.act('rejoin');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(request).toHaveBeenLastCalledWith('back', call.call_id);
  disconnected(); resolve(accepted); await joining;
  expect(owner.view.connected).toBe(false);
  expect(owner.view.busy).toBe(false);
  expect(request).toHaveBeenLastCalledWith('away', call.call_id);
});

it('optional backend invitation observability leaves the legacy start response usable and token-free', async () => {
  for (const invitation of [undefined, 'not_attempted', 'already_claimed', 'no_targets', 'tickets_accepted', 'not_confirmed']) {
    const api = createVideoCallApi(async () => ({ data: { call, created: true, invitation, token: 'unexpected', url: 'wss://test.invalid' }, error: null }));
    expect(await api.request('start', booking)).toEqual({ call, ok: undefined, reason: undefined });
  }
});
