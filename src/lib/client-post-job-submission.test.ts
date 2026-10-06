import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '../providers/client-post-job-draft-provider';
import { submitClientPostJob } from './client-post-job-submission';
import { supabase } from './supabase';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN } from './santa-ana-service-area';
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn(), storage: { from: vi.fn() } } }));
const CLIENT = '11111111-1111-4111-8111-111111111111', JOB = '22222222-2222-4222-8222-222222222222';
const skills = [{ id: 'primary', skill_name: 'Plumbing' }, { id: 'extra', skill_name: 'Electrical' }];
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function owner(authorized = () => true, retained?: () => boolean) {
  const value = createClientPostJobDraftOwner(CLIENT, undefined, authorized, retained);
  value.updateDraft({ wizardStep: 4, description: ' Repair sink ', address: ' Confirmed address ',
    pin: SANTA_ANA_PATEROS_INTERIOR_TEST_PIN, scheduleDate: new Date(2099, 0, 2), scheduleTime: new Date(2099, 0, 2, 12, 15),
    budgetText: '500', paymentMethod: 'cod', primarySkillId: 'primary', additionalSkillIds: ['extra', 'primary', 'extra', 'unknown'],
    jobPhotos: [{ uri: 'file:///one', assetId: null, fileName: null, fileSize: null, pickerMimeType: null }] });
  return value;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(supabase.rpc).mockResolvedValue({ data: JOB, error: null } as never);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255, 0]).buffer })));
});
it('records late dispatched create during suspension without uploads/refresh and reconciles once after revalidation', async () => {
  const request = deferred<any>(); let authorized = true;
  vi.mocked(supabase.rpc).mockReturnValue(request.promise as never);
  const value = owner(() => authorized, () => true), refresh = vi.fn(); const api = storage();
  const posting = submitClientPostJob({ owner: value, skills, refresh });
  authorized = false; expect(value.isOwnerCurrent()).toBe(false);
  request.resolve({ data: JOB, error: null }); await posting;
  expect(api.list).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  expect(value.takePendingCreatedJob()).toBeNull(); expect(value.draft.postSuccess).toBeNull();
  authorized = true; await submitClientPostJob({ owner: value, skills, refresh });
  expect(supabase.rpc).toHaveBeenCalledTimes(1); expect(api.upload).not.toHaveBeenCalled();
  expect(value.draft.postSuccess).toContain('completion is unknown'); expect(value.takePendingCreatedJob()).toBe(JOB); expect(value.takePendingCreatedJob()).toBeNull();
});
it('holds unresolved create through revalidation and discards its receipt after termination', async () => {
  const request = deferred<any>(); let authorized = true, retained = true;
  vi.mocked(supabase.rpc).mockReturnValue(request.promise as never);
  const value = owner(() => authorized, () => retained), refresh = vi.fn(); const api = storage();
  const posting = submitClientPostJob({ owner: value, skills, refresh });
  authorized = false; expect(value.isOwnerCurrent()).toBe(false); authorized = true;
  await submitClientPostJob({ owner: value, skills, refresh }); expect(supabase.rpc).toHaveBeenCalledTimes(1);
  retained = false; request.resolve({ data: JOB, error: null }); await posting;
  expect(value.takePendingCreatedJob()).toBeNull(); expect(api.upload).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});
it('does not equate an unknown transport outcome with no created job or permit a duplicate retry', async () => {
  vi.mocked(supabase.rpc).mockRejectedValue(new Error('Synthetic transport disconnect'));
  const value = owner(), refresh = vi.fn(); storage();
  await submitClientPostJob({ owner: value, skills, refresh });
  expect(value.draft.postError).toContain('could not be confirmed'); expect(value.draft.postError).not.toContain('No job was created');
  await submitClientPostJob({ owner: value, skills, refresh }); expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it.each([{ data: null, error: null }, { data: null, error: { code: 'PGRST000', message: 'Unknown transport outcome' } }])('blocks retry for an unconfirmed RPC outcome %#', async response => {
  vi.mocked(supabase.rpc).mockResolvedValue(response as never); const value = owner(); storage();
  await submitClientPostJob({ owner: value, skills, refresh: vi.fn() });
  expect(value.draft.postError).toContain('could not be confirmed'); expect(value.draft.postError).not.toContain('No job was created');
  await submitClientPostJob({ owner: value, skills, refresh: vi.fn() }); expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('uses real orchestration and Storage helper to suppress upload, refresh and settlement after pending-list invalidation', async () => {
  const listing = deferred<any>(), started = deferred<void>(); let authorized = true;
  const old = owner(() => authorized); const refresh = vi.fn(async () => {}), upload = vi.fn(async () => ({ data: {}, error: null }));
  const list = vi.fn(() => { started.resolve(); return listing.promise; });
  vi.mocked(supabase.storage.from).mockReturnValue({ list, upload } as never);
  const posting = submitClientPostJob({ owner: old, skills, refresh });
  await started.promise; authorized = false; expect(old.isOwnerCurrent()).toBe(false);
  const successor = owner(); const newer = successor.beginPost()!;
  authorized = true; // Same account identity does not revive the old authorized lifetime.
  listing.resolve({ data: [], error: null }); await posting;
  expect(upload).not.toHaveBeenCalled(); expect(list).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
  expect(old.draft.postSuccess).toBeNull(); expect(old.takePendingCreatedJob()).toBeNull();
  expect(successor.draft.description).toBe(' Repair sink '); expect(successor.draft.postError).toBeNull();
  expect(successor.takePendingCreatedJob()).toBeNull(); expect(successor.isOperationCurrent(newer)).toBe(true);
  expect(successor.isPosting).toBe(true); expect(supabase.rpc).toHaveBeenCalledTimes(1);
});

function storage(input: { list?: ReturnType<typeof vi.fn>; upload?: ReturnType<typeof vi.fn> } = {}) {
  const list = input.list ?? vi.fn(async () => ({ data: [], error: null }));
  const upload = input.upload ?? vi.fn(async () => ({ data: {}, error: null }));
  vi.mocked(supabase.storage.from).mockReturnValue({ list, upload } as never); return { list, upload };
}
it('captures primary-first deduplicated payload, rejects same-tick duplicate, resets and publishes exactly one created ID', async () => {
  const api = storage(); const value = owner(); const refresh = vi.fn(async () => {});
  const one = submitClientPostJob({ owner: value, skills, refresh });
  const two = submitClientPostJob({ owner: value, skills, refresh }); await Promise.all([one, two]);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(supabase.rpc).toHaveBeenCalledWith('create_my_job_with_location', {
    p_title: 'Plumbing', p_description: 'Repair sink', p_address: 'Confirmed address',
    p_scheduled_at: new Date(2099, 0, 2, 12, 15).toISOString(), p_budget: 500, p_payment_method: 'cod',
    p_skill_ids: ['primary', 'extra'], p_latitude: 14.5444514, p_longitude: 121.07205067,
  });
  expect(api.upload).toHaveBeenCalledWith(CLIENT + '/' + JOB + '/1', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
  expect(refresh).toHaveBeenCalledWith(CLIENT); expect(value.isPosting).toBe(false);
  expect(value.draft).toMatchObject({ wizardStep: 1, description: '', jobPhotos: [], photoError: null,
    postSuccess: 'Job posted. 1 of 1 photos uploaded. Waiting for a worker to accept.', postError: null });
  expect(value.takePendingCreatedJob()).toBe(JOB); expect(value.takePendingCreatedJob()).toBeNull();
});
it.each([1, 2, 3] as const)('creates nothing before final step %s', async wizardStep => {
  const value = owner(); value.updateDraft({ wizardStep }); const api = storage();
  await submitClientPostJob({ owner: value, skills, refresh: vi.fn() });
  expect(supabase.rpc).not.toHaveBeenCalled(); expect(api.list).not.toHaveBeenCalled(); expect(value.isPosting).toBe(false);
});
it.each([
  [{ description: '', address: '', scheduleDate: null, budgetText: 'bad', paymentMethod: null, primarySkillId: null }, 'Please describe the work needed.'],
  [{ address: '', scheduleDate: null, budgetText: 'bad' }, 'Please confirm your selected job location.'],
  [{ scheduleDate: null, budgetText: 'bad' }, 'Please choose a date.'],
  [{ budgetText: 'bad', paymentMethod: null, primarySkillId: null }, 'Budget must be a number of 0 or more.'],
  [{ paymentMethod: null, primarySkillId: null }, 'Please select a payment method.'],
  [{ primarySkillId: null }, 'Please select a primary skill.'],
] as const)('retains final validation order and draft for %s', async (patch, message) => {
  const value = owner(); value.updateDraft(patch as any); storage();
  await submitClientPostJob({ owner: value, skills, refresh: vi.fn() });
  expect(value.draft.postError).toBe(message); expect(value.draft.wizardStep).toBe(4); expect(value.isPosting).toBe(false);
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('preserves every create-failure draft value and permits deliberate retry after no creation', async () => {
  const value = owner(); const before = value.draft; const refresh = vi.fn(); storage();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'secret' } } as never);
  await submitClientPostJob({ owner: value, skills, refresh });
  expect(value.draft).toMatchObject({ ...before, postError: "You don't have permission to post a job. No job was created." });
  expect(refresh).not.toHaveBeenCalled(); expect(value.takePendingCreatedJob()).toBeNull();
  expect(value.beginPost()).not.toBeNull();
});
it.each(['none-selected', 'none-readable', 'partial', 'reconciled', 'upload-error', 'refresh-error'] as const)('settles %s on the same created job and resets to step one', async outcome => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const value = owner(); const photo = value.draft.jobPhotos[0];
  if (outcome === 'none-selected') value.updateDraft({ jobPhotos: [] });
  if (outcome === 'partial') value.updateDraft({ jobPhotos: [photo, { ...photo, uri: 'file:///bad' }, { ...photo, uri: 'file:///third' }] });
  if (outcome === 'none-readable') vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  if (outcome === 'partial') vi.stubGlobal('fetch', vi.fn(async (uri: string) => ({ ok: uri !== 'file:///bad', arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer })));
  const list = outcome === 'reconciled' ? vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ name: '1' }], error: null }) : undefined;
  const upload = ['reconciled', 'upload-error'].includes(outcome) ? vi.fn(async () => ({ data: null, error: { status: 503 } })) : undefined;
  const api = storage({ list, upload });
  const refresh = vi.fn(async () => { if (outcome === 'refresh-error') throw Error('private error'); });
  await submitClientPostJob({ owner: value, skills, refresh });
  expect(supabase.rpc).toHaveBeenCalledTimes(1); expect(value.draft.wizardStep).toBe(1); expect(value.draft.jobPhotos).toEqual([]);
  expect(value.takePendingCreatedJob()).toBe(JOB); expect(value.isPosting).toBe(false);
  if (outcome === 'partial') { expect(api.upload.mock.calls.map(call => call[0])).toEqual([CLIENT + '/' + JOB + '/1', CLIENT + '/' + JOB + '/3']); expect(value.draft.postSuccess).toBe('Job posted. 2 of 3 photos uploaded; 1 photo could not be uploaded.'); }
  if (outcome === 'none-selected') expect(value.draft.postSuccess).toBe('Job posted. Waiting for a worker to accept.');
  if (outcome === 'none-readable' || outcome === 'upload-error') expect(value.draft.postSuccess).toBe('Job posted, but the photos could not be uploaded.');
  if (outcome === 'reconciled') expect(value.draft.postSuccess).toContain('1 of 1 photos uploaded');
  if (outcome === 'refresh-error') expect(value.draft.postError).toBe('Job posted, but the job list could not be refreshed. Check My Posted Jobs.');
});
it.each(['create', 'photo-read', 'refresh'] as const)('suppresses stale completion during %s without successor errors or handoff', async boundary => {
  let current = true; const value = owner(() => current); const pending = deferred<any>(), started = deferred<void>();
  const api = storage(); const refresh = vi.fn(async () => {});
  if (boundary === 'create') vi.mocked(supabase.rpc).mockImplementationOnce((() => { started.resolve(); return pending.promise; }) as any);
  if (boundary === 'photo-read') vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return pending.promise; }));
  if (boundary === 'refresh') refresh.mockImplementationOnce(() => { started.resolve(); return pending.promise; });
  const post = submitClientPostJob({ owner: value, skills, refresh }); await started.promise;
  current = false; expect(value.isOwnerCurrent()).toBe(false);
  if (boundary === 'create') pending.resolve({ data: JOB, error: null });
  if (boundary === 'photo-read') pending.resolve({ ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer });
  if (boundary === 'refresh') pending.resolve(undefined);
  await post; expect(value.takePendingCreatedJob()).toBeNull(); expect(value.draft.postSuccess).toBeNull();
  expect(value.draft.postError).toBeNull(); expect(supabase.rpc).toHaveBeenCalledTimes(1);
  if (boundary !== 'refresh') { expect(api.upload).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled(); }
});
it('an old finally cannot release a newer operation on the same owner', async () => {
  const value = owner(); const pending = deferred<any>();
  vi.mocked(supabase.rpc).mockImplementationOnce((() => pending.promise) as any); storage();
  const originalBegin = value.beginPost.bind(value); let captured: any;
  value.beginPost = () => (captured = originalBegin());
  const oldPost = submitClientPostJob({ owner: value, skills, refresh: vi.fn() }); const old = captured;
  value.finishPost(old); const newer = originalBegin()!;
  pending.resolve({ data: JOB, error: null }); await oldPost;
  expect(value.isOperationCurrent(newer)).toBe(true); expect(value.isPosting).toBe(true); expect(value.takePendingCreatedJob()).toBeNull();
});
