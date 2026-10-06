import { Stack } from 'expo-router';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
import { SkillMatchTheme } from '@/constants/theme';

const { colors } = SkillMatchTheme.ui;

// The tab shell is one headerless Stack child. Pushed Worker screens remain
// outside it so they retain this Stack's header/back affordance and never show
// a tab bar beneath full-height content such as Booking Chat.
export default function WorkerLayout() {
  return (
    <>
      <PushNotificationRegistration role="worker" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
