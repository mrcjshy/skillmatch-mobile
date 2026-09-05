import { Stack, useLocalSearchParams } from 'expo-router';

import BookingChat from '@/components/booking-chat';

/**
 * Worker booking chat (BL-01C-UI).
 *
 * The route exists per role so the screen stays inside the already-protected
 * (worker) group and needs no guard of its own. The conversation itself is
 * shared with the Client route because both roles consume the identical server
 * contract — same table, same participant-scoped policies, same confirmed-only
 * send boundary. See src/components/booking-chat.tsx.
 *
 * The only parameter is the Booking id, and it is NOT trusted: the component
 * looks it up in this Worker's own Booking list and RLS scopes every message
 * read and write to Bookings they participate in. A parameter naming someone
 * else's Booking yields an unavailable screen, not someone else's chat. The
 * Booking STATUS is deliberately not passed here — it is re-read from the
 * server, so a screen opened before a completion cannot keep offering a
 * composer.
 *
 * The title is fixed rather than built from the counterparty, so no name is
 * needed to render a header and none is looked up.
 */
export default function WorkerChat() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Booking Chat' }} />
      <BookingChat role="worker" bookingId={typeof bookingId === 'string' ? bookingId : null} />
    </>
  );
}
