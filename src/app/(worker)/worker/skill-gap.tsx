import { Stack } from 'expo-router';

import SkillGap from '@/components/skill-gap';
import { SKILL_GAP_COPY } from '@/lib/skill-gap';

/**
 * Worker Skill Gap (AI-03).
 *
 * Worker-only by construction: the route lives inside the already-protected
 * (worker) group and has no Client or Admin counterpart, because it compares
 * the Worker's own saved skills against their own current Job Opportunities.
 * See src/components/skill-gap.tsx and src/lib/skill-gap.ts.
 */
export default function WorkerSkillGap() {
  return (
    <>
      <Stack.Screen options={{ title: SKILL_GAP_COPY.title }} />
      <SkillGap />
    </>
  );
}
