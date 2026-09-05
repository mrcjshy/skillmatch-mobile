import { Stack } from 'expo-router';

// Only the group entry point is hidden. `worker/index` sets no title, so its
// header renders the raw route name; the dashboard needs no header and has no
// screen to go back to.
//
// The header stays ON for the sub-screens deliberately: opportunities, bookings
// and notifications each declare their own `<Stack.Screen options={{ title }} />`
// ("Job Opportunities", "My Bookings", "Notifications"), and none of them
// implements an in-content back control, so that header is also their only way
// back to the dashboard. Hiding it group-wide would erase both.
export default function WorkerLayout() {
  return (
    <Stack>
      <Stack.Screen name="worker/index" options={{ headerShown: false }} />
    </Stack>
  );
}
