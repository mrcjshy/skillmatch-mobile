/**
 * Wave 7 — display order for the Worker's recommended jobs.
 *
 * This only reorders rows that `public.list_my_job_opportunities()` already returned. It never
 * adds, removes or re-scores a row, so eligibility, the Skill 50 / Location 30 / Rating 20 score
 * and the server's ranking are untouched. "Best match" is the server order exactly as received;
 * the other orders are stable sorts over it, so the server's ranking still breaks every tie.
 *
 * "Date posted" needs `job_postings.created_at`, which the RPC does not return. It is read
 * separately (`loadJobPostedAt`) through the existing authenticated column grant, for the listed
 * job ids only, and is a display key, never a matching factor.
 */

import { supabase } from './supabase';

export type WorkerJobSort = 'match' | 'jobDate' | 'posted';

export const WORKER_JOB_SORT_OPTIONS: readonly { value: WorkerJobSort; label: string }[] = [
  { value: 'match', label: 'Best match' },
  { value: 'jobDate', label: 'Job date' },
  { value: 'posted', label: 'Date posted' },
];

export const WORKER_JOB_SORT_COPY = {
  label: 'Sort by',
  postedUnavailable: "Posting dates couldn't be loaded, so these jobs are in best-match order.",
} as const;

type Sortable = { job_id: string; scheduled_at: string | null };

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Rank keys: lower sorts first. Ties keep the incoming (server) order. */
function stableSort<T>(rows: readonly T[], key: (row: T) => readonly number[]): T[] {
  return rows
    .map((row, index) => ({ row, index, key: key(row) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * Job date: upcoming work first, soonest first; then work whose time has already passed, most
 * recent first; then jobs with no schedule.
 */
export function sortByJobDate<T extends Sortable>(rows: readonly T[], now: number): T[] {
  return stableSort(rows, (row) => {
    const at = time(row.scheduled_at);
    if (at === null) return [2, 0];
    return at >= now ? [0, at] : [1, -at];
  });
}

/** Date posted: newest postings first; rows without a known posting time keep server order, last. */
export function sortByDatePosted<T extends Sortable>(
  rows: readonly T[],
  postedAt: ReadonlyMap<string, string>,
): T[] {
  return stableSort(rows, (row) => {
    const at = time(postedAt.get(row.job_id));
    return at === null ? [1, 0] : [0, -at];
  });
}

export function sortWorkerOpportunities<T extends Sortable>(
  rows: readonly T[],
  sort: WorkerJobSort,
  { now, postedAt }: { now: number; postedAt: ReadonlyMap<string, string> },
): T[] {
  if (sort === 'jobDate') return sortByJobDate(rows, now);
  if (sort === 'posted') return sortByDatePosted(rows, postedAt);
  return [...rows];
}

/**
 * Posting times for the given job ids. Selects only `id, created_at`; the row policy and the column
 * grant decide what is readable, and an id that comes back without a time is simply left out.
 */
export async function loadJobPostedAt(jobIds: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (jobIds.length === 0) return result;
  const res = await supabase.from('job_postings').select('id, created_at').in('id', [...jobIds]);
  if (res.error) throw new Error(res.error.message || 'Posting dates are unavailable.');
  for (const row of (res.data ?? []) as { id?: unknown; created_at?: unknown }[]) {
    if (typeof row.id === 'string' && typeof row.created_at === 'string' && time(row.created_at) !== null) {
      result.set(row.id, row.created_at);
    }
  }
  return result;
}
