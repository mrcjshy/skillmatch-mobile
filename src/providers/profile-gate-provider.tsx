import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { loadMyFirstName, loadProfileCompletion } from '@/lib/profile-details';
import { useAccount } from '@/providers/account-provider';

/**
 * REG-01 "complete your profile" gate. A UX gate, not authorization: the database never requires
 * completion, it only validates what is saved.
 *
 * - `undefined`: not applicable (no active Worker/Client with current consent), so the access
 *   derivation skips it.
 * - `loading`: the two completion markers are being read for this account.
 * - `incomplete`: the server answered that the profile or resume is missing: route to the step.
 * - `error`: the answer could not be read. The gate opens (UX step, not authorization: the server
 *   validates every save) and the next launch asks again.
 */
export type ProfileGate = 'loading' | 'complete' | 'incomplete' | 'error';

type ProfileGateValue = {
  profileGate: ProfileGate | undefined;
  /** Saved first name for the Home greeting; null until saved or when unreadable. */
  firstName: string | null;
  refreshProfileGate: () => Promise<void>;
};

const ProfileGateContext = createContext<ProfileGateValue>({ profileGate: undefined, firstName: null, refreshProfileGate: async () => undefined });

export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const { account, status, hasCurrentConsent } = useAccount();
  const role = account?.role === 'worker' || account?.role === 'client' ? account.role : null;
  const eligible = status === 'resolved' && account !== null && account.is_active === true && role !== null && hasCurrentConsent === true;
  const key = eligible && account && role ? `${account.id}|${role}` : null;
  const [result, setResult] = useState<{ key: string; gate: ProfileGate; firstName: string | null } | null>(null);

  const load = useCallback((forKey: string): Promise<{ key: string; gate: ProfileGate; firstName: string | null }> => {
    const userId = forKey.split('|')[0];
    const gate = Promise.resolve().then(loadProfileCompletion).then(
      (complete): ProfileGate => (complete ? 'complete' : 'incomplete'),
      (): ProfileGate => 'error',
    );
    const firstName = Promise.resolve().then(() => loadMyFirstName(userId)).catch(() => null);
    return Promise.all([gate, firstName]).then(([g, name]) => ({ key: forKey, gate: g, firstName: name }));
  }, []);

  // Load once per account: an account recheck (pending, then resolved again for the same user)
  // reuses the answer instead of reading again. A different account, or refreshProfileGate, reloads.
  // A late answer for an account that is no longer the requested one is dropped.
  const requestedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!key || requestedKey.current === key) return;
    requestedKey.current = key;
    load(key).then((next) => { if (requestedKey.current === next.key) setResult(next); });
  }, [key, load]);

  const refreshProfileGate = useCallback(async () => {
    if (!key) return;
    requestedKey.current = key;
    const next = await load(key);
    if (requestedKey.current === next.key) setResult(next);
  }, [key, load]);

  const profileGate = !key ? undefined : result?.key === key ? result.gate : 'loading';
  const firstName = key && result?.key === key ? result.firstName : null;
  return (
    <ProfileGateContext.Provider value={{ profileGate, firstName, refreshProfileGate }}>
      {children}
    </ProfileGateContext.Provider>
  );
}

export function useProfileGate(): ProfileGateValue {
  return useContext(ProfileGateContext);
}
