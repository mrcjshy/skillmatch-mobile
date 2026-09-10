import { Stack } from 'expo-router';
import MyBookingsList from '@/components/my-bookings-list';

export default function WorkerBookings() {
  return <><Stack.Screen options={{ title: 'Bookings' }} /><MyBookingsList role="worker" /></>;
}
