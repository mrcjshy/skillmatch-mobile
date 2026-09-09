import { Stack } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';

// The tab shell is one headerless Stack child. Help, Notifications and Booking
// Chat remain pushed Stack screens with their existing header/back behavior.
export default function ClientLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: SkillMatchTheme.brand.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
