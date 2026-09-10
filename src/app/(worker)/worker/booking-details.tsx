import { Stack, useLocalSearchParams } from 'expo-router';
import BookingDetails from '@/components/booking-details';

export default function WorkerBookingDetails() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  return <><Stack.Screen options={{ title: 'Booking Details' }} /><BookingDetails role="worker" bookingId={typeof bookingId === 'string' ? bookingId : null} /></>;
}
