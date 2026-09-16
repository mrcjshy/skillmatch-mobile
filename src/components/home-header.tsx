import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InitialsAvatar } from '@/components/initials-avatar';
import { NotificationBell } from '@/components/notification-bell';
import { SkillMatchTheme } from '@/constants/theme';
import { homeGreeting } from '@/lib/home-greeting';

const { colors, type, spacing } = SkillMatchTheme.ui;

type HomeHeaderProps = {
  fullName: string;
  role: 'worker' | 'client';
};

export function HomeHeader({ fullName, role }: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const accent = role === 'worker' ? colors.accentWorker : colors.accentClient;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <InitialsAvatar name={fullName} accent={accent} size={40} />
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
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  greeting: {
    ...type.helper,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  name: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
});
