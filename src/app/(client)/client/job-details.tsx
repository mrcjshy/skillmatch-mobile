import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import ClientJobDetails from '@/components/client-job-details';
import { PostedJobCelebration } from '@/components/posted-job-celebration';

export default function ClientJobDetailsRoute() {
  const { jobId, postingWarning, posted } = useLocalSearchParams<{ jobId?: string | string[]; postingWarning?: string | string[]; posted?: string | string[] }>();
  const router = useRouter();
  // Shown once, on arrival from Post job; clearing the param keeps a restore or re-entry from replaying it.
  const [celebrating, setCelebrating] = useState(posted === '1');
  const closeCelebration = useCallback(() => {
    setCelebrating(false);
    router.setParams({ posted: undefined });
  }, [router]);
  const id = typeof jobId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId) ? jobId : null;
  return <View style={{ flex: 1 }}><Stack.Screen options={{ title: 'Job details' }} /><ClientJobDetails jobId={id}
    postingWarning={typeof postingWarning === 'string' ? postingWarning : undefined} />
    {celebrating && id !== null ? <PostedJobCelebration onClose={closeCelebration} /> : null}</View>;
}
