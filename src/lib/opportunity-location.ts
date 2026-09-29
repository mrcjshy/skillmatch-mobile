import { supabase } from './supabase';
import { isValidJobCoordinate, JobLocationError, type JobPin } from './job-location';
import type { JobOpportunity } from './job-opportunities';

export type OpportunityLocation = {
  pin: JobPin;
  address: string | null;
  barangay: string | null;
  city: string | null;
};
export async function getMyOpportunityLocation(jobId: string): Promise<OpportunityLocation | null> {
  const { data, error } = await supabase.rpc('get_my_opportunity_location', { p_job_id: jobId });
  if (error) throw new JobLocationError('Job location unavailable', error.code ?? null);
  if (data === null) return null;
  if (typeof data !== 'object' || Array.isArray(data) ||
      !isValidJobCoordinate(data.latitude, data.longitude)) throw new JobLocationError('Invalid location response', null);
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
  return { pin: { latitude: data.latitude, longitude: data.longitude }, address: text(data.address),
    barangay: text(data.barangay), city: text(data.city) };
}

export type OpportunityLocationState = {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  opportunity: JobOpportunity | null;
  location: OpportunityLocation | null;
};

/** Every invalidation removes the sensitive projection before starting a read. */
export function createOpportunityLocationAccess(options: {
  jobId: string;
  readOpportunities: () => Promise<JobOpportunity[]>;
  readLocation: (jobId: string) => Promise<OpportunityLocation | null>;
  onState: (state: OpportunityLocationState) => void;
}) {
  let generation = 0;
  let cancelled = false;
  const clear = (status: OpportunityLocationState['status']) => options.onState({ status, opportunity: null, location: null });
  return {
    async refresh() {
      if (cancelled) return;
      const token = ++generation;
      clear('loading');
      try {
        const rows = await options.readOpportunities();
        if (cancelled || token !== generation) return;
        const opportunity = rows.find((row) => row.job_id === options.jobId);
        if (!opportunity) { clear('unavailable'); return; }
        const location = await options.readLocation(options.jobId);
        if (cancelled || token !== generation) return;
        if (!location) {
          // NULL also covers a legacy Job without coordinates. Recheck the list
          // before preserving its existing acceptance path, with no exact data.
          const current = (await options.readOpportunities()).find((row) => row.job_id === options.jobId);
          if (cancelled || token !== generation) return;
          if (!current) { clear('unavailable'); return; }
          options.onState({ status: 'ready', opportunity: current, location: null });
          return;
        }
        options.onState({ status: 'ready', opportunity, location });
      } catch {
        if (!cancelled && token === generation) clear('error');
      }
    },
    invalidate() { generation += 1; clear('unavailable'); },
    cancel() { cancelled = true; generation += 1; clear('unavailable'); },
  };
}
