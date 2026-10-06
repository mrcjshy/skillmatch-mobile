import { describe, expect, it } from 'vitest';
import { createClientPostJobDraftOwner } from './client-post-job-draft-provider';

describe('account-owned Post Job draft', () => {
  it('retains every committed input and transaction across wizard steps and reopen', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    owner.updateDraft({ description: 'Repair long description', address: 'Confirmed address', pin: { latitude: 14.55, longitude: 121.07 }, locationNote: 'Confirmed', scheduleDate: new Date(2030, 0, 2), scheduleTime: new Date(2030, 0, 2, 12), budgetText: '500', feePreset: 500, paymentMethod: 'cod', primarySkillId: 'plumbing', additionalSkillIds: ['electrical'], skillsModalMode: 'additional', modalQuery: 'ele', modalPrimaryId: 'plumbing', modalAdditionalIds: ['electrical'], jobPhotos: [{ uri: 'file:///photo', assetId: 'a', fileName: 'photo.jpg', fileSize: 900, pickerMimeType: 'image/jpeg' }], photoError: 'Example' });
    for (const wizardStep of [2, 3, 4, 3, 2, 1, 4] as const) owner.updateDraft({ wizardStep });
    expect(owner.draft).toMatchObject({ description: 'Repair long description', address: 'Confirmed address', wizardStep: 4, budgetText: '500', additionalSkillIds: ['electrical'], modalAdditionalIds: ['electrical'], photoError: 'Example' });
    expect(owner.draft.scheduleDate?.getFullYear()).toBe(2030);
    expect(owner.draft.jobPhotos[0].uri).toBe('file:///photo');
  });
});

describe('operation ownership', () => {
  it('reading retained draft or authority cannot settle a receipt before an explicit authorized boundary', () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized, () => true);
    owner.updateDraft({ wizardStep: 4, description: 'Private' }); const operation = owner.beginPost()!; owner.markCreateDispatched(operation);
    authorized = false; owner.suspend(); owner.recordCreatedJob(operation, 'created');
    const epoch = owner.draftEpoch; authorized = true;
    expect(owner.isOwnerCurrent()).toBe(true); expect(owner.draft.description).toBe('Private'); expect(owner.draft.postSuccess).toBeNull(); expect(owner.draftEpoch).toBe(epoch);
    owner.revalidate(); expect(owner.draft.postSuccess).toContain('completion is unknown'); expect(owner.draftEpoch).toBe(epoch + 1);
    expect(owner.takePendingCreatedJob()).toBe('created'); expect(owner.takePendingCreatedJob()).toBeNull();
  });
  it('suspends current access while retaining private fields and permanently cancels its operation', () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized, () => true);
    owner.updateDraft({ wizardStep: 4, description: 'Private', jobPhotos: [{ uri: 'one', assetId: null, fileName: null, fileSize: null, pickerMimeType: null }] });
    const operation = owner.beginPost()!;
    authorized = false;
    expect(owner.isOperationCurrent(operation)).toBe(false); expect(owner.draft.description).toBe('');
    expect(owner.updateDraft({ description: 'Unauthorized' })).toBe(false); expect(owner.beginPost()).toBeNull();
    authorized = true;
    expect(owner.draft).toMatchObject({ description: 'Private', wizardStep: 4 });
    expect(owner.draft.jobPhotos[0].uri).toBe('one'); expect(owner.isOperationCurrent(operation)).toBe(false);
    const newer = owner.beginPost()!; expect(newer).not.toBeNull(); expect(owner.finishPost(operation)).toBe(false); expect(owner.isOperationCurrent(newer)).toBe(true);
  });
  it('retains unresolved dispatched create identity and records only a same-lifetime immutable receipt', () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized, () => true);
    owner.updateDraft({ wizardStep: 4, description: 'Private' }); const operation = owner.beginPost()!;
    owner.markCreateDispatched(operation); authorized = false; expect(owner.isOwnerCurrent()).toBe(false);
    expect(owner.recordCreatedJob(operation, 'created')).toBe(true); expect(owner.recordCreatedJob(operation, 'replacement')).toBe(false);
    expect(owner.takePendingCreatedJob()).toBeNull(); expect(owner.draft.postSuccess).toBeNull();
    expect(owner.finishPost(operation)).toBe(false);
    authorized = true; expect(owner.beginPost()).toBeNull(); expect(owner.draft.postSuccess).toContain('completion is unknown');
    expect(owner.takePendingCreatedJob()).toBe('created'); expect(owner.takePendingCreatedJob()).toBeNull();
  });
  it('blocks duplicate create while unknown and permits a deliberate retry only after a known failure', () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized, () => true);
    owner.updateDraft({ wizardStep: 4 }); const original = owner.beginPost()!; owner.markCreateDispatched(original);
    authorized = false; owner.suspend(); expect(owner.isOwnerCurrent()).toBe(false); authorized = true;
    expect(owner.beginPost()).toBeNull(); expect(owner.recordCreateFailure(original, 'Known rejection')).toBe(true);
    const retry = owner.beginPost()!; expect(retry).not.toBeNull(); owner.markCreateDispatched(retry);
    expect(owner.recordCreateFailure(retry, 'Unknown outcome', false)).toBe(true); owner.finishPost(retry);
    expect(owner.isPosting).toBe(false); expect(owner.beginPost()).toBeNull(); expect(owner.draft.postError).toBe('Unknown outcome');
  });
  it('discards a late receipt after retained lifetime terminates', () => {
    let retained = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => retained, () => retained);
    owner.updateDraft({ wizardStep: 4 }); const operation = owner.beginPost()!; owner.markCreateDispatched(operation);
    retained = false; expect(owner.recordCreatedJob(operation, 'orphan')).toBe(false); expect(owner.takePendingCreatedJob()).toBeNull();
    retained = true; expect(owner.draft.description).toBe(''); expect(owner.isOwnerCurrent()).toBe(false);
  });
  it('keeps an uninterrupted authorization lifetime current across refreshed session objects', () => {
    let session = { id: 'client-a', token: 'first' };
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => session.id === 'client-a');
    owner.updateDraft({ wizardStep: 4, description: 'Preserved' }); const operation = owner.beginPost()!;
    session = { id: 'client-a', token: 'refreshed' };
    expect(owner.isOperationCurrent(operation)).toBe(true);
    expect(owner.draft.description).toBe('Preserved');
  });
  it('fails closed permanently when the owner guard throws', () => {
    let throws = false;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => { if (throws) throw new Error('private'); return true; });
    owner.updateDraft({ wizardStep: 4 }); const operation = owner.beginPost()!;
    throws = true; expect(owner.isOperationCurrent(operation)).toBe(false);
    throws = false; expect(owner.isOperationCurrent(operation)).toBe(false);
  });
  it('effect cleanup and reactivation cannot revive old operations or let old finally unlock a replacement', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    owner.updateDraft({ wizardStep: 4 }); const old = owner.beginPost()!;
    owner.dispose(); owner.activate(); owner.updateDraft({ wizardStep: 4 }); const current = owner.beginPost()!;
    expect(owner.isOperationCurrent(old)).toBe(false);
    expect(owner.finishPost(old)).toBe(false);
    expect(owner.isOperationCurrent(current)).toBe(true);
  });
  it('releases a created operation without making a second creation possible before settlement', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    owner.updateDraft({ wizardStep: 4 }); const operation = owner.beginPost()!;
    owner.recordCreatedJob(operation, 'already-created');
    expect(owner.finishPost(operation)).toBe(true);
    expect(owner.isPosting).toBe(false);
    expect(owner.beginPost()).toBeNull();
    expect(owner.takePendingCreatedJob()).toBeNull();
  });
  it('never revives an observed invalid lifetime after same-account authorization returns', () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized);
    owner.updateDraft({ wizardStep: 4 }); const old = owner.beginPost()!;
    authorized = false; expect(owner.isOperationCurrent(old)).toBe(false);
    authorized = true;
    expect(owner.isOperationCurrent(old)).toBe(false);
    expect(owner.recordCreatedJob(old, 'late-job')).toBe(false);
    expect(owner.finishPost(old)).toBe(false);
    const replacement = createClientPostJobDraftOwner('client-a');
    replacement.updateDraft({ wizardStep: 4 }); const current = replacement.beginPost()!;
    expect(replacement.finishPost(old)).toBe(false);
    expect(replacement.isOperationCurrent(current)).toBe(true);
  });
  it('permits only final Post and rejects same-tick double presses and edits', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    expect(owner.beginPost()).toBeNull();
    owner.updateDraft({ wizardStep: 4, description: 'Repair' });
    const operation = owner.beginPost()!;
    expect(operation).not.toBeNull();
    expect(owner.beginPost()).toBeNull();
    expect(owner.updateDraft({ description: 'Later edit' })).toBe(false);
    expect(owner.draft.description).toBe('Repair');
    const busySnapshot = owner.snapshot();
    owner.finishPost(operation);
    expect(owner.snapshot()).not.toBe(busySnapshot);
  });
  it('copies mutable operation inputs independently and retains create-failure fields and step', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    const date = new Date(2030, 1, 4); const ids = ['b']; const photos = [{ uri: 'one', assetId: null, fileName: null, fileSize: null, pickerMimeType: null }];
    owner.updateDraft({ wizardStep: 4, scheduleDate: date, additionalSkillIds: ids, jobPhotos: photos, pin: { latitude: 1, longitude: 2 } });
    const operation = owner.beginPost()!; date.setFullYear(2040); ids.push('c'); photos[0].uri = 'changed';
    owner.draft.scheduleDate!.setFullYear(2050); owner.draft.pin!.latitude = 9;
    expect(operation.draft.scheduleDate!.getFullYear()).toBe(2030); expect(operation.draft.additionalSkillIds).toEqual(['b']);
    expect(operation.draft.jobPhotos[0].uri).toBe('one'); expect(operation.draft.pin!.latitude).toBe(1);
    owner.failPost(operation, 'No job was created.'); owner.finishPost(operation);
    expect(owner.draft.wizardStep).toBe(4); expect(owner.draft.postError).toBe('No job was created.');
  });
  it('settles created jobs once, resets defaults and preserves settlement messages and pending handoff', () => {
    const owner = createClientPostJobDraftOwner('client-a'); owner.updateDraft({ wizardStep: 4, description: 'Repair' });
    const operation = owner.beginPost()!; expect(owner.recordCreatedJob(operation, 'job-one')).toBe(true);
    expect(owner.failPost(operation, 'No job was created.')).toBe(false);
    expect(owner.settlePost(operation, { success: 'Job posted.', error: 'Refresh warning' })).toBe(true);
    expect(owner.settlePost(operation, { success: 'Duplicate', error: null })).toBe(false);
    owner.finishPost(operation);
    expect(owner.draft).toMatchObject({ wizardStep: 1, description: '', pin: null, postSuccess: 'Job posted.', postError: 'Refresh warning' });
    expect(owner.draftEpoch).toBe(1); expect(owner.takePendingCreatedJob()).toBe('job-one'); expect(owner.takePendingCreatedJob()).toBeNull();
  });
  it('suppresses unauthorized/disposed old completions and old finally cannot unlock a later operation', () => {
    let authorized = true; const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized);
    owner.updateDraft({ wizardStep: 4 }); const old = owner.beginPost()!;
    authorized = false; expect(owner.isOwnerCurrent()).toBe(false); expect(owner.recordCreatedJob(old, 'stale')).toBe(false);
    expect(owner.finishPost(old)).toBe(false); expect(owner.updateDraft({ description: 'Stale' })).toBe(false);
    owner.dispose(); const newer = createClientPostJobDraftOwner('client-b'); newer.updateDraft({ wizardStep: 4 }); const fresh = newer.beginPost()!;
    expect(newer.finishPost(old)).toBe(false); expect(newer.isPosting).toBe(true); expect(newer.isOperationCurrent(fresh)).toBe(true);
    expect(newer.draft.description).toBe(''); expect(owner.takePendingCreatedJob()).toBeNull();
  });
});
