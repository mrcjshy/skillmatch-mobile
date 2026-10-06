import { Stack } from 'expo-router';
import { APP_STACK_SCREEN_OPTIONS } from '@/components/app-header-options';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
// The tab shell (Home, Workers, Clients, Reports) is one headerless Stack child. Every other Admin
// screen is pushed here, so it keeps this Stack's centered title and Back, with no tab bar below.
export default function AdminLayout() {
  return (
    <>
      <PushNotificationRegistration role="administrator" />
      <Stack screenOptions={APP_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="admin/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="admin/user-detail" options={{ title: 'Account details' }} />
        <Stack.Screen name="admin/identity-reviews" options={{ title: 'ID reviews' }} />
        <Stack.Screen name="admin/verification-details" options={{ title: 'ID review' }} />
        <Stack.Screen name="admin/report-details" options={{ title: 'Report details' }} />
      </Stack>
    </>
  );
}
