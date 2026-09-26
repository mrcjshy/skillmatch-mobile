import { Stack } from 'expo-router';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
import { SkillMatchTheme } from '@/constants/theme';

export default function AdminLayout() {
  return (
    <>
      <PushNotificationRegistration role="administrator" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: SkillMatchTheme.brand.background },
        }}
      >
        <Stack.Screen name="admin/index" options={{ headerShown: false }} />
        <Stack.Screen name="admin/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="admin/workers" options={{ title: 'Worker Directory' }} />
        <Stack.Screen name="admin/clients" options={{ title: 'Client Directory' }} />
        <Stack.Screen name="admin/user-detail" options={{ title: 'User Details' }} />
        <Stack.Screen
          name="admin/identity-reviews"
          options={{ title: 'Identity Reviews', headerShown: true }}
        />
        <Stack.Screen name="admin/reports" options={{ title: 'Reports', headerShown: true }} />
        <Stack.Screen
          name="admin/report-details"
          options={{ title: 'Report Details', headerShown: true }}
        />
        <Stack.Screen
          name="admin/verification-details"
          options={{ title: 'Verification Details', headerShown: true }}
        />
      </Stack>
    </>
  );
}
