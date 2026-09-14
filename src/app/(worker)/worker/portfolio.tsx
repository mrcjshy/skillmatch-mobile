import { Stack } from 'expo-router';

import WorkerPortfolio from '@/components/worker-portfolio';
import { PORTFOLIO_COPY } from '@/lib/portfolio';

/**
 * Worker text portfolio (R5D-1).
 *
 * Worker-only by construction: the route lives inside the already-protected
 * (worker) group. Items are the Worker's own `portfolio_items` rows keyed by
 * `worker_profiles.id`. Resume already reads those text fields.
 */
export default function WorkerPortfolioScreen() {
  return (
    <>
      <Stack.Screen options={{ title: PORTFOLIO_COPY.title }} />
      <WorkerPortfolio />
    </>
  );
}
