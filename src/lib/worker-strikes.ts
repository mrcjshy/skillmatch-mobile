import { MAX_STRIKES } from './admin-account-moderation';
import { supabase } from './supabase';

/**
 * The signed-in Worker's own no-show strike count (FT-05). Read-only: `strike_count` is a protected
 * column that only the Administrator strike action and MOD-01 reinstatement change. Returns null when
 * the Worker has no profile yet.
 */
export async function loadMyStrikeCount(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select('strike_count')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw Error('Unable to load your strikes.');
  if (data === null) return null;
  const value = (data as { strike_count?: unknown }).strike_count;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_STRIKES) {
    throw Error('Unable to load your strikes.');
  }
  return value as number;
}

/** What the Worker reads under their strike count. */
export function workerStrikeMessage(count: number): string {
  if (count === 0) return 'No no-show strikes. Keep showing up for confirmed bookings.';
  const left = MAX_STRIKES - count;
  return left > 0
    ? `An Administrator recorded ${count === 1 ? 'a no-show' : `${count} no-shows`}. At ${MAX_STRIKES} strikes your account is suspended until an Administrator reinstates it.`
    : 'Your account reached the strike limit.';
}
