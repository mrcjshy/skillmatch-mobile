import { describe, expect, it, vi } from 'vitest';

import { callPresentation, counterpartLabel } from './video-call-view';
import type { VideoCall, VideoSessionView } from './video-call';

vi.mock('./supabase', () => ({ supabase: {} }));

const call = (state: VideoCall['state'], role: VideoCall['role'] = 'caller'): VideoCall => ({
  call_id: '11111111-1111-4111-8111-111111111111', booking_id: '22222222-2222-4222-8222-222222222222', role, state,
  ring_expires_at: '2026-10-16T00:01:00Z', server_now: '2026-10-16T00:00:00Z', counterpart_away: false,
});
const view = (over: Partial<VideoSessionView> = {}): VideoSessionView => ({ call: null, busy: false, connected: false, message: null, cleanupPending: false, ...over });

describe('immersive call states', () => {
  it('names the counterpart by booking role only', () => {
    expect(counterpartLabel('worker')).toBe('Your Client');
    expect(counterpartLabel('client')).toBe('Your Worker');
  });

  it('ready, calling, incoming, connecting, rejoin and connected each offer only their existing actions', () => {
    expect(callPresentation({ view: view(), ended: false })).toEqual({ stage: 'idle', status: 'Ready to call', actions: ['start'] });
    expect(callPresentation({ view: view({ call: call('ringing', 'caller') }), ended: false }))
      .toEqual({ stage: 'outgoing', status: 'Calling…', actions: ['cancel'] });
    expect(callPresentation({ view: view({ call: call('ringing', 'callee') }), ended: false }))
      .toEqual({ stage: 'incoming', status: 'Incoming video call', actions: ['decline', 'accept'] });
    expect(callPresentation({ view: view({ call: call('accepted'), busy: true }), ended: false }))
      .toEqual({ stage: 'connecting', status: 'Connecting…', actions: ['end'] });
    expect(callPresentation({ view: view({ call: call('accepted') }), ended: false }))
      .toEqual({ stage: 'rejoin', status: 'Call in progress. Tap Join to connect.', actions: ['end', 'join'] });
    expect(callPresentation({ view: view({ call: call('accepted'), connected: true }), ended: false }))
      .toEqual({ stage: 'connected', status: 'Connected', actions: ['end'] });
  });

  it('missed, declined, cancelled, ended and failed are final and only offer a new call', () => {
    const copy = { missed: 'Missed call', declined: 'Call declined', cancelled: 'Call cancelled', ended: 'Call ended', failed: 'Call failed' } as const;
    for (const [state, status] of Object.entries(copy)) {
      expect(callPresentation({ view: view({ call: call(state as VideoCall['state']) }), ended: false })).toEqual({ stage: 'finished', status, actions: ['start'] });
    }
  });

  it('a call ended on this device never offers to start or rejoin again, only a pending cleanup retry', () => {
    expect(callPresentation({ view: view({ call: call('accepted'), connected: true }), ended: true }))
      .toEqual({ stage: 'closed', status: 'Call closed on this device', actions: [] });
    expect(callPresentation({ view: view({ call: call('ended'), cleanupPending: true }), ended: true }).actions).toEqual(['retry_end']);
    expect(callPresentation({ view: view({ call: call('accepted'), connected: true, cleanupPending: true }), ended: false }).actions).toEqual(['end', 'retry_end']);
  });
});
