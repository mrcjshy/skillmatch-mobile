import type { RoadmapStep } from '@/components/RoadmapPathStepper';

/**
 * The Client walkthrough shown once after finishing sign-up (REG-01/02 profile step): how posting a
 * Job works, on the Roadmap Path Stepper. It can be replayed from Profile.
 */
export const CLIENT_ONBOARDING_PATH = '/client/onboarding';

export const CLIENT_ONBOARDING_HEADING = 'How to Post\nYour First Job';

export const CLIENT_ONBOARDING_STEPS: RoadmapStep[] = [
  { title: "You're all set", description: 'Your account is ready. Here is how getting help works on SkillMatch.' },
  { title: 'Tap the + button', description: 'It sits in the middle of the bottom bar on every screen.' },
  { title: 'Describe the work', description: 'Say what needs fixing and add a photo so Workers understand.' },
  { title: 'Skills, date and budget', description: 'Choose the skills needed, when you need it and what you will pay.' },
  { title: 'Confirm the location', description: 'Use your home pin from sign-up, or pin another place in Santa Ana.' },
  { title: 'A Worker accepts', description: 'Nearby verified Workers see your job. We notify you when one accepts.' },
];

/** The pill in the top bar: "Joined on 4 Nov, 03:12 PM", in the block's own format. */
export function joinedPill(now: Date = new Date()): { label: string; date: string } {
  const day = now.getDate();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const hour = now.getHours() % 12 || 12;
  const minute = String(now.getMinutes()).padStart(2, '0');
  return { label: 'Joined on', date: `${day} ${month}, ${String(hour).padStart(2, '0')}:${minute} ${now.getHours() < 12 ? 'AM' : 'PM'}` };
}

// One pending walkthrough per account, set when the profile step finishes and taken by Home.
let pendingFor: string | null = null;

export function markClientOnboardingPending(userId: string): void {
  pendingFor = userId;
}

/** True once for the account that just finished the profile step. */
export function takeClientOnboardingPending(userId: string | null | undefined): boolean {
  if (!userId || pendingFor !== userId) return false;
  pendingFor = null;
  return true;
}
