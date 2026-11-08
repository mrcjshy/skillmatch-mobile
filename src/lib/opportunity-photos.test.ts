import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { loadOpportunityJobPhotos } from './opportunity-photos';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }));

const JOB = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const from = vi.mocked(supabase.from);
const bucket = vi.mocked(supabase.storage.from);

function jobRow(reply: { data: unknown; error: unknown }) {
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(reply) })) }));
  from.mockReturnValue({ select } as never);
  return select;
}

describe('PHO-01 opportunity photos (owner, 2026-11-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs the three photo slots in the Job Client folder and keeps only the ones Storage signs', async () => {
    const select = jobRow({ data: { client_id: CLIENT }, error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: `${CLIENT}/${JOB}/1`, signedUrl: 'https://signed/1', error: null },
        { path: `${CLIENT}/${JOB}/2`, signedUrl: null, error: 'Either the object does not exist or you do not have access to it' },
        { path: `${CLIENT}/${JOB}/3`, signedUrl: 'https://signed/3', error: null },
      ],
      error: null,
    });
    bucket.mockReturnValue({ createSignedUrls } as never);
    await expect(loadOpportunityJobPhotos(JOB)).resolves.toEqual([
      { slot: 1, path: `${CLIENT}/${JOB}/1`, signedUrl: 'https://signed/1' },
      { slot: 3, path: `${CLIENT}/${JOB}/3`, signedUrl: 'https://signed/3' },
    ]);
    expect(from).toHaveBeenCalledWith('job_postings');
    expect(select).toHaveBeenCalledWith('client_id');
    expect(bucket).toHaveBeenCalledWith('job-photos');
    expect(createSignedUrls).toHaveBeenCalledWith([1, 2, 3].map((slot) => `${CLIENT}/${JOB}/${slot}`), 60);
  });

  it('shows no photos once the Job can no longer be read (it was booked or closed)', async () => {
    jobRow({ data: null, error: null });
    await expect(loadOpportunityJobPhotos(JOB)).resolves.toEqual([]);
    expect(bucket).not.toHaveBeenCalled();
  });

  it('reports a failed Job read as an error instead of an empty list', async () => {
    jobRow({ data: null, error: { code: '503', message: 'down' } });
    await expect(loadOpportunityJobPhotos(JOB)).rejects.toMatchObject({ name: 'JobPhotoError' });
  });
});
