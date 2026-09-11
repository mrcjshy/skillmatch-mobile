import { Stack } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: SkillMatchTheme.brand.background },
      }}
    >
      <Stack.Screen name="admin/index" options={{ headerShown: false }} />
      <Stack.Screen name="admin/reports" options={{ title: 'Reports', headerShown: true }} />
      <Stack.Screen
        name="admin/report-details"
        options={{ title: 'Report Details', headerShown: true }}
      />
    </Stack>
  );
}
