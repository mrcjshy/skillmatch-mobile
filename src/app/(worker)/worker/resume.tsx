import { Stack } from 'expo-router';

import ResumeBuilder from '@/components/resume-builder';
import { RESUME_COPY } from '@/lib/resume';

/**
 * Worker Auto Resume Builder (AI-02).
 *
 * Worker-only by construction: the route lives inside the already-protected
 * (worker) group and has no Client or Admin counterpart, because the resume
 * is built from the Worker's own profile and nothing else. See
 * src/components/resume-builder.tsx and src/lib/resume.ts.
 */
export default function WorkerResume() {
  return (
    <>
      <Stack.Screen options={{ title: RESUME_COPY.title }} />
      <ResumeBuilder />
    </>
  );
}
