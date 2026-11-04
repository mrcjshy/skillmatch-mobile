import { MAX_STRIKES } from './admin-account-moderation';
import { supabase } from './supabase';

/**
 * The two numbers on the Worker Profile hero that the profile provider does not carry: the rating
 * average and the no-show strike count, both from the signed-in Worker's own `worker_profiles` row.
 * Read-only: both are protected columns that only trusted routines write.
 */
export type WorkerProfileStats = {
  /** Null before the first rating (`rating_avg` defaults to 0), without a profile, or unreadable. */
  ratingAvg: number | null;
  /** Null without a profile or when unreadable. */
  strikeCount: number | null;
};

/**
 * Never throws: a missing row, a read error or an out-of-range value gives null for that number,
 * and the hero shows its neutral wording instead of inventing one.
 */
export async function loadMyWorkerStats(userId: string): Promise<WorkerProfileStats> {
  if (!userId) return { ratingAvg: null, strikeCount: null };
  try {
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('rating_avg, strike_count')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return { ratingAvg: null, strikeCount: null };
    const row = data as { rating_avg?: unknown; strike_count?: unknown };
    return { ratingAvg: ratingOrNull(row.rating_avg), strikeCount: strikesOrNull(row.strike_count) };
  } catch {
    return { ratingAvg: null, strikeCount: null };
  }
}

/** The trusted rating routine stores an average of 1..5 scores, so 0 means "no ratings yet". */
function ratingOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 5 ? value : null;
}

function strikesOrNull(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_STRIKES ? (value as number) : null;
}

/** "4.5" once rated; "New" before the first rating. */
export function workerRatingLabel(ratingAvg: number | null): string {
  return ratingAvg === null ? 'New' : ratingAvg.toFixed(1);
}

/** "1 of 3", or null while the count is unknown. */
export function workerStrikesLabel(strikeCount: number | null): string | null {
  return strikeCount === null ? null : `${strikeCount} of ${MAX_STRIKES}`;
}
