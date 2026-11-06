import { Stack } from 'expo-router';

import { SettingsScreen } from '@/components/settings-screen';

export default function ClientSettings() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <SettingsScreen role="client" />
    </>
  );
}
