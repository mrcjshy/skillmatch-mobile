/**
 * The Post a job wizard as a Recruiter Steps checklist (owner request 2026-11-04): the four wizard
 * steps plus the post itself, so the fifth dot lands when the Job is created. Pure, so the mapping
 * from wizard state to the panel is testable; components/post-job-steps.tsx draws it.
 */
type Five = [string, string, string, string, string];

export const POST_JOB_STEPS_TITLE = 'Post a job';

/** What the Client is doing on each step: Location, Details, Schedule, Review, Post. */
export const POST_JOB_STEP_STATUSES: Readonly<Five> = [
  'Choosing the location',
  'Describing the job',
  'Setting the schedule',
  'Reviewing your post',
  'Posting your job',
];

export const POST_JOB_STEPS_DONE = 'Job posted';

/** The real stages of submitClientPostJob, by how many have finished (it reports 1…5 through onStage). */
export const POSTING_STAGE_STATUSES: Readonly<Five> = [
  'Checking details',
  'Posting your job',
  'Uploading photos',
  'Updating your jobs',
  'Telling Workers',
];

function stepIndex(step: number) {
  return Math.min(5, Math.max(1, Math.round(step))) - 1;
}

/**
 * The panel's progress for `step` (1–4 on the wizard, 5 while posting): every earlier step done and
 * this one half way, so its ring spins. `done` finishes all five.
 */
export function postJobStepsProgress(step: number, done = false): number {
  return done ? 1 : (stepIndex(step) + 0.5) / 5;
}

/** The five status lines, with `live` words (the posting stage) for the step being worked on. */
export function postJobStepsStatuses(step: number, live?: string): Five {
  const statuses = [...POST_JOB_STEP_STATUSES] as Five;
  if (live) statuses[stepIndex(step)] = live;
  return statuses;
}

/** The stage being worked on after `finished` stages; null once all five have finished. */
export function postingStageStatus(finished: number): string | null {
  return finished >= 5 ? null : POSTING_STAGE_STATUSES[Math.max(0, Math.floor(finished))];
}
