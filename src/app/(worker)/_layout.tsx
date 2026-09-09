import { Stack } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';

// The tab shell is one headerless Stack child. Pushed Worker screens remain
// outside it so they retain this Stack's header/back affordance and never show
// a tab bar beneath full-height content such as Booking Chat.
export default function WorkerLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: SkillMatchTheme.brand.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
