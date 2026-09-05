import { Stack, useLocalSearchParams } from 'expo-router';

import BookingChat from '@/components/booking-chat';

/**
 * Client booking chat (BL-01C-UI).
 *
 * Same shape as the Worker route: the route exists per role so the screen
 * stays inside the already-protected (client) group, and the conversation is
 * the shared component because the server contract is identical for both
 * participants. See src/components/booking-chat.tsx.
 *
 * The only parameter is the Booking id, and it is NOT trusted: the component
 * looks it up in this Client's own Booking list and RLS scopes every message
 * read and write to Bookings they participate in. The Booking STATUS is
 * deliberately not passed — it is re-read from the server, so a screen opened
 * before a cancellation cannot keep offering a composer.
 */
export default function ClientChat() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Booking Chat' }} />
      <BookingChat role="client" bookingId={typeof bookingId === 'string' ? bookingId : null} />
    </>
  );
}
