import { Stack } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';

// Both auth screens would otherwise render their raw route name ("login",
// "register") as the header title. Neither sets a title and neither depends on
// the header for navigation: login links to register, and register uses a
// `dismissTo` link back to login.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: SkillMatchTheme.brand.background },
      }}
    />
  );
}
