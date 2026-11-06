import { Stack } from 'expo-router';

import { SettingsScreen } from '@/components/settings-screen';

export default function WorkerSettings() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <SettingsScreen role="worker" />
    </>
  );
}
