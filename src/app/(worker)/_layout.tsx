import { Stack } from 'expo-router';

// The tab shell is one headerless Stack child. Pushed Worker screens remain
// outside it so they retain this Stack's header/back affordance and never show
// a tab bar beneath full-height content such as Booking Chat.
export default function WorkerLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
