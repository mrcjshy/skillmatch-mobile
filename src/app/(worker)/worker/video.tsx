import { Stack, useLocalSearchParams } from 'expo-router';
import BookingVideoCall from '@/components/booking-video-call';
export default function VideoRoute() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  return <><Stack.Screen options={{ title: 'Video call', headerShown: false }} /><BookingVideoCall bookingId={typeof bookingId === 'string' ? bookingId : null} /></>;
}
