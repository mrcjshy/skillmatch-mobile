import { JobPhotoError, listJobPhotos, type SignedJobPhoto } from './job-photos';
import { supabase } from './supabase';

/**
 * PHO-01 (owner, 2026-11-06): a Worker who matches an open Job sees its photos before accepting it.
 * The photo folder is named by the Job's Client id, which an open Job shows to signed-in accounts.
 * Storage signs a photo only while the server finds that this Worker matches the open Job; a slot it
 * refuses, or that holds no photo, is left out exactly as for any other Job photo read.
 */
export async function loadOpportunityJobPhotos(jobId: string, isOperationCurrent?: () => boolean): Promise<SignedJobPhoto[]> {
  const { data, error } = await supabase.from('job_postings').select('client_id').eq('id', jobId).maybeSingle();
  if (error) throw new JobPhotoError('job photos could not be loaded', 'job_read_failed');
  const clientId = (data as { client_id?: unknown } | null)?.client_id;
  if (typeof clientId !== 'string') return [];
  return listJobPhotos({ clientId, jobId, isOperationCurrent });
}
