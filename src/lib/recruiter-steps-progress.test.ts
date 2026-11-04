// @ts-expect-error -- Node-only source check; application excludes Node declarations.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { activeStep, controlledTarget, FINISH, pastStep, STEPS } from './recruiter-steps-progress';

// Thresholds from the Step drawing in components/RecruiterSteps.tsx.
const FILLED = 0.1; // the dot is fully filled
const CHECKED = 0.32; // the check is fully drawn

describe('Recruiter Steps progress', () => {
  it('fills, and checks, the fifth dot once a controlled panel is finished', () => {
    const done = controlledTarget(1);
    expect(done).toBeCloseTo(1 + FINISH);
    for (let index = 0; index < STEPS; index++) expect(pastStep(done, index)).toBeGreaterThanOrEqual(CHECKED);
    expect(activeStep(done)).toBe(STEPS);
  });

  it('keeps the old behaviour short of done: four checked, the fifth being worked on', () => {
    const p = controlledTarget(0.9);
    expect(p).toBe(0.9);
    for (let index = 0; index < 4; index++) expect(pastStep(p, index)).toBeGreaterThanOrEqual(CHECKED);
    expect(pastStep(p, 4)).toBeLessThan(0);
    expect(activeStep(p)).toBe(4);
  });

  it('marks a step done exactly when progress passes its fifth', () => {
    expect(pastStep(0.2, 0)).toBeCloseTo(0);
    expect(pastStep(0.2 + FILLED / STEPS, 0)).toBeCloseTo(FILLED);
    expect(activeStep(0.1)).toBe(0);
    expect(activeStep(0.3)).toBe(1);
  });

  it('never goes below zero or past the finished value', () => {
    expect(controlledTarget(-1)).toBe(0);
    expect(controlledTarget(3)).toBeCloseTo(1 + FINISH);
    expect(pastStep(5, 4)).toBeCloseTo(pastStep(1 + FINISH, 4));
    expect(activeStep(5)).toBe(STEPS);
  });

  it('is what the panel uses for its controlled target', () => {
    const source = readFileSync('src/components/RecruiterSteps.tsx', 'utf8');
    expect(source).toContain('controlled ? controlledTarget(progress) : REST');
    expect(source).toContain("from '@/lib/recruiter-steps-progress'");
    expect(source).not.toMatch(/function (pastStep|activeStep|clamp01)\(/);
  });
});
