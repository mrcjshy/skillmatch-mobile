import { Stack, useLocalSearchParams } from 'expo-router';

import ClientPortfolio from '@/components/client-portfolio';
import { CLIENT_PORTFOLIO_COPY } from '@/lib/client-portfolio';

/**
 * Client confirmed-booking portfolio (R5D-CLIENT-M1).
 *
 * bookingId is the only route parameter and is not trusted: the screen
 * re-reads this Client's own Booking list and loads portfolio only while
 * that Booking is confirmed. Worker identifiers are never accepted here.
 */
export default function ClientPortfolioScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();

  return (
    <>
      <Stack.Screen options={{ title: CLIENT_PORTFOLIO_COPY.title }} />
      <ClientPortfolio bookingId={typeof bookingId === 'string' ? bookingId : null} />
    </>
  );
}
