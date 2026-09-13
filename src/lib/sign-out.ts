import { supabase } from './supabase';
import {
  clearPendingNotificationsInboxIntent,
  clearRememberedExpoPushToken,
  deactivateExpoPushToken,
  getRememberedExpoPushToken,
} from './push-notifications';

export type SignOutDeps = {
  getToken: () => string | null;
  deactivate: (token: string) => Promise<unknown>;
  signOut: () => Promise<{ error: { message?: string } | null }>;
  clearToken: () => void;
  clearPendingInboxIntent: () => void;
};

function defaultSignOutDeps(): SignOutDeps {
  return {
    getToken: getRememberedExpoPushToken,
    deactivate: (token) =>
      deactivateExpoPushToken(async (fn, args) => await supabase.rpc(fn, args), token),
    signOut: () => supabase.auth.signOut(),
    clearToken: clearRememberedExpoPushToken,
    clearPendingInboxIntent: clearPendingNotificationsInboxIntent,
  };
}

/**
 * Best-effort current-token deactivation, then Auth sign-out.
 * Deactivation failure must not block sign-out.
 */
export async function signOutCurrentUser(
  overrides?: Partial<SignOutDeps>
): Promise<{ error: { message?: string } | null }> {
  const deps = { ...defaultSignOutDeps(), ...overrides };
  deps.clearPendingInboxIntent();
  const token = deps.getToken();
  if (token) {
    try {
      await deps.deactivate(token);
    } catch {
      // Best effort only. Session teardown still proceeds.
    }
  }
  const result = await deps.signOut();
  deps.clearToken();
  return result;
}
