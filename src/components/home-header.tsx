import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationBell } from '@/components/notification-bell';
import { InitialsAvatar } from '@/components/initials-avatar';
import { SkillMatchTheme } from '@/constants/theme';
import { homeGreeting } from '@/lib/home-greeting';

const WORKER_ACCENT = '#9FE870';
const CLIENT_ACCENT = '#70C8E8';

type HomeHeaderProps = {
  fullName: string;
  role: 'worker' | 'client';
};

export function HomeHeader({ fullName, role }: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const accent = role === 'worker' ? WORKER_ACCENT : CLIENT_ACCENT;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <InitialsAvatar name={fullName} accent={accent} />
        <View style={styles.copy}>
          <Text style={styles.greeting}>{homeGreeting()}</Text>
          <Text style={styles.name}>{fullName}</Text>
        </View>
        <NotificationBell role={role} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SkillMatchTheme.spacing.screenGutter,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    color: SkillMatchTheme.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  name: {
    color: SkillMatchTheme.text.primary,
    fontSize: 22,
    fontWeight: '700',
  },
});
