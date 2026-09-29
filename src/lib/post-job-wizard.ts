export type PostJobWizardStep = 1 | 2 | 3 | 4;

export type PostJobWizardValidation = {
  hasPrimarySkill: boolean;
  descriptionError: string | null;
  locationError: string | null;
  scheduleError: string | null;
  budgetError: string | null;
  paymentError: string | null;
};

export function validatePostJobWizardStep(step: PostJobWizardStep, validation: PostJobWizardValidation): string | null {
  if (step === 1) {
    if (!validation.hasPrimarySkill) return 'Please select at least one required skill.';
    return validation.descriptionError;
  }
  if (step === 2) return validation.locationError;
  if (step === 3) {
    return validation.scheduleError ?? validation.budgetError ?? validation.paymentError;
  }
  return null;
}
