import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { getMyConsent, isCurrentLegalConsent, type UserConsent } from '@/lib/user-consent';
import { getMyIdentitySubmission, type WorkerIdentitySubmission } from '@/lib/worker-identity';
import { loadWorkerOnboarding, type WorkerOnboardingState } from '@/lib/worker-onboarding';
import { isPhoneVerificationRequiredForBootstrap } from '@/lib/phone-verification';
import { useSession } from '@/providers/session-provider';
import { ClientPostJobDraftMemoryProvider } from '@/providers/client-post-job-draft-provider';

/**
 * Authoritative SkillMatch application-account state.
 *
 * A Supabase Auth session is only an authenticated identity. The application
 * account (role, active status, profile) lives in the `users` table and is
 * the ONLY source of authorization. This provider resolves that row for the
 * current session:
 *
 *   session → SELECT own row → row exists → validate → authoritative
 *                            → row missing → validate untrusted signup
 *                              metadata → INSERT once → RE-SELECT → validate
 *                              → authoritative
 *
 * Signup metadata (`registration_full_name`, `registration_phone`,
 * `registration_role_intent`) is user-controlled and is used solely as
 * bootstrap input for a genuinely missing row. It never updates an existing
 * row and never becomes authorization by itself.
 *
 * This provider performs no navigation. Route decisions belong to a later
 * piece.
 */

/** Database role literals. Note: the admin literal is `administrator`. */
export type AccountRole = 'worker' | 'client' | 'administrator';

export type AccountRecord = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: AccountRole;
  barangay: string;
  city: string;
  is_active: boolean;
};

export type AccountBootstrapErrorCode =
  /** SELECT of the own account row failed (network/database). */
  | 'account_fetch_failed'
  /** Row is missing and signup metadata / session email are unusable. */
  | 'bootstrap_input_invalid'
  /** Row is missing and the intended phone is not verified in Supabase Auth. */
  | 'phone_verification_required'
  /** Row is missing and the single INSERT attempt failed. */
  | 'account_insert_failed'
  /** A row was returned but does not satisfy the application contract. */
  | 'authoritative_account_invalid';

export type AccountBootstrapError = {
  code: AccountBootstrapErrorCode;
  message: string;
};

/**
 * - `idle`: no authenticated session to resolve (session loading, signed
 *   out, or session restoration error). Owned by SessionProvider; not an
 *   account error.
 * - `pending`: authenticated; authoritative lookup/bootstrap in flight.
 * - `resolved`: authoritative account known (may be inactive).
 * - `error`: lookup/bootstrap failed; retryable. Distinct from "blocked".
 */
export type AccountStatus = 'idle' | 'pending' | 'resolved' | 'error';

export type AccountContextValue = {
  clientDraftTermination?: { subscribe: (listener: () => void) => () => void; snapshot: () => number };
  account: AccountRecord | null;
  status: AccountStatus;
  isAccountLoading: boolean;
  accountError: AccountBootstrapError | null;
  retryAccountBootstrap: () => void;
  consent: UserConsent | null;
  hasCurrentConsent: boolean;
  refreshConsent: () => Promise<void>;
  identitySubmission: WorkerIdentitySubmission | null;
  hasIdentitySubmission: boolean;
  workerIsVerified: boolean;
  workerOnboardingState: WorkerOnboardingState;
  refreshIdentity: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

/** Fixed deployment scope. Never user-supplied. */
const DEPLOYMENT_BARANGAY = 'Santa Ana';
const DEPLOYMENT_CITY = 'Pateros';

const ACCOUNT_COLUMNS = 'id, email, full_name, phone, role, barangay, city, is_active';

/** Roles that public self-registration may bootstrap. Never `administrator`. */
type BootstrapRole = 'worker' | 'client';

type BootstrapInput = {
  fullName: string;
  phone: string;
  role: BootstrapRole;
  email: string;
};

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isAccountRole(value: unknown): value is AccountRole {
  return value === 'worker' || value === 'client' || value === 'administrator';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate a raw database row against the application contract. */
function validateAccountRow(row: unknown, expectedUserId: string): AccountRecord | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (r.id !== expectedUserId) return null;
  if (!isNonEmptyString(r.email)) return null;
  if (!isNonEmptyString(r.full_name)) return null;
  if (!isNonEmptyString(r.phone)) return null;
  if (!isAccountRole(r.role)) return null;
  if (!isNonEmptyString(r.barangay)) return null;
  if (!isNonEmptyString(r.city)) return null;
  if (typeof r.is_active !== 'boolean') return null;
  return {
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    phone: r.phone,
    role: r.role,
    barangay: r.barangay,
    city: r.city,
    is_active: r.is_active,
  };
}

/**
 * Strictly validate untrusted signup metadata as bootstrap input. Returns
 * null on any deviation; nothing is defaulted or coerced.
 */
function validateBootstrapInput(
  metadata: unknown,
  sessionEmail: string | undefined
): BootstrapInput | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const m = metadata as Record<string, unknown>;

  const rawFullName = m.registration_full_name;
  const rawPhone = m.registration_phone;
  const rawRole = m.registration_role_intent;

  if (!isNonEmptyString(rawFullName)) return null;
  if (!isNonEmptyString(rawPhone)) return null;
  if (rawRole !== 'worker' && rawRole !== 'client') return null;
  if (!isNonEmptyString(sessionEmail)) return null;

  return {
    fullName: rawFullName.trim(),
    phone: rawPhone.trim(),
    role: rawRole,
    email: sessionEmail,
  };
}

type SelectOutcome =
  | { kind: 'row'; row: unknown }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

async function selectOwnAccountRow(userId: string): Promise<SelectOutcome> {
  const { data, error } = await supabase
    .from('users')
    .select(ACCOUNT_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) return { kind: 'error', message: error.message };
  if (data === null) return { kind: 'missing' };
  return { kind: 'row', row: data };
}

type BootstrapResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; error: AccountBootstrapError };

function fail(code: AccountBootstrapErrorCode, message: string): BootstrapResult {
  return { ok: false, error: { code, message } };
}

function resolveFromRow(row: unknown, userId: string): BootstrapResult {
  const account = validateAccountRow(row, userId);
  if (!account) {
    return fail(
      'authoritative_account_invalid',
      'Your account record could not be validated.'
    );
  }
  return { ok: true, account };
}

/**
 * One bootstrap attempt for the given authenticated user. Performs at most
 * ONE INSERT. Never updates or upserts.
 */
async function bootstrapAccount(
  userId: string,
  userEmail: string | undefined,
  userMetadata: unknown,
  authPhone: string | undefined,
  phoneConfirmedAt: string | undefined,
  isCurrent: () => boolean
): Promise<BootstrapResult> {
  // 1. Authoritative own-row SELECT.
  const first = await selectOwnAccountRow(userId);
  if (!isCurrent()) return fail('account_fetch_failed', 'Account validation was superseded.');
  if (first.kind === 'error') {
    return fail('account_fetch_failed', 'Could not load your account. Please try again.');
  }
  if (first.kind === 'row') {
    // Existing row wins. Metadata is not consulted.
    return resolveFromRow(first.row, userId);
  }

  // 2. Row genuinely missing → validate untrusted bootstrap input.
  const input = validateBootstrapInput(userMetadata, userEmail);
  if (!input) {
    return fail(
      'bootstrap_input_invalid',
      'Your registration details are incomplete or invalid, so your account could not be set up.'
    );
  }

  if (isPhoneVerificationRequiredForBootstrap({
    registrationPhone: input.phone,
    authPhone,
    phoneConfirmedAt,
  })) {
    return fail(
      'phone_verification_required',
      'Verify your phone number before account setup can continue.'
    );
  }

  // 3. Single INSERT through RLS / guard trigger / constraints.
  //    Protected columns (is_active, created_at) are left to the database.
  const { error: insertError } = await supabase.from('users').insert({
    id: userId,
    email: input.email,
    full_name: input.fullName,
    phone: input.phone,
    role: input.role,
    barangay: DEPLOYMENT_BARANGAY,
    city: DEPLOYMENT_CITY,
  });
  if (!isCurrent()) return fail('account_fetch_failed', 'Account validation was superseded.');

  if (insertError && insertError.code !== POSTGRES_UNIQUE_VIOLATION) {
    return fail('account_insert_failed', 'Could not set up your account. Please try again.');
  }
  // insertError with unique violation = concurrent bootstrap already created
  // the row; fall through to the single authoritative re-read.

  // 4. Mandatory RE-SELECT. The inserted payload is never trusted.
  const second = await selectOwnAccountRow(userId);
  if (second.kind === 'error') {
    return fail('account_fetch_failed', 'Could not load your account. Please try again.');
  }
  if (second.kind === 'missing') {
    return fail(
      'account_insert_failed',
      'Your account could not be confirmed after setup. Please try again.'
    );
  }
  return resolveFromRow(second.row, userId);
}

/**
 * Read the authoritative verification flag first. Grandfathered verified
 * Workers do not need a modern document. Neither read writes a profile.
 */
async function loadWorkerIdentityGate(userId: string): Promise<{
  identitySubmission: WorkerIdentitySubmission | null;
  workerIsVerified: boolean;
  workerOnboardingState: WorkerOnboardingState;
}> {
  return loadWorkerOnboarding(async () => {
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('is_verified')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || (data !== null && typeof data.is_verified !== 'boolean' && data.is_verified !== null)) {
      throw new Error('Worker verification could not be loaded.');
    }
    return data?.is_verified ?? null;
  }, getMyIdentitySubmission);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const sessionState = useSession();
  const { session, isSessionLoading, sessionError, sessionRevision = 0, isSessionRevisionCurrent } = sessionState;

  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [status, setStatus] = useState<AccountStatus>('idle');
  const [accountError, setAccountError] = useState<AccountBootstrapError | null>(null);
  const [consent, setConsent] = useState<UserConsent | null>(null);
  const [identitySubmission, setIdentitySubmission] = useState<WorkerIdentitySubmission | null>(
    null
  );
  const [workerIsVerified, setWorkerIsVerified] = useState(false);
  const [workerOnboardingState, setWorkerOnboardingState] = useState<WorkerOnboardingState>('loading');
  const [retryToken, setRetryToken] = useState(0);
  const identityGeneration = useRef(0);
  const [clientDraftTermination] = useState(() => {
    let epoch = 0;
    const listeners = new Set<() => void>();
    return {
      snapshot: () => epoch,
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      terminate() { epoch++; for (const listener of listeners) listener(); },
    };
  });
  const [attempt, setAttempt] = useState<{ session: typeof session; revision: number; retry: number } | null>(null);
  const [currentKey] = useState(() => {
    let activeSession = session, activeRevision = sessionRevision, activeRetry = retryToken;
    return {
      observe(nextSession: typeof session, nextRevision: number, nextRetry: number) {
        activeSession = nextSession; activeRevision = nextRevision; activeRetry = nextRetry;
      },
      matches(nextSession: typeof session, nextRevision: number, nextRetry: number) {
        return activeSession === nextSession && activeRevision === nextRevision && activeRetry === nextRetry;
      },
    };
  });
  useLayoutEffect(() => { currentKey.observe(session, sessionRevision, retryToken); }, [currentKey, session, sessionRevision, retryToken]);
  const isCurrentRevision = () => currentKey.matches(session, sessionRevision, retryToken) && (isSessionRevisionCurrent?.(sessionRevision) ?? true);
  const usable = !isSessionLoading && !sessionError && session !== null;
  const isAttemptCurrent = usable && attempt?.session === session && attempt.revision === sessionRevision && attempt.retry === retryToken && isCurrentRevision();
  const exposedStatus = isAttemptCurrent ? status : usable ? 'pending' : 'idle';
  const exposedAccount = isAttemptCurrent ? account : null;

  const userId = session?.user.id;
  const userEmail = session?.user.email;
  const userMetadata = session?.user.user_metadata;

  /* eslint-disable react-hooks/set-state-in-effect -- session bootstrap clears stale account state before asynchronous reads */
  useEffect(() => {
    identityGeneration.current += 1;
    // Session not usable → idle. Not an account error.
    if (isSessionLoading || sessionError || !session || !userId) {
      setAccount(null);
      setAccountError(null);
      setConsent(null);
      setIdentitySubmission(null);
      setWorkerIsVerified(false);
      setWorkerOnboardingState('loading');
      setStatus('idle');
      return;
    }

    // Stale-result guard: any session/user/retry change invalidates this run.
    let cancelled = false;
    const current = () => !cancelled && isCurrentRevision();
    setAttempt({ session, revision: sessionRevision, retry: retryToken });

    setAccount(null);
    setAccountError(null);
    setConsent(null);
    setIdentitySubmission(null);
    setWorkerIsVerified(false);
    setWorkerOnboardingState('loading');
    setStatus('pending');

    bootstrapAccount(
      userId,
      userEmail,
      userMetadata,
      session.user.phone,
      session.user.phone_confirmed_at,
      current
    )
      .then(async (result) => {
        if (!current()) return;
        if (result.ok) {
          // A validated terminal result is irreversible for private Client state,
          // even if a later consent/Worker stage fails or this run is superseded.
          if (result.account.role !== 'client' || result.account.is_active !== true) clientDraftTermination.terminate();
          let consentRow: UserConsent | null = null;
          let nextIdentity: WorkerIdentitySubmission | null = null;
          let nextVerified = false;
          let nextWorkerState: WorkerOnboardingState = 'loading';

          // Administrators skip consent and identity. Self-registered
          // Worker/Client load consent (fail closed) without changing
          // account status if that load fails.
          if (result.account.role !== 'administrator') {
            try {
              consentRow = await getMyConsent();
            } catch {
              consentRow = null;
            }
            if (!current()) return;
            if (!isCurrentLegalConsent(consentRow)) clientDraftTermination.terminate();
            if (result.account.role === 'worker' && isCurrentLegalConsent(consentRow)) {
              const identity = await loadWorkerIdentityGate(result.account.id);
              nextIdentity = identity.identitySubmission;
              nextVerified = identity.workerIsVerified;
              nextWorkerState = identity.workerOnboardingState;
            }
          }

          if (!current()) return;
          setAccount(result.account);
          setConsent(consentRow);
          setIdentitySubmission(nextIdentity);
          setWorkerIsVerified(nextVerified);
          setWorkerOnboardingState(nextWorkerState);
          setAccountError(null);
          setStatus('resolved');
        } else {
          if (result.error.code !== 'account_fetch_failed') clientDraftTermination.terminate();
          setAccount(null);
          setConsent(null);
          setIdentitySubmission(null);
          setWorkerIsVerified(false);
          setWorkerOnboardingState('loading');
          setAccountError(result.error);
          setStatus('error');
        }
      })
      .catch(() => {
        if (!current()) return;
        setAccount(null);
        setConsent(null);
        setIdentitySubmission(null);
        setWorkerIsVerified(false);
        setWorkerOnboardingState('loading');
        setAccountError({
          code: 'account_fetch_failed',
          message: 'Could not load your account. Please try again.',
        });
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // userEmail/userMetadata derive from the same session object as userId;
    // the run keys on identity + retry so an in-flight run for an older
    // user or attempt is discarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionLoading, sessionError, session, sessionRevision, userId, retryToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const retryAccountBootstrap = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  const refreshConsent = useCallback(async () => {
    if (!isCurrentRevision() || exposedStatus !== 'resolved' || !account || account.role === 'administrator') {
      return;
    }
    const generation = account.role === 'worker' ? ++identityGeneration.current : null;
    try {
      const row = await getMyConsent();
      if (!isCurrentRevision()) return;
      if (generation !== null && generation !== identityGeneration.current) return;
      if (!isCurrentLegalConsent(row)) clientDraftTermination.terminate();
      if (account.role === 'worker' && isCurrentLegalConsent(row)) {
        const identity = await loadWorkerIdentityGate(account.id);
        if (!isCurrentRevision()) return;
        if (generation !== identityGeneration.current) return;
        setIdentitySubmission(identity.identitySubmission);
        setWorkerIsVerified(identity.workerIsVerified);
        setWorkerOnboardingState(identity.workerOnboardingState);
      }
      setConsent(row);
    } catch {
      if (!isCurrentRevision()) return;
      if (generation !== null && generation !== identityGeneration.current) return;
      clientDraftTermination.terminate();
      setConsent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, exposedStatus, session, sessionRevision, retryToken]);

  const refreshIdentity = useCallback(async () => {
    if (!isCurrentRevision() || exposedStatus !== 'resolved' || !account || account.role !== 'worker') {
      return;
    }
    const generation = ++identityGeneration.current;
    setWorkerOnboardingState('loading');
    const identity = await loadWorkerIdentityGate(account.id);
    if (!isCurrentRevision()) return;
    if (generation !== identityGeneration.current) return;
    setIdentitySubmission(identity.identitySubmission);
    setWorkerIsVerified(identity.workerIsVerified);
    setWorkerOnboardingState(identity.workerOnboardingState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, exposedStatus, session, sessionRevision, retryToken]);

  const accountValue: AccountContextValue = {
        clientDraftTermination,
        account: exposedAccount,
        status: exposedStatus,
        isAccountLoading: exposedStatus === 'pending',
        accountError: isAttemptCurrent ? accountError : null,
        retryAccountBootstrap,
        consent: isAttemptCurrent ? consent : null,
        hasCurrentConsent: isAttemptCurrent && isCurrentLegalConsent(consent),
        refreshConsent,
        identitySubmission: isAttemptCurrent ? identitySubmission : null,
        hasIdentitySubmission: isAttemptCurrent && identitySubmission !== null,
        workerIsVerified: isAttemptCurrent && workerIsVerified,
        workerOnboardingState: isAttemptCurrent ? workerOnboardingState : 'loading',
        refreshIdentity,
      };
  return (
    <AccountContext.Provider value={accountValue}>
      <ClientPostJobDraftMemoryProvider session={sessionState} account={accountValue}>
        {children}
      </ClientPostJobDraftMemoryProvider>
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (value === undefined) {
    throw new Error('useAccount must be used within an AccountProvider.');
  }
  return value;
}
