import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import NotificationList from '@/components/notification-list';
import { notificationActivationHref } from '@/lib/push-notifications';
import type { NotificationRow } from '@/lib/notifications';

export default function AdminNotifications() {
  const router = useRouter();
  const handleNotificationPress = useCallback(
    (notification: NotificationRow) => {
      const href = notificationActivationHref('administrator', notification.type);
      if (href && href !== '/admin/notifications') router.push(href as Href);
    },
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <NotificationList onNotificationPress={handleNotificationPress} />
    </>
  );
}
