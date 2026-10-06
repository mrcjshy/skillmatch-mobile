import { Stack } from 'expo-router';
import { APP_STACK_SCREEN_OPTIONS } from '@/components/app-header-options';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
// The tab shell is one headerless Stack child. Pushed Worker screens remain
// outside it so they retain this Stack's header/back affordance and never show
// a tab bar beneath full-height content such as Booking Chat.
export default function WorkerLayout() {
  return (
    <>
      <PushNotificationRegistration role="worker" />
      <Stack screenOptions={APP_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
