import type { ClientPostJobDraftContextValue } from '@/providers/client-post-job-draft-provider';
import { COPY, JobLocationError, createJobLocationErrorCopy, createMyJobWithLocation,
  postingDescriptionError, postingLocationError } from './job-location';
import { JOB_PHOTO_SLOTS, JobPhotoError, loadValidatedJobPhoto, retryMissingJobPhotos, type JobPhotoRetry } from './job-photos';
import { postingPaymentError } from './job-payment';
import { combineJobSchedule, postingScheduleError } from './job-posting-schedule';
import type { CatalogSkill } from './skill-catalog';

/** One final-Post operation. Once creation succeeds, every photo outcome belongs to that Job. */
export async function submitClientPostJob(input: {
  owner: ClientPostJobDraftContextValue;
  skills: readonly CatalogSkill[];
  refresh: (ownerId: string) => Promise<void>;
}): Promise<void> {
  const { owner, skills, refresh } = input;
  const operation = owner.beginPost();
  if (!operation) return;
  const current = () => owner.isOperationCurrent(operation);
  const draft = operation.draft;
  const fail = (message: string) => { if (current()) owner.failPost(operation, message); };
  try {
    const descriptionError = postingDescriptionError(draft.description);
    if (descriptionError !== null) { fail(descriptionError); return; }
    const address = draft.address.trim();
    const locationError = postingLocationError(address, draft.pin);
    if (locationError !== null || draft.pin === null) { fail(locationError ?? COPY.missingPin); return; }
    const scheduleError = postingScheduleError(draft.scheduleDate, draft.scheduleTime);
    if (scheduleError !== null) { fail(scheduleError); return; }
    const schedule = combineJobSchedule(draft.scheduleDate, draft.scheduleTime);
    if (schedule === null) { fail('Please choose a valid date and time.'); return; }
    let budget: number | null = null;
    const trimmedBudget = draft.budgetText.trim();
    if (trimmedBudget.length > 0) {
      if (!/^\d+(\.\d{1,2})?$/.test(trimmedBudget)) { fail('Budget must be a number of 0 or more.'); return; }
      budget = Number(trimmedBudget);
      if (!Number.isFinite(budget) || budget < 0) { fail('Budget must be a number of 0 or more.'); return; }
    }
    const paymentError = postingPaymentError(draft.paymentMethod, budget);
    if (paymentError !== null || draft.paymentMethod === null) { fail(paymentError ?? 'Please select a payment method.'); return; }
    const primary = skills.find(skill => skill.id === draft.primarySkillId);
    if (!primary) { fail('Please select a primary skill.'); return; }
    const knownIds = new Set(skills.map(skill => skill.id));
    const skillIds = [...new Set([primary.id, ...draft.additionalSkillIds.filter(id => knownIds.has(id))])];
    if (!current() || !owner.markCreateDispatched(operation)) return;
    let createdJobId: string;
    try {
      createdJobId = await createMyJobWithLocation({ title: primary.skill_name, description: draft.description.trim(),
        address, scheduledAt: schedule.toISOString(), budget, paymentMethod: draft.paymentMethod, skillIds,
        latitude: draft.pin.latitude, longitude: draft.pin.longitude });
    } catch (error: unknown) {
      const code = error instanceof JobLocationError ? error.code : 'unknown';
      const knownRejection = code === '42501' || code === '22023';
      if (current()) console.warn('[R5E-M1] create_my_job_with_location failed:', code);
      owner.recordCreateFailure(operation, !knownRejection
        ? 'The posting outcome could not be confirmed. Check My Posted Jobs before trying again.'
        : createJobLocationErrorCopy(error) + ' No job was created.', knownRejection);
      return;
    }
    if (!owner.recordCreatedJob(operation, createdJobId) || !current()) return;
    let uploadedPhotoCount = 0;
    const retries: JobPhotoRetry[] = [];
    for (let index = 0; index < draft.jobPhotos.length; index += 1) {
      if (!current()) return;
      const photo = draft.jobPhotos[index], slot = JOB_PHOTO_SLOTS[index];
      if (!photo || slot === undefined) continue;
      const loaded = await loadValidatedJobPhoto(photo.uri);
      if (!current()) return;
      if (loaded.ok) retries.push({ slot, image: loaded.image });
    }
    if (retries.length > 0) {
      if (!current()) return;
      try {
        const uploaded = await retryMissingJobPhotos({ clientId: operation.ownerId, jobId: createdJobId, retries,
          isOperationCurrent: current });
        if (!current()) return;
        uploadedPhotoCount = uploaded.successfulCount;
      } catch (error) {
        if (error instanceof JobPhotoError && error.code === 'operation_invalidated') return;
        if (!current()) return;
        uploadedPhotoCount = 0;
      }
    }
    if (!current()) return;
    let refreshFailed = false;
    try { await refresh(operation.ownerId); } catch { refreshFailed = true; }
    if (!current()) return;
    let success: string;
    const count = draft.jobPhotos.length;
    if (count === 0) success = 'Job posted. Waiting for a worker to accept.';
    else if (uploadedPhotoCount === count) success = 'Job posted. ' + uploadedPhotoCount + ' of ' + count + ' photos uploaded. Waiting for a worker to accept.';
    else if (uploadedPhotoCount === 0) success = 'Job posted, but the photos could not be uploaded.';
    else {
      const failed = count - uploadedPhotoCount;
      success = 'Job posted. ' + uploadedPhotoCount + ' of ' + count + ' photos uploaded; ' + failed + ' ' + (failed === 1 ? 'photo' : 'photos') + ' could not be uploaded.';
    }
    if (!current()) return;
    owner.settlePost(operation, { success, error: refreshFailed
      ? 'Job posted, but the job list could not be refreshed. Check My Posted Jobs.' : null });
  } finally {
    // Identity-checked release cannot unlock a successor operation or account.
    owner.finishPost(operation);
  }
}
