import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { IconCircle } from '@/components/icon-circle';
import { SkillMatchTheme } from '@/constants/theme';

const { colors } = SkillMatchTheme.ui;

type NotificationBellProps = {
  role: 'worker' | 'client';
};

export function NotificationBell({ role }: NotificationBellProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityLabel="Notifications"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => router.push(`/${role}/notifications`)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <IconCircle variant="neutral" size={40}>
        <SymbolView
          name={{ android: 'notifications', ios: 'bell.fill' }}
          size={24}
          tintColor={colors.primary}
        />
      </IconCircle>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  pressed: {
    opacity: 0.6,
  },
});
