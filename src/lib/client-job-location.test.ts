import { beforeEach, expect, it, vi } from 'vitest';
import { readOpenJobLocation, saveOpenJobLocation } from './client-job-location';
import { supabase } from './supabase';
import { getAuthorizedJobLocation } from './job-location';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN as pin } from './santa-ana-service-area';
vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('./job-location', async (original) => ({ ...await original<object>(), getAuthorizedJobLocation: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('reads exact location only for an owning open Job', async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'open' }, error: null }) };
  vi.mocked(supabase.from).mockReturnValue(query as never);
  vi.mocked(getAuthorizedJobLocation).mockResolvedValue({ jobId: 'job', address: 'Derived address', pin, barangay: null, city: null });
  expect((await readOpenJobLocation('job', 'owner')).pin).toEqual(pin);
  expect(query.eq).toHaveBeenCalledWith('client_id', 'owner');
});
it('rejects a Job that is no longer open', async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'matched' }, error: null }) };
  vi.mocked(supabase.from).mockReturnValue(query as never);
  await expect(readOpenJobLocation('job', 'owner')).rejects.toThrow('no longer open');
  expect(getAuthorizedJobLocation).not.toHaveBeenCalled();
});
it('saves the confirmed pair through the existing trusted RPC, with no caller identity', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
  await saveOpenJobLocation('job', { pin, address: 'Derived address' });
  expect(supabase.rpc).toHaveBeenCalledWith('update_my_open_job_location', { p_job_id: 'job', p_address: 'Derived address', p_latitude: pin.latitude, p_longitude: pin.longitude });
});
it('surfaces authoritative lifecycle denial without retrying the mutation', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'SM409', message: 'Job no longer open' } } as never);
  await expect(saveOpenJobLocation('job', { pin, address: 'Derived address' })).rejects.toThrow('no longer open');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
