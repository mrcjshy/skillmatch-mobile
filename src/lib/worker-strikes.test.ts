import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { loadMyStrikeCount, workerStrikeMessage } from './worker-strikes';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
vi.mock('./supabase', () => ({ supabase: { from: vi.fn(() => ({ select })) } }));

describe('Worker own no-show strikes', () => {
  it('reads only strike_count from the caller profile', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { strike_count: 2 }, error: null });
    await expect(loadMyStrikeCount('u1')).resolves.toBe(2);
    expect(supabase.from).toHaveBeenCalledWith('worker_profiles');
    expect(select).toHaveBeenCalledWith('strike_count');
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('returns null without a profile and fails closed on bad values or errors', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(loadMyStrikeCount('u1')).resolves.toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: { strike_count: 7 }, error: null });
    await expect(loadMyStrikeCount('u1')).rejects.toThrow();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(loadMyStrikeCount('u1')).rejects.toThrow();
  });

  it('explains the three-strike rule without blame-heavy copy', () => {
    expect(workerStrikeMessage(0)).toMatch(/No no-show strikes/);
    expect(workerStrikeMessage(1)).toMatch(/a no-show.*At 3 strikes/);
    expect(workerStrikeMessage(2)).toMatch(/2 no-shows/);
  });
});
