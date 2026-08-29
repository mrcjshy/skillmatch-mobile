import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

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
  account: AccountRecord | null;
  status: AccountStatus;
  isAccountLoading: boolean;
  accountError: AccountBootstrapError | null;
  retryAccountBootstrap: () => void;
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
  userMetadata: unknown
): Promise<BootstrapResult> {
  // 1. Authoritative own-row SELECT.
  const first = await selectOwnAccountRow(userId);
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

export function AccountProvider({ children }: { children: ReactNode }) {
  const { session, isSessionLoading, sessionError } = useSession();

  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [status, setStatus] = useState<AccountStatus>('idle');
  const [accountError, setAccountError] = useState<AccountBootstrapError | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const userId = session?.user.id;
  const userEmail = session?.user.email;
  const userMetadata = session?.user.user_metadata;

  useEffect(() => {
    // Session not usable → idle. Not an account error.
    if (isSessionLoading || sessionError || !session || !userId) {
      setAccount(null);
      setAccountError(null);
      setStatus('idle');
      return;
    }

    // Stale-result guard: any session/user/retry change invalidates this run.
    let cancelled = false;

    setAccount(null);
    setAccountError(null);
    setStatus('pending');

    bootstrapAccount(userId, userEmail, userMetadata)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setAccount(result.account);
          setAccountError(null);
          setStatus('resolved');
        } else {
          setAccount(null);
          setAccountError(result.error);
          setStatus('error');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAccount(null);
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
  }, [isSessionLoading, sessionError, session, userId, retryToken]);

  const retryAccountBootstrap = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return (
    <AccountContext.Provider
      value={{
        account,
        status,
        isAccountLoading: status === 'pending',
        accountError,
        retryAccountBootstrap,
      }}
    >
      {children}
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
