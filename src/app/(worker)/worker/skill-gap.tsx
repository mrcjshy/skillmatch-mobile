import { Redirect } from 'expo-router';

/**
 * Obsolete standalone Skill Gap links return to Worker Home. Skill Gap / AI Guidance
 * lives on each Job Opportunity, never as a separate Worker screen.
 */
export default function WorkerSkillGap() {
  return <Redirect href="/worker" />;
}
