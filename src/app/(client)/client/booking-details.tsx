import { Stack, useLocalSearchParams } from 'expo-router';
import BookingDetails from '@/components/booking-details';

export default function ClientBookingDetails() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  return <><Stack.Screen options={{ title: 'Booking Details' }} /><BookingDetails role="client" bookingId={typeof bookingId === 'string' ? bookingId : null} /></>;
}
