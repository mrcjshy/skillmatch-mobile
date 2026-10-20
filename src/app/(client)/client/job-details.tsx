import { Stack, useLocalSearchParams } from 'expo-router';
import ClientJobDetails from '@/components/client-job-details';

export default function ClientJobDetailsRoute() {
  const { jobId, postingWarning } = useLocalSearchParams<{ jobId?: string | string[]; postingWarning?: string | string[] }>();
  const id = typeof jobId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId) ? jobId : null;
  return <><Stack.Screen options={{ title: 'Job details' }} /><ClientJobDetails jobId={id}
    postingWarning={typeof postingWarning === 'string' ? postingWarning : undefined} /></>;
}
