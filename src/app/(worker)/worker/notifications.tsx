import { Stack } from 'expo-router';

import NotificationList from '@/components/notification-list';

/**
 * Worker Notifications inbox (N12-UI).
 *
 * The route exists per role so the screen stays inside the already-protected
 * (worker) group and needs no guard of its own. The list itself is shared with
 * the Client route because both roles consume the identical server contract —
 * same table, same recipient-only RLS, same mark-read RPC. See
 * src/components/notification-list.tsx.
 */
export default function WorkerNotifications() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <NotificationList />
    </>
  );
}
