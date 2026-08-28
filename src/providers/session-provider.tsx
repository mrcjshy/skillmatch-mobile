import { AuthError, type Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Supabase Auth identity/session state only.
 *
 * This provider restores and observes the Auth session. It does not resolve
 * the SkillMatch account record, role, or active status, and it does not
 * navigate. Those concerns belong to later pieces.
 */
export type SessionContextValue = {
  /** The restored Supabase Auth session, or null when no session exists. */
  session: Session | null;
  /** True while the initial session restoration is still pending. */
  isSessionLoading: boolean;
  /** Set only when session restoration itself failed. Distinct from "no session". */
  sessionError: AuthError | null;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<AuthError | null>(null);

  // Initial restoration + auth-state subscription.
  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setSession(null);
          setSessionError(error);
        } else {
          setSession(data.session);
          setSessionError(null);
        }
        setIsSessionLoading(false);
      })
      .catch((caught: unknown) => {
        if (!isMounted) return;
        setSession(null);
        setSessionError(
          caught instanceof AuthError ? caught : new AuthError(String(caught))
        );
        setIsSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Identity/session update only. No database lookups, no navigation.
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Foreground/background token-refresh lifecycle (native only).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const applyAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    applyAppState(AppState.currentState);
    const listener = AppState.addEventListener('change', applyAppState);

    return () => {
      listener.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, isSessionLoading, sessionError }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === undefined) {
    throw new Error('useSession must be used within a SessionProvider.');
  }
  return value;
}
