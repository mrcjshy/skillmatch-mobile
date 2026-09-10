import { Stack } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';

// Auth screens would otherwise render their raw route name as the header
// title. None sets a title; login links to register and forgot-password,
// register uses a dismissTo link back to login, and forgot-password returns
// to login.
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
