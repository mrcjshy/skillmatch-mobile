/**
 * What the immersive call screen shows for each call state. Pure presentation
 * over the existing session view: it never decides lifecycle (the session and
 * the server do), it only names the state and lists the actions that the
 * existing handlers already support.
 */
import { terminalCall, type VideoCall, type VideoSessionView } from './video-call';

export type CallStage = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'rejoin' | 'connected' | 'finished' | 'closed';
export type CallAction = 'start' | 'accept' | 'decline' | 'cancel' | 'join' | 'end' | 'retry_end';

const TERMINAL_COPY: Record<Exclude<VideoCall['state'], 'ringing' | 'accepted'>, string> = {
  declined: 'Call declined',
  cancelled: 'Call cancelled',
  missed: 'Missed call',
  ended: 'Call ended',
  failed: 'Call failed',
};

/** The approved display identity: the booking role, never a provider identity or token detail. */
export function counterpartLabel(viewerRole: 'worker' | 'client'): string {
  return viewerRole === 'worker' ? 'Your Client' : 'Your Worker';
}

export function callPresentation({ view, ended, answering = false }: { view: VideoSessionView; ended: boolean; answering?: boolean }): {
  stage: CallStage; status: string; actions: CallAction[];
} {
  const call = view.call;
  const retry: CallAction[] = view.cleanupPending ? ['retry_end'] : [];
  if (ended) return { stage: 'closed', status: 'Call closed on this device', actions: retry };
  if (!call) return { stage: 'idle', status: 'Ready to call', actions: ['start', ...retry] };
  if (terminalCall(call)) {
    return { stage: 'finished', status: TERMINAL_COPY[call.state as keyof typeof TERMINAL_COPY], actions: ['start', ...retry] };
  }
  if (call.state === 'ringing') {
    // RTC-05: Answer was already tapped on the call notification; connect instead of asking again.
    if (call.role === 'callee' && answering) return { stage: 'connecting', status: 'Connecting…', actions: ['end', ...retry] };
    return call.role === 'callee'
      ? { stage: 'incoming', status: 'Incoming video call', actions: ['decline', 'accept', ...retry] }
      : { stage: 'outgoing', status: 'Calling…', actions: ['cancel', ...retry] };
  }
  // accepted
  if (view.connected) return { stage: 'connected', status: 'Connected', actions: ['end', ...retry] };
  if (view.busy) return { stage: 'connecting', status: 'Connecting…', actions: ['end', ...retry] };
  return { stage: 'rejoin', status: 'Call in progress. Tap Join to connect.', actions: ['end', 'join', ...retry] };
}

/**
 * RTC-03 (owner, 2026-11-06): the caller hears ringback while the call rings; the callee's native
 * ringing stops once the call no longer rings for them, or once they leave the call screen.
 */
export function ringEffects({ view, ended }: { view: VideoSessionView; ended: boolean }): { ringback: boolean; stopIncomingRing: boolean } {
  const call = view.call;
  return {
    ringback: !ended && call !== null && call.role === 'caller' && call.state === 'ringing',
    stopIncomingRing: ended || (call !== null && call.role === 'callee' && call.state !== 'ringing'),
  };
}

/**
 * The caller of an answered call, not yet connected: the call to join on their behalf, once.
 * Tapping Join stays available for a connection that drops or a join that failed.
 */
export function callToAutoJoin(view: VideoSessionView, ended: boolean, attempted: string | null): string | null {
  const call = view.call;
  if (ended || !call || call.role !== 'caller' || call.state !== 'accepted' || view.connected || view.busy) return null;
  return call.call_id === attempted ? null : call.call_id;
}
