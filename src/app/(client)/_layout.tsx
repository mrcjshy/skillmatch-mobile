import { Stack } from 'expo-router';

// The tab shell is one headerless Stack child. Help, Notifications and Booking
// Chat remain pushed Stack screens with their existing header/back behavior.
export default function ClientLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
