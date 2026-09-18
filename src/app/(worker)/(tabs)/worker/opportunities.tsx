import { Redirect } from 'expo-router';

/**
 * Hidden compatibility route. Worker job discovery lives on Home.
 * Keep this file so `/worker/opportunities` does not 404.
 */
export default function WorkerOpportunities() {
  return <Redirect href="/worker" />;
}
