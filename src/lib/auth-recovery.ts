import type { Session } from '@supabase/supabase-js';

export const RECOVERY_SCHEME = 'skillmatchmobile';
export const RECOVERY_DESTINATION = 'update-password';
export const RECOVERY_REDIRECT_TO = `${RECOVERY_SCHEME}://${RECOVERY_DESTINATION}`;

export const RECOVERY_SUCCESS_COPY =
  'If an account exists for this email, password recovery instructions will be sent.';

export const RECOVERY_TECHNICAL_FAILURE_COPY =
  'Unable to send recovery instructions right now. Please try again later.';

export const RECOVERY_INVALID_LINK_COPY = 'This recovery link is invalid or expired.';

export const RECOVERY_PASSWORD_MIN_LENGTH = 6;

export type RecoveryStatus = 'idle' | 'processing' | 'ready' | 'error' | 'complete';

export type RecoveryLinkParse =
  | { kind: 'not-recovery' }
  | { kind: 'invalid' }
  | { kind: 'tokens'; accessToken: string; refreshToken: string };

/**
 * True only for the app-owned implicit recovery destination.
 * Expo Go exp:// URLs are not a recovery authorization marker.
 */
export function isSkillMatchRecoveryDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
    if (scheme !== RECOVERY_SCHEME) return false;
    return destinationMatches(parsed);
  } catch {
    return false;
  }
}

function destinationMatches(parsed: URL): boolean {
  const host = stripSlashes(parsed.hostname);
  const path = stripSlashes(parsed.pathname);
  return host === RECOVERY_DESTINATION || path === RECOVERY_DESTINATION;
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

/**
 * Collects query and fragment parameters. Implicit recovery tokens arrive in
 * the hash; some hosts also place them on the query string.
 */
export function collectUrlParams(url: string): Record<string, string> {
  const parsed = new URL(url);
  const params: Record<string, string> = {};
  const query = new URLSearchParams(parsed.search);
  query.forEach((value, key) => {
    params[key] = value;
  });
  const rawHash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const hash = new URLSearchParams(rawHash);
  hash.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export function parseRecoveryLink(url: string): RecoveryLinkParse {
  if (!isSkillMatchRecoveryDestination(url)) return { kind: 'not-recovery' };

  let params: Record<string, string>;
  try {
    params = collectUrlParams(url);
  } catch {
    return { kind: 'invalid' };
  }

  if (params.error || params.error_code || params.error_description) {
    return { kind: 'invalid' };
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) return { kind: 'invalid' };

  return { kind: 'tokens', accessToken, refreshToken };
}

export function isRecoverySurfaceActive(status: RecoveryStatus): boolean {
  return (
    status === 'processing' ||
    status === 'ready' ||
    status === 'error' ||
    status === 'complete'
  );
}

/** Minimal syntax only. Empty input is handled by the screen. */
export function hasMinimalEmailSyntax(email: string): boolean {
  const at = email.indexOf('@');
  if (at <= 0) return false;
  const domain = email.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !email.includes(' ');
}

export function isRecoveryPasswordUpdateAllowed(
  status: RecoveryStatus,
  recoveryUserId: string | null,
  session: Session | null
): boolean {
  return (
    status === 'ready' &&
    recoveryUserId !== null &&
    session !== null &&
    session.user.id === recoveryUserId
  );
}

/** Existence-sensitive Auth failures must look like a successful request. */
export function isExistenceSensitiveResetError(error: { code?: string; message?: string }): boolean {
  const code = (error.code ?? '').toLowerCase();
  const message = (error.message ?? '').toLowerCase();
  return (
    code === 'user_not_found' ||
    message.includes('user not found') ||
    message.includes('email not found') ||
    message.includes('account does not exist')
  );
}
