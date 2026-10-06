import { describe, expect, it, vi } from 'vitest';
import {
  WORKER_JOB_SORT_OPTIONS,
  loadJobPostedAt,
  sortByDatePosted,
  sortByJobDate,
  sortWorkerOpportunities,
} from './worker-opportunity-sort';

const { inIds } = vi.hoisted(() => ({ inIds: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => ({ select: (columns: string) => ({ in: (column: string, ids: string[]) => inIds(table, columns, column, ids) }) }) },
}));

const NOW = Date.parse('2026-10-04T00:00:00Z');
// Server (best-match) order: a, b, c, d, e, f.
const rows = [
  { job_id: 'a', scheduled_at: '2026-10-20T01:00:00Z' },
  { job_id: 'b', scheduled_at: null },
  { job_id: 'c', scheduled_at: '2026-10-05T09:00:00Z' },
  { job_id: 'd', scheduled_at: '2026-09-01T01:00:00Z' },
  { job_id: 'e', scheduled_at: '2026-10-05T09:00:00Z' },
  { job_id: 'f', scheduled_at: '2026-09-30T01:00:00Z' },
];
const ids = (list: { job_id: string }[]) => list.map((row) => row.job_id);

describe('Worker job display order (Wave 7)', () => {
  it('offers Best match, Job date and Date posted, with Best match first', () => {
    expect(WORKER_JOB_SORT_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ['match', 'Best match'], ['jobDate', 'Job date'], ['posted', 'Date posted'],
    ]);
  });

  it('Best match returns the server order unchanged, as a copy', () => {
    const sorted = sortWorkerOpportunities(rows, 'match', { now: NOW, postedAt: new Map() });
    expect(ids(sorted)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(sorted).not.toBe(rows);
  });

  it('Job date: upcoming soonest first, then passed work most recent first, then unscheduled', () => {
    expect(ids(sortByJobDate(rows, NOW))).toEqual(['c', 'e', 'a', 'f', 'd', 'b']);
  });

  it('Job date keeps the server ranking for equal times (c before e)', () => {
    const swapped = [rows[4], rows[2]];
    expect(ids(sortByJobDate(swapped, NOW))).toEqual(['e', 'c']);
  });

  it('Date posted: newest first; unknown or unparseable posting times last in server order', () => {
    const postedAt = new Map([
      ['a', '2026-09-01T00:00:00Z'],
      ['c', '2026-10-01T00:00:00Z'],
      ['d', 'not a date'],
      ['e', '2026-10-01T00:00:00Z'],
      ['f', '2026-09-15T00:00:00Z'],
    ]);
    expect(ids(sortByDatePosted(rows, postedAt))).toEqual(['c', 'e', 'f', 'a', 'b', 'd']);
  });

  it('never adds, drops or changes a row', () => {
    const frozen = rows.map((row) => Object.freeze({ ...row }));
    for (const sort of ['match', 'jobDate', 'posted'] as const) {
      const sorted = sortWorkerOpportunities(frozen, sort, { now: NOW, postedAt: new Map([['b', '2026-10-01T00:00:00Z']]) });
      expect([...sorted].sort((x, y) => x.job_id.localeCompare(y.job_id))).toEqual(frozen);
    }
  });

  it('reads only id and created_at, for the listed ids, and skips rows without a usable time', async () => {
    inIds.mockResolvedValueOnce({ data: [{ id: 'a', created_at: '2026-09-01T00:00:00Z' }, { id: 'b', created_at: null }, { id: 7 }], error: null });
    const result = await loadJobPostedAt(['a', 'b']);
    expect(inIds).toHaveBeenLastCalledWith('job_postings', 'id, created_at', 'id', ['a', 'b']);
    expect([...result]).toEqual([['a', '2026-09-01T00:00:00Z']]);
  });

  it('does not query for an empty list and surfaces a read error', async () => {
    inIds.mockClear();
    expect((await loadJobPostedAt([])).size).toBe(0);
    expect(inIds).not.toHaveBeenCalled();
    inIds.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(loadJobPostedAt(['a'])).rejects.toThrow('denied');
  });
});
