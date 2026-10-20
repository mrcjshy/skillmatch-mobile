import { supabase } from './supabase';

export type CallState = 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed' | 'ended' | 'failed';
export type VideoCall = { call_id: string; booking_id: string; role: 'caller' | 'callee'; state: CallState;
  ring_expires_at: string; server_now: string; counterpart_away: boolean };
export type CallReply = { call: VideoCall | null; token?: string; url?: string; ok?: boolean; reason?: string; incoming?: VideoCall[] };
export type CallAction = 'status' | 'start' | 'accept' | 'decline' | 'cancel' | 'end' | 'away' | 'back' | 'rejoin';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validCallId = (id: unknown): id is string => typeof id === 'string' && uuid.test(id);
export const terminalCall = (call: VideoCall) => !['ringing', 'accepted'].includes(call.state);
export function parseVideoCall(value: unknown): VideoCall | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  if (!validCallId(c.call_id) || !validCallId(c.booking_id) || !['caller', 'callee'].includes(c.role as string) ||
      !['ringing', 'accepted', 'declined', 'cancelled', 'missed', 'ended', 'failed'].includes(c.state as string) ||
      typeof c.server_now !== 'string' || !Number.isFinite(Date.parse(c.server_now)) ||
      typeof c.ring_expires_at !== 'string' || !Number.isFinite(Date.parse(c.ring_expires_at))) return null;
  return { call_id: c.call_id, booking_id: c.booking_id, role: c.role as VideoCall['role'], state: c.state as CallState,
    server_now: c.server_now, ring_expires_at: c.ring_expires_at, counterpart_away: c.counterpart_away === true };
}
export class VideoCallError extends Error {
  constructor(readonly denied: boolean) { super(denied ? 'This call is no longer available to your account.' : 'Could not reach the calling service. Please retry.'); }
}
export type CallRequest = (action: CallAction, id?: string) => Promise<CallReply>;
export function createVideoCallApi(invoke = (body: Record<string, string>) => supabase.functions.invoke('booking-call', { body })) {
  const request: CallRequest = async (action, id) => {
    if (id !== undefined && !validCallId(id)) throw new VideoCallError(true);
    if (action !== 'status' && !id) throw new VideoCallError(true);
    const body: Record<string, string> = { action };
    if (id) body[action === 'status' || action === 'start' ? 'booking_id' : 'call_id'] = id;
    const { data, error } = await invoke(body);
    if (error) throw new VideoCallError([401, 403].includes((error as { context?: { status?: number } }).context?.status ?? 0));
    if (!data || typeof data !== 'object') throw new VideoCallError(false);
    const call = parseVideoCall(data.call);
    if (data.call && !call) throw new VideoCallError(false);
    const reply: CallReply = { call, ok: data.ok, reason: data.reason };
    if (Array.isArray(data.incoming)) reply.incoming = data.incoming.map(parseVideoCall).filter((c: VideoCall | null): c is VideoCall => c !== null);
    // Ignore tokens on status/start and on rejected or terminal responses.
    if ((action === 'accept' || action === 'rejoin') && data.ok === true && call?.state === 'accepted' &&
        typeof data.token === 'string' && typeof data.url === 'string' && data.url.startsWith('wss://')) {
      reply.token = data.token; reply.url = data.url;
    }
    return reply;
  };
  return { request };
}

export type CallMedia = { connect: (url: string, token: string) => Promise<void>; stop: () => void };
export type VideoSessionView = { call: VideoCall | null; busy: boolean; connected: boolean; message: string | null; cleanupPending: boolean };
export function createVideoSession(deps: { bookingId: string; request: CallRequest; media: () => CallMedia; onChange: (view: VideoSessionView) => void }) {
  let view: VideoSessionView = { call: null, busy: false, connected: false, message: null, cleanupPending: false };
  let generation = 0;
  let active = false;
  let closed = false;
  let media: CallMedia | null = null;
  let reads = 0;
  let applied = 0;
  let unfinished: VideoCall | null = null;
  let acting = false;
  const retired = new Set<string>();
  const set = (patch: Partial<VideoSessionView>) => { view = { ...view, ...patch }; deps.onChange(view); };
  const stopMedia = () => { media?.stop(); media = null; set({ connected: false }); };
  const finish = async (call: VideoCall) => {
    if (terminalCall(call)) return;
    unfinished = call;
    set({ cleanupPending: true });
    try {
      const result = await deps.request(call.state === 'accepted' ? 'end' : call.role === 'caller' ? 'cancel' : 'decline', call.call_id);
      if (result.call?.call_id === call.call_id) unfinished = result.call;
      const ended = result.call && terminalCall(result.call);
      if (ended) unfinished = null;
      set({ cleanupPending: !ended, message: ended ? 'Call ended locally. Provider cleanup is handled by the server.' : 'End is not confirmed. Retry ending the call.' });
    } catch { set({ cleanupPending: true, message: 'Camera and microphone are off. Server end is not confirmed; retry.' }); }
  };
  const apply = (call: VideoCall | null, authoritative = false) => {
    if (call && call.booking_id !== deps.bookingId) return false;
    if (call && retired.has(call.call_id) && (view.call?.call_id !== call.call_id || !terminalCall(call))) return false;
    if (view.call && view.call.call_id !== call?.call_id) {
      if (!authoritative && !terminalCall(view.call)) return false;
      retired.add(view.call.call_id); generation++; stopMedia();
    }
    set({ call });
    if (call && terminalCall(call)) { retired.add(call.call_id); generation++; stopMedia(); }
    return true;
  };
  return {
    get view() { return view; },
    async refresh() {
      if (!active || closed) return;
      const mine = ++reads, gen = generation;
      try {
        const result = await deps.request('status', deps.bookingId);
        if (!active || closed || gen !== generation || mine <= applied) return;
        applied = mine; apply(result.call, true);
      } catch (error) {
        if (gen !== generation || closed) return;
        stopMedia(); set({ message: error instanceof Error ? error.message : 'Call unavailable.' });
      }
    },
    async act(action: 'start' | 'accept' | 'rejoin') {
      if (!active || closed || acting || (action !== 'start' && (!view.call || terminalCall(view.call)))) return;
      if (action === 'start' && view.call && !terminalCall(view.call)) return;
      const gen = ++generation;
      acting = true;
      if (action === 'start') set({ call: null });
      set({ busy: true, message: null });
      try {
        const result = await deps.request(action, action === 'start' ? deps.bookingId : view.call!.call_id);
        if (closed || gen !== generation) { if (result.call) await finish(result.call); return; }
        if (!apply(result.call)) return;
        if (result.ok === false) { set({ message: 'This action is unavailable. Refresh the call status.' }); return; }
        if (active && result.call?.state === 'accepted' && result.token && result.url) {
          stopMedia();
          const connection = deps.media(); media = connection;
          await connection.connect(result.url, result.token);
          if (closed || !active || gen !== generation) { connection.stop(); return; }
          const back = await deps.request('back', result.call.call_id);
          if (closed || !active || gen !== generation) {
            connection.stop();
            if (!closed) await deps.request('away', result.call.call_id).catch(() => {});
            return;
          }
          if (!back.ok || back.call?.state !== 'accepted') { connection.stop(); apply(back.call); return; }
          set({ connected: true });
        }
      } catch (error) { if (gen === generation && !closed) { stopMedia(); set({ message: error instanceof Error ? error.message : 'Calling unavailable.' }); } }
      finally { acting = false; set({ busy: false }); }
    },
    setActive(next: boolean) {
      if (closed || next === active) return;
      active = next;
      if (!next) {
        generation++; stopMedia(); set({ busy: false });
        if (view.call?.state === 'accepted') void deps.request('away', view.call.call_id).catch(() => {});
      }
    },
    end() { closed = true; active = false; generation++; stopMedia(); set({ busy: false }); if (view.call) void finish(view.call); },
    retryEnd() { if (closed && unfinished) void finish(unfinished); },
  };
}
