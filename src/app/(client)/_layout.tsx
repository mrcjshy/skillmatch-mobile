import { Stack } from 'expo-router';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
import { SkillMatchTheme } from '@/constants/theme';

// The tab shell is one headerless Stack child. Help, Notifications and Booking
// Chat remain pushed Stack screens with their existing header/back behavior.
export default function ClientLayout() {
  return (
    <>
      <PushNotificationRegistration role="client" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: SkillMatchTheme.brand.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
