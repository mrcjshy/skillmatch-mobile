import { describe, expect, it, vi } from 'vitest';
import { createClientJobsRefreshOwner } from './client-jobs-provider';
const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: database }));
vi.mock('@/providers/account-provider', () => ({ useAccount: () => ({ account: { id: 'client-a' } }) }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe('Client jobs refresh account ownership', () => {
  it('does not revive a refresh owner after observed loss and same-account reauthorization', async () => {
    let authorized = true; const pending = deferred<[]>();
    const skills = vi.fn(async () => []), jobs = vi.fn(() => pending.promise);
    const owner = createClientJobsRefreshOwner('client-a', () => authorized, skills, jobs);
    const old = owner.refresh('client-a');
    authorized = false;
    await expect(owner.refresh('client-a')).rejects.toThrow('Client jobs owner changed.');
    authorized = true; pending.resolve([]); await old;
    expect(owner.snapshot().isLoading).toBe(true);
    await expect(owner.refresh('client-a')).rejects.toThrow('Client jobs owner changed.');
    expect(jobs).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong accounts before either existing loader reads', async () => {
    const skills = vi.fn(async () => []), jobs = vi.fn(async () => []);
    const owner = createClientJobsRefreshOwner('client-a', () => true, skills, jobs);
    await expect(owner.refresh('client-b')).rejects.toThrow('Client jobs owner changed.');
    expect(skills).not.toHaveBeenCalled(); expect(jobs).not.toHaveBeenCalled();
  });
  it('only publishes the latest owned refresh and suppresses disposed completions', async () => {
    const first = deferred<[]>(), second = deferred<[]>(); let read = 0;
    const owner = createClientJobsRefreshOwner('client-a', () => true, async () => [], () => (++read === 1 ? first.promise : second.promise));
    const old = owner.refresh('client-a'); const newer = owner.refresh('client-a');
    second.resolve([]); await newer; const snapshot = owner.snapshot(); first.resolve([]); await old;
    expect(owner.snapshot()).toBe(snapshot);
    const pending = deferred<[]>(); const disposed = createClientJobsRefreshOwner('client-a', () => true, async () => [], () => pending.promise);
    const late = disposed.refresh('client-a'); disposed.dispose(); pending.resolve([]); await late;
    expect(disposed.snapshot().jobs).toEqual([]); expect(disposed.snapshot().isLoading).toBe(true);
  });
});


describe('existing owner-filtered jobs projection', () => {
  it('selects only the approved columns and preserves strings/null normalization, ordering and skill association', async () => {
    const descriptions = ['Unicode trabaho\nsecond line', '', '   ', null, undefined, 12, {}, []];
    const rows = descriptions.map((description, index) => ({ id: 'job-' + index, title: 'Job ' + index, description, status: 'open', scheduled_at: null, budget: null, payment_method: null }));
    const select = vi.fn().mockReturnThis(), eq = vi.fn().mockReturnThis(), order = vi.fn(async () => ({ data: rows, error: null }));
    const skillSelect = vi.fn().mockReturnThis(), ids = vi.fn(async () => ({ data: [{ job_id: 'job-0', skills: { skill_name: 'Zebra' } }, { job_id: 'job-0', skills: [{ skill_name: 'Apple' }] }], error: null }));
    database.from.mockImplementation((table: string) => table === 'job_postings' ? { select, eq, order } : { select: skillSelect, in: ids });
    const owner = createClientJobsRefreshOwner('client-a', () => true, async () => []);
    await owner.loadInitial();
    expect(select).toHaveBeenCalledExactlyOnceWith('id, title, description, status, scheduled_at, budget, payment_method');
    expect(eq).toHaveBeenCalledExactlyOnceWith('client_id', 'client-a');
    expect(order).toHaveBeenCalledExactlyOnceWith('created_at', { ascending: false });
    expect(database.from.mock.calls.map(call => call[0])).toEqual(['job_postings', 'job_skills']);
    expect(skillSelect).toHaveBeenCalledExactlyOnceWith('job_id, skills(skill_name)');
    expect(ids).toHaveBeenCalledExactlyOnceWith('job_id', rows.map(row => row.id));
    expect(owner.snapshot().jobs.map(job => job.id)).toEqual(rows.map(row => row.id));
    expect(owner.snapshot().jobs.map(job => job.description)).toEqual([descriptions[0], '', '   ', null, null, null, null, null]);
    expect(owner.snapshot().jobs[0].skills).toEqual(['Apple', 'Zebra']);
  });
  it('a latest ordinary retry clears the initial failure and loading state', async () => {
    const jobs = vi.fn().mockRejectedValueOnce(new Error('Initial failure')).mockResolvedValueOnce([]);
    const owner = createClientJobsRefreshOwner('client-a', () => true, async () => [], jobs);
    await expect(owner.loadInitial()).rejects.toThrow('Initial failure');
    expect(owner.snapshot().loadError).toBe('Initial failure');
    await owner.refresh('client-a');
    expect(owner.snapshot()).toEqual({ isLoading: false, loadError: null, skills: [], jobs: [] });
  });
  it('latest refresh supersedes pending initial work and late initial failure cannot replace its success', async () => {
    let reject!: (reason: Error) => void;
    const initial = new Promise<[]>( (_, fail) => { reject = fail; });
    const jobs = vi.fn().mockReturnValueOnce(initial).mockResolvedValueOnce([]);
    const owner = createClientJobsRefreshOwner('client-a', () => true, async () => [], jobs);
    const old = owner.loadInitial().catch(() => {});
    await owner.refresh('client-a'); const snapshot = owner.snapshot();
    expect(snapshot.isLoading).toBe(false); expect(snapshot.loadError).toBeNull();
    reject(new Error('Old failure')); await old; expect(owner.snapshot()).toBe(snapshot);
  });
  it('ordinary failure preserves resolved rows and does not become an initial error', async () => {
    const jobs = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Refresh failure'));
    const owner = createClientJobsRefreshOwner('client-a', () => true, async () => [], jobs);
    await owner.loadInitial(); const resolved = owner.snapshot();
    await expect(owner.refresh('client-a')).rejects.toThrow('Refresh failure');
    expect(owner.snapshot()).toBe(resolved);
  });
});
