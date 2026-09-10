import { AuthError, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  RECOVERY_INVALID_LINK_COPY,
  isRecoveryPasswordUpdateAllowed,
  isSkillMatchRecoveryDestination,
  parseRecoveryLink,
  type RecoveryStatus,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';

/**
 * Supabase Auth identity/session state only.
 *
 * Restores and observes the Auth session. Recovery-link handling can replace
 * the restored session with tokens taken only from an incoming SkillMatch
 * recovery URL. Ordinary SIGNED_IN never authorizes password recovery.
 * Recovery authorization is in-memory only and is not persisted.
 */
export type SessionContextValue = {
  /** The restored Supabase Auth session, or null when no session exists. */
  session: Session | null;
  /** True while the initial session/recovery restoration is still pending. */
  isSessionLoading: boolean;
  /** Set only when session restoration itself failed. Distinct from "no session". */
  sessionError: AuthError | null;
  recoveryStatus: RecoveryStatus;
  recoveryUserId: string | null;
  recoveryError: string | null;
  canUpdateRecoveryPassword: boolean;
  clearRecoveryAuthorization: () => void;
  markRecoveryPasswordUpdated: () => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<AuthError | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('idle');
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recoveryStatusRef = useRef<RecoveryStatus>('idle');
  const recoveryUserIdRef = useRef<string | null>(null);
  const lastHandledRecoveryUrlRef = useRef<string | null>(null);
  const handleRecoveryUrlRef = useRef<(url: string) => Promise<void>>(async () => {});

  const applySession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const applyRecoveryStatus = useCallback((next: RecoveryStatus) => {
    recoveryStatusRef.current = next;
    setRecoveryStatus(next);
  }, []);

  const applyRecoveryUserId = useCallback((next: string | null) => {
    recoveryUserIdRef.current = next;
    setRecoveryUserId(next);
  }, []);

  const clearRecoveryAuthorization = useCallback(() => {
    applyRecoveryStatus('idle');
    applyRecoveryUserId(null);
    setRecoveryError(null);
  }, [applyRecoveryStatus, applyRecoveryUserId]);

  const markRecoveryPasswordUpdated = useCallback(() => {
    applyRecoveryStatus('complete');
    applyRecoveryUserId(null);
    setRecoveryError(null);
  }, [applyRecoveryStatus, applyRecoveryUserId]);

  const failRecovery = useCallback(() => {
    applyRecoveryStatus('error');
    applyRecoveryUserId(null);
    setRecoveryError(RECOVERY_INVALID_LINK_COPY);
  }, [applyRecoveryStatus, applyRecoveryUserId]);

  const restorePriorSession = useCallback(
    async (previous: Session | null) => {
      if (previous === null) {
        const existing = await supabase.auth.getSession();
        if (!existing.error) applySession(existing.data.session);
        return;
      }

      const restored = await supabase.auth.setSession({
        access_token: previous.access_token,
        refresh_token: previous.refresh_token,
      });
      if (!restored.error && restored.data.session) {
        applySession(restored.data.session);
        return;
      }

      applySession(previous);
    },
    [applySession]
  );

  const handleRecoveryUrl = useCallback(
    async (url: string) => {
      if (!isSkillMatchRecoveryDestination(url)) return;
      if (lastHandledRecoveryUrlRef.current === url) return;
      lastHandledRecoveryUrlRef.current = url;

      applyRecoveryStatus('processing');
      applyRecoveryUserId(null);
      setRecoveryError(null);

      let previous = sessionRef.current;
      try {
        if (previous === null) {
          const existing = await supabase.auth.getSession();
          if (!existing.error && existing.data.session) {
            previous = existing.data.session;
            applySession(previous);
          }
        }

        const parsed = parseRecoveryLink(url);
        if (parsed.kind !== 'tokens') {
          failRecovery();
          return;
        }

        const { data, error } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });

        if (error || data.session === null) {
          failRecovery();
          await restorePriorSession(previous);
          return;
        }

        applySession(data.session);
        setSessionError(null);
        applyRecoveryUserId(data.session.user.id);
        applyRecoveryStatus('ready');
      } catch {
        failRecovery();
        await restorePriorSession(previous);
      }
    },
    [
      applyRecoveryStatus,
      applyRecoveryUserId,
      applySession,
      failRecovery,
      restorePriorSession,
    ]
  );

  useEffect(() => {
    handleRecoveryUrlRef.current = handleRecoveryUrl;
  }, [handleRecoveryUrl]);

  // Initial restoration + auth-state subscription + recovery-link handling.
  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Identity/session update only. Ordinary SIGNED_IN never authorizes recovery.
      if (!isMounted) return;
      applySession(nextSession);
      if (nextSession) setSessionError(null);

      if (nextSession === null) {
        // A failed setSession can emit a transient null. Keep processing/error
        // so Update Password can show the fail-closed state instead of dropping
        // back into ordinary routing mid-attempt.
        if (recoveryStatusRef.current === 'ready' || recoveryStatusRef.current === 'complete') {
          applyRecoveryStatus('idle');
          applyRecoveryUserId(null);
          setRecoveryError(null);
        }
        return;
      }

      const boundId = recoveryUserIdRef.current;
      if (
        recoveryStatusRef.current === 'ready' &&
        boundId !== null &&
        nextSession.user.id !== boundId
      ) {
        applyRecoveryStatus('idle');
        applyRecoveryUserId(null);
        setRecoveryError(null);
      }
    });

    const linking = Linking.addEventListener('url', ({ url }) => {
      if (!isMounted) return;
      void handleRecoveryUrlRef.current(url);
    });

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (!isMounted) return;

        if (initialUrl !== null && isSkillMatchRecoveryDestination(initialUrl)) {
          await handleRecoveryUrlRef.current(initialUrl);
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (!isMounted) return;
          if (error) {
            applySession(null);
            setSessionError(error);
          } else {
            applySession(data.session);
            setSessionError(null);
          }
        }
      } catch (caught: unknown) {
        if (!isMounted) return;
        applySession(null);
        setSessionError(caught instanceof AuthError ? caught : new AuthError(String(caught)));
      } finally {
        if (isMounted) setIsSessionLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linking.remove();
    };
  }, [applyRecoveryStatus, applyRecoveryUserId, applySession]);

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
    <SessionContext.Provider
      value={{
        session,
        isSessionLoading,
        sessionError,
        recoveryStatus,
        recoveryUserId,
        recoveryError,
        canUpdateRecoveryPassword: isRecoveryPasswordUpdateAllowed(
          recoveryStatus,
          recoveryUserId,
          session
        ),
        clearRecoveryAuthorization,
        markRecoveryPasswordUpdated,
      }}
    >
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
