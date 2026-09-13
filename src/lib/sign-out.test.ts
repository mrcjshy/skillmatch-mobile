import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signOutCurrentUser } from './sign-out';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { signOut: vi.fn() },
  },
}));

describe('signOutCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deactivates the current Expo token before Auth sign-out', async () => {
    const deactivate = vi.fn().mockResolvedValue({ ok: true, skipped: false });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const clearToken = vi.fn();

    await signOutCurrentUser({
      getToken: () => 'ExponentPushToken[current]',
      deactivate,
      signOut,
      clearToken,
    });

    expect(deactivate).toHaveBeenCalledWith('ExponentPushToken[current]');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(deactivate.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it('skips deactivation when no Expo token was acquired', async () => {
    const deactivate = vi.fn();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const clearToken = vi.fn();

    await signOutCurrentUser({
      getToken: () => null,
      deactivate,
      signOut,
      clearToken,
    });

    expect(deactivate).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('clears a pending push inbox intent before Auth sign-out', async () => {
    const clearPendingInboxIntent = vi.fn();
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await signOutCurrentUser({
      getToken: () => null,
      deactivate: vi.fn(),
      signOut,
      clearToken: vi.fn(),
      clearPendingInboxIntent,
    });

    expect(clearPendingInboxIntent).toHaveBeenCalledTimes(1);
    expect(clearPendingInboxIntent.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0]
    );
  });

  it('still signs out when deactivation fails', async () => {
    const deactivate = vi.fn().mockRejectedValue(new Error('rpc down'));
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const clearToken = vi.fn();

    await expect(
      signOutCurrentUser({
        getToken: () => 'ExponentPushToken[current]',
        deactivate,
        signOut,
        clearToken,
      })
    ).resolves.toEqual({ error: null });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearToken).toHaveBeenCalledTimes(1);
  });
});
