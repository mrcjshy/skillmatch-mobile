import { requireOptionalNativeModule } from 'expo';

/**
 * RTC-03 (owner, 2026-11-06): booking video calls ring like phone calls. The ringing is native
 * (modules/skillmatch-call-alert): a call push shows a full-screen call notification with the
 * ringtone, even while SkillMatch is closed or the screen is off. This wrapper lets the app read what
 * that notification opened it with, stop the ringing, show the call screen over the lock screen only
 * while it is open, and play the caller's ringback. On an older native build every call does nothing.
 */
export type CallLaunchAction = 'open' | 'answer' | 'decline';
export type CallLaunch = { bookingId: string; callId: string; action: CallLaunchAction };

export type NativeCallAlert = {
  consumeLaunchCall(): unknown;
  cancelIncomingCall(): void;
  setShowWhenLocked(show: boolean): void;
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
  startRingback(): void;
  stopRingback(): void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: readonly string[] = ['open', 'answer', 'decline'];

/** A launch from the native notification, or null. Ids are re-checked by the server before any use. */
export function parseCallLaunch(value: unknown): CallLaunch | null {
  if (!value || typeof value !== 'object') return null;
  const { bookingId, callId, action } = value as Record<string, unknown>;
  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId) || typeof callId !== 'string' || !UUID_RE.test(callId)) return null;
  return { bookingId, callId, action: typeof action === 'string' && ACTIONS.includes(action) ? action as CallLaunchAction : 'open' };
}

export function createCallAlert(load: () => NativeCallAlert | null) {
  let native: NativeCallAlert | null | undefined;
  const get = (): NativeCallAlert | null => {
    if (native === undefined) {
      try { native = load(); } catch { native = null; }
    }
    return native;
  };
  const quietly = (run: (module: NativeCallAlert) => void) => {
    const module = get();
    if (!module) return;
    try { run(module); } catch { /* A native failure never blocks the call screen. */ }
  };
  return {
    isAvailable: () => get() !== null,
    consumeLaunch(): CallLaunch | null {
      const module = get();
      if (!module) return null;
      try { return parseCallLaunch(module.consumeLaunchCall()); } catch { return null; }
    },
    cancelIncoming: () => quietly((module) => module.cancelIncomingCall()),
    showWhenLocked: (show: boolean) => quietly((module) => module.setShowWhenLocked(show)),
    canUseFullScreen(): boolean {
      const module = get();
      if (!module) return true;
      try { return module.canUseFullScreenIntent() !== false; } catch { return true; }
    },
    openFullScreenSettings: () => quietly((module) => module.openFullScreenIntentSettings()),
    startRingback: () => quietly((module) => module.startRingback()),
    stopRingback: () => quietly((module) => module.stopRingback()),
  };
}

export const callAlert = createCallAlert(() => requireOptionalNativeModule<NativeCallAlert>('SkillMatchCallAlert'));
