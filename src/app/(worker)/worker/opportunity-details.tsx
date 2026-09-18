import { Stack, useLocalSearchParams } from 'expo-router';

import JobOpportunityDetails from '@/components/job-opportunity-details';

/**
 * Worker job-opportunity details (V3-1 P3).
 *
 * Thin route shell: the only parameter is `jobId`, and it is NOT trusted.
 * The details component re-reads `list_my_job_opportunities()` (zero args;
 * Worker = auth.uid()) and finds the row by `job_id`. A parameter naming a
 * Job this Worker is not currently matched into yields an unavailable screen.
 */
export default function WorkerOpportunityDetails() {
  const { jobId } = useLocalSearchParams<{ jobId?: string | string[] }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Job Opportunity' }} />
      <JobOpportunityDetails jobId={typeof jobId === 'string' ? jobId : null} />
    </>
  );
}
