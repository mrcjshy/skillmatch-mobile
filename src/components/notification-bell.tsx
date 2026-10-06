import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';

const { colors, radius, size } = SkillMatchTheme.ui;

type NotificationBellProps = {
  role: 'worker' | 'client' | 'admin';
};

export function NotificationBell({ role }: NotificationBellProps) {
  const router = useRouter();
  const hasUnread = useUnreadNotifications(role);

  return (
    <Pressable
      accessibilityLabel={hasUnread ? 'Notifications, unread notifications' : 'Notifications'}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => router.push(`/${role}/notifications`)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
        <SymbolView
          name={{ android: 'notifications_none', ios: 'bell' }}
          size={24}
          tintColor={colors.textPrimary}
        />
        {hasUnread ? <View testID="notification-unread-dot" accessible={false} pointerEvents="none" style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.ghostButton,
    minWidth: size.ghostButton,
    borderRadius: radius.pill,
  },
  pressed: {
    backgroundColor: colors.accentSubtle,
  },
  dot: {
    position: 'absolute', top: 10, right: 10,
    width: 8, height: 8, borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
});
