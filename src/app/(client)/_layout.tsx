import { Stack } from 'expo-router';

// Same shape as the worker group: hide only the untitled group entry point,
// whose header would render the raw route name. `client/bookings` and
// `client/notifications` set their own titles and rely on that header's back
// button as their only route back to the dashboard, so it stays visible there.
export default function ClientLayout() {
  return (
    <Stack>
      <Stack.Screen name="client/index" options={{ headerShown: false }} />
    </Stack>
  );
}
