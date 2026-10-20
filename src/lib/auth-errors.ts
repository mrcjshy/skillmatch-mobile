import { isAuthRetryableFetchError } from '@supabase/supabase-js';

/** Shown when Supabase Auth cannot be reached. It says nothing about the account itself. */
export const AUTH_UNAVAILABLE_COPY =
  'SkillMatch is temporarily unable to connect. Please try again shortly.';

/** A timeout, network failure or 5xx from Auth: the request never reached a decision. */
export function isAuthUnavailable(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 500;
}
