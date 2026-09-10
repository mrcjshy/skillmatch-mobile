import { Stack } from 'expo-router';
import MyBookingsList from '@/components/my-bookings-list';

export default function ClientBookings() {
  return <><Stack.Screen options={{ title: 'Bookings' }} /><MyBookingsList role="client" /></>;
}
