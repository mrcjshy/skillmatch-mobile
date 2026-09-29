import { expect, it, vi } from 'vitest';
import { getMyOpportunityLocation, createOpportunityLocationAccess } from './opportunity-location';
import { supabase } from './supabase';
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

it('reads only the authorized exact projection', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: { latitude: 14.546, longitude: 121.071, address: 'Pin street', barangay: 'Santa Ana', city: 'Pateros' }, error: null } as never);
  expect(await getMyOpportunityLocation('job')).toEqual({ pin: { latitude: 14.546, longitude: 121.071 }, address: 'Pin street', barangay: 'Santa Ana', city: 'Pateros' });
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_opportunity_location', { p_job_id: 'job' });
});

it('clears exact state at the start of revalidation', async () => {
  const states: unknown[] = [];
  const readLocation = vi.fn().mockResolvedValue({ pin: { latitude: 14.546, longitude: 121.071 }, address: 'Pin street' });
  const access = createOpportunityLocationAccess({
    jobId: 'job', readOpportunities: async () => [{ job_id: 'job' }] as never,
    readLocation, onState: (state) => states.push(state),
  });
  await access.refresh();
  const pending = access.refresh();
  expect(states.at(-1)).toEqual({ status: 'loading', opportunity: null, location: null });
  await pending;
});

it('maps SQL NULL to no exact pin or address', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
  expect(await getMyOpportunityLocation('job')).toBeNull();
});

it.each(['missing', 'null', 'error'])('clears sensitive state for %s authorization response', async (scenario) => {
  const states: unknown[] = [];
  const access = createOpportunityLocationAccess({ jobId: 'job',
    readOpportunities: vi.fn().mockResolvedValueOnce(scenario === 'missing' ? [] : [{ job_id: 'job' }]).mockResolvedValue([]),
    readLocation: async () => { if (scenario === 'error') throw new Error('denied'); return null; },
    onState: (state) => states.push(state),
  });
  await access.refresh();
  expect(states.at(-1)).toEqual({ status: scenario === 'error' ? 'error' : 'unavailable', opportunity: null, location: null });
});

it.each(['invalidate', 'cancel'] as const)('discards an in-flight exact response after %s', async (action) => {
  const states: unknown[] = [];
  let reply!: (value: never) => void;
  const access = createOpportunityLocationAccess({ jobId: 'job',
    readOpportunities: vi.fn().mockResolvedValueOnce([{ job_id: 'job' }]).mockResolvedValueOnce([{ job_id: 'job' }]).mockResolvedValue([]),
    readLocation: () => new Promise((resolve) => { reply = resolve; }),
    onState: (state) => states.push(state),
  });
  const pending = access.refresh();
  await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
  access[action]();
  reply({ pin: { latitude: 14.546, longitude: 121.071 }, address: 'Obsolete exact address' } as never);
  await pending;
  expect(states.at(-1)).toEqual({ status: 'unavailable', opportunity: null, location: null });
});

it('preserves an authoritatively rechecked legacy opportunity without releasing exact data', async () => {
  const onState = vi.fn();
  const readOpportunities = vi.fn().mockResolvedValue([{ job_id: 'job' }]);
  const access = createOpportunityLocationAccess({ jobId: 'job', readOpportunities,
    readLocation: async () => null, onState });
  await access.refresh();
  expect(readOpportunities).toHaveBeenCalledTimes(2);
  expect(onState).toHaveBeenLastCalledWith({ status: 'ready', opportunity: { job_id: 'job' }, location: null });
});

it('does not let a slower refresh restore exact data after a newer denial', async () => {
  const states: unknown[] = [];
  let reply!: (value: never) => void;
  const access = createOpportunityLocationAccess({ jobId: 'job',
    readOpportunities: vi.fn().mockResolvedValueOnce([{ job_id: 'job' }]).mockResolvedValueOnce([{ job_id: 'job' }]).mockResolvedValue([]),
    readLocation: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { reply = resolve; })).mockResolvedValueOnce(null),
    onState: (state) => states.push(state),
  });
  const old = access.refresh();
  await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
  await access.refresh();
  reply({ pin: { latitude: 14.546, longitude: 121.071 }, address: 'Old' } as never);
  await old;
  expect(states.at(-1)).toEqual({ status: 'unavailable', opportunity: null, location: null });
});
