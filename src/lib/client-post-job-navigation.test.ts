import { describe, expect, it, vi } from 'vitest';
import { openPostedJobMap, postingRecoveryNotice } from './client-post-job-navigation';

const JOB = '22222222-2222-4222-8222-222222222222';
describe('confirmed posting receipt to map tracking', () => {
  it('keeps upload and refresh recovery notices while ordinary success is represented by the map', () => {
    expect(postingRecoveryNotice({ postSuccess: 'Job posted. Waiting for a worker to accept.', postError: null })).toBeUndefined();
    expect(postingRecoveryNotice({ postSuccess: 'Job posted, but the photos could not be uploaded.', postError: 'The job list could not be refreshed.' }))
      .toBe('Job posted, but the photos could not be uploaded. The job list could not be refreshed.');
    expect(postingRecoveryNotice({ postSuccess: 'Job posted. Photo upload completion is unknown.', postError: null })).toContain('unknown');
  });
  it('consumes one confirmed Job ID and opens its tracking route directly', () => {
    let receipt: string | null = JOB;
    const take = vi.fn(() => { const id = receipt; receipt = null; return id; });
    const navigate = vi.fn();
    const input = { isCurrent: () => true, takePendingCreatedJob: take, navigate };
    expect(openPostedJobMap(input)).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(JOB);
    expect(openPostedJobMap(input)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('retains the receipt when blurred, backgrounded, posting, or unauthorized', () => {
    const take = vi.fn(() => JOB), navigate = vi.fn();
    expect(openPostedJobMap({ isCurrent: () => false, takePendingCreatedJob: take, navigate })).toBe(false);
    expect(take).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it.each([null, '', 'not-an-id'])('never navigates an absent or malformed receipt %s', receipt => {
    const navigate = vi.fn();
    expect(openPostedJobMap({ isCurrent: () => true, takePendingCreatedJob: () => receipt, navigate })).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
