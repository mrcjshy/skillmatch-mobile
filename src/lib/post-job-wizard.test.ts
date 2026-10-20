import { describe, expect, it } from 'vitest';

import { validatePostJobWizardStep, type PostJobWizardValidation } from './post-job-wizard';

const valid: PostJobWizardValidation = {
  hasPrimarySkill: true,
  descriptionError: null,
  locationError: null,
  scheduleError: null,
  budgetError: null,
  paymentError: null,
};

describe('Post Job wizard step validation', () => {
  it('validates only the current step while the draft remains local', () => {
    expect(validatePostJobWizardStep(1, valid)).toBeNull();
    expect(validatePostJobWizardStep(2, valid)).toBeNull();
    expect(validatePostJobWizardStep(3, valid)).toBeNull();
    expect(validatePostJobWizardStep(4, valid)).toBeNull();
  });

  it('allows location first with blank details and blocks missing fields at their own steps', () => {
    expect(validatePostJobWizardStep(1, { ...valid, hasPrimarySkill: false, descriptionError: 'Describe the job.' })).toBeNull();
    expect(validatePostJobWizardStep(1, { ...valid, locationError: 'Choose a location.' })).toBe('Choose a location.');
    expect(validatePostJobWizardStep(2, { ...valid, hasPrimarySkill: false })).toMatch(/skill/i);
    expect(validatePostJobWizardStep(2, { ...valid, descriptionError: 'Describe the job.' })).toBe('Describe the job.');
    expect(validatePostJobWizardStep(3, { ...valid, scheduleError: 'Choose a schedule.' })).toBeTruthy();
    expect(validatePostJobWizardStep(3, { ...valid, paymentError: 'Choose payment.' })).toBeTruthy();
  });
});
