import { AppRegistry } from 'react-native';

/**
 * RTC-05 (owner, 2026-11-06): Decline on the ringing call notification works like Messenger. The native
 * receiver stops the ringing and starts this task without a screen; it declines the call on the server
 * with the signed-in session (supabase-js refreshes the token if needed). The server re-checks that the
 * call still rings for this account.
 */
export type CallActionData = { action?: unknown; bookingId?: unknown; callId?: unknown } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function declineOnServer(callId: string): Promise<void> {
  const { createVideoCallApi } = await import('./video-call');
  await createVideoCallApi().request('decline', callId);
}

export async function runCallAction(data: CallActionData, decline: (callId: string) => Promise<void> = declineOnServer): Promise<void> {
  if (!data || data.action !== 'decline' || typeof data.callId !== 'string' || !UUID_RE.test(data.callId)) return;
  try {
    await decline(data.callId);
  } catch {
    // The ringing already stopped; the call also ends when its ring window does.
  }
}

AppRegistry.registerHeadlessTask('SkillMatchCallAction', () => runCallAction);
