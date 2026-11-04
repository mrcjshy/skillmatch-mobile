// @ts-expect-error -- Node-only source check; application excludes Node declarations.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  POST_JOB_STEP_STATUSES,
  POSTING_STAGE_STATUSES,
  postJobStepsProgress,
  postJobStepsStatuses,
  postingStageStatus,
} from './post-job-steps';
import { activeStep, controlledTarget, pastStep } from './recruiter-steps-progress';

describe('Post a job checklist', () => {
  it('works on the wizard step on screen with every earlier step done', () => {
    for (const step of [1, 2, 3, 4]) {
      const p = controlledTarget(postJobStepsProgress(step));
      expect(activeStep(p)).toBe(step - 1);
      for (let index = 0; index < step - 1; index++) expect(pastStep(p, index)).toBeGreaterThan(0);
      expect(pastStep(p, step - 1)).toBeLessThan(0);
    }
  });

  it('works on the fifth step while posting and finishes all five when posted', () => {
    expect(activeStep(controlledTarget(postJobStepsProgress(5)))).toBe(4);
    expect(postJobStepsProgress(5, true)).toBe(1);
    expect(postJobStepsProgress(2, true)).toBe(1);
  });

  it('keeps out-of-range steps on the panel', () => {
    expect(postJobStepsProgress(0)).toBe(postJobStepsProgress(1));
    expect(postJobStepsProgress(9)).toBe(postJobStepsProgress(5));
  });

  it('names each step, and swaps in live words only for the step being worked on', () => {
    expect(postJobStepsStatuses(2)).toEqual([...POST_JOB_STEP_STATUSES]);
    const live = postJobStepsStatuses(5, 'Uploading photos');
    expect(live.slice(0, 4)).toEqual(POST_JOB_STEP_STATUSES.slice(0, 4));
    expect(live[4]).toBe('Uploading photos');
  });

  it('follows the posting stages, then reports nothing left once all five finished', () => {
    expect([0, 1, 2, 3, 4].map(postingStageStatus)).toEqual([...POSTING_STAGE_STATUSES]);
    expect(postingStageStatus(5)).toBeNull();
  });

  it('keeps the working step spinning until the next step, pausing only off screen or in the background', () => {
    const panel = readFileSync('src/components/post-job-steps.tsx', 'utf8');
    // Owner request 2026-11-04: no rest budget on a step.
    expect(panel).not.toContain('restAfter');
    expect(panel).toContain('paused={!focused || !foreground}');
    expect(panel).toContain('useIsFocused()');
    expect(panel).toContain("AppState.addEventListener('change'");
    const block = readFileSync('src/components/RecruiterSteps.tsx', 'utf8');
    expect(block).toContain('const frames = useFrameCallback(');
    expect(block).toContain('setTimeout(() => frames.setActive(false), restAfter * 1000)');
    // Paused stops every frame; unpaused resumes them.
    expect(block).toMatch(/if \(paused\) \{\s*frames\.setActive\(false\);/);
    expect(block).toContain('}, [controlled, target, reducedMotion, restAfter, frames, paused]);');
  });

  it('keeps every line short enough for the panel (status box about 200 px at 16.4 px type)', () => {
    for (const words of [...POST_JOB_STEP_STATUSES, ...POSTING_STAGE_STATUSES]) expect(words.length).toBeLessThanOrEqual(21);
  });
});
