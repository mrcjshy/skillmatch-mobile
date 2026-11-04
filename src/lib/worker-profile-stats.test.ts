import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { loadMyWorkerStats, workerRatingLabel, workerStrikesLabel } from './worker-profile-stats';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
vi.mock('./supabase', () => ({ supabase: { from: vi.fn(() => ({ select })) } }));

describe('Worker Profile hero stats', () => {
  it('reads only rating_avg and strike_count from the caller profile', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { rating_avg: 4.5, strike_count: 1 }, error: null });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual({ ratingAvg: 4.5, strikeCount: 1 });
    expect(supabase.from).toHaveBeenCalledWith('worker_profiles');
    expect(select).toHaveBeenCalledWith('rating_avg, strike_count');
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('treats the default 0 rating as no rating yet and keeps a zero strike count', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { rating_avg: 0, strike_count: 0 }, error: null });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual({ ratingAvg: null, strikeCount: 0 });
  });

  it('never throws: no profile, read errors, transport failures and bad values all give null', async () => {
    const unknown = { ratingAvg: null, strikeCount: null };
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual(unknown);
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual(unknown);
    maybeSingle.mockRejectedValueOnce(new Error('offline'));
    await expect(loadMyWorkerStats('u1')).resolves.toEqual(unknown);
    maybeSingle.mockResolvedValueOnce({ data: { rating_avg: '4.5', strike_count: 7 }, error: null });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual(unknown);
    maybeSingle.mockResolvedValueOnce({ data: { rating_avg: 6, strike_count: 1.5 }, error: null });
    await expect(loadMyWorkerStats('u1')).resolves.toEqual(unknown);
    const calls = maybeSingle.mock.calls.length;
    await expect(loadMyWorkerStats('')).resolves.toEqual(unknown);
    expect(maybeSingle.mock.calls.length).toBe(calls);
  });

  it('words the numbers for the hero', () => {
    expect(workerRatingLabel(null)).toBe('New');
    expect(workerRatingLabel(4.5)).toBe('4.5');
    expect(workerRatingLabel(4)).toBe('4.0');
    expect(workerRatingLabel(4.666)).toBe('4.7');
    expect(workerStrikesLabel(0)).toBe('0 of 3');
    expect(workerStrikesLabel(2)).toBe('2 of 3');
    expect(workerStrikesLabel(null)).toBeNull();
  });
});
