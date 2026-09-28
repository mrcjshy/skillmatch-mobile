import { StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { initialsFromName } from '@/lib/initials';

const { colors } = SkillMatchTheme.ui;

export function InitialsAvatar({
  name,
  accent,
  size = 48,
  initials,
}: {
  name: string;
  accent: string;
  size?: number;
  initials?: string;
}) {
  const letters = initials ?? initialsFromName(name);
  return (
    <View
      style={[
        styles.circle,
        {
          backgroundColor: accent,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${letters}`}
    >
      <Text style={styles.letters}>{letters}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
