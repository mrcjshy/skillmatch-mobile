import { supabase } from './supabase';
import { getAuthorizedJobLocation, JobLocationError, postingLocationError } from './job-location';
import type { CanonicalJobLocation } from './canonical-job-location';

export async function readOpenJobLocation(jobId: string, clientId: string) {
  const checkOpen = async () => {
    const result = await supabase.from('job_postings').select('status').eq('id', jobId).eq('client_id', clientId).maybeSingle();
    if (result.error) throw new JobLocationError('Unable to verify Job location access.', result.error.code);
    if (result.data?.status !== 'open') throw new JobLocationError('This Job is no longer open for location editing.', 'SM409');
  };
  await checkOpen();
  const location = await getAuthorizedJobLocation(jobId);
  await checkOpen();
  return location;
}

export async function saveOpenJobLocation(jobId: string, location: CanonicalJobLocation): Promise<void> {
  const invalid = postingLocationError(location.address, location.pin);
  if (invalid) throw new JobLocationError(invalid, '22023');
  const result = await supabase.rpc('update_my_open_job_location', {
    p_job_id: jobId, p_address: location.address.trim(),
    p_latitude: location.pin.latitude, p_longitude: location.pin.longitude,
  });
  if (result.error) throw new JobLocationError(
    result.error.code === 'SM409' ? 'This Job is no longer open for location editing.' : 'Location save was not confirmed. Refresh to inspect the saved location before trying again.', result.error.code,
  );
}
