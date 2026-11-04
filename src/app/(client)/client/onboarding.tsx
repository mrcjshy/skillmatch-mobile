import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';

import { RoadmapPathStepper } from '@/components/RoadmapPathStepper';
import { SkillMatchTheme } from '@/constants/theme';
import { CLIENT_ONBOARDING_HEADING, CLIENT_ONBOARDING_STEPS, joinedPill } from '@/lib/client-onboarding';

/**
 * The Client walkthrough after sign-up: how to post a Job, on the Roadmap Path Stepper. Back and
 * Home leave it; Continue on the last step opens Post job.
 */
export default function ClientOnboarding() {
  const router = useRouter();
  const [pill] = useState(() => joinedPill());
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/client' as Href);
  };
  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <RoadmapPathStepper
        steps={CLIENT_ONBOARDING_STEPS}
        heading={CLIENT_ONBOARDING_HEADING}
        tripLabel={pill.label}
        tripDate={pill.date}
        accent={SkillMatchTheme.ui.colors.accent}
        onBack={leave}
        onHome={leave}
        onDone={() => router.replace('/client/post-job' as Href)}
      />
    </>
  );
}
