import { StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { initialsFromName } from '@/lib/initials';

const { colors } = SkillMatchTheme.ui;

export function InitialsAvatar({
  name,
  accent,
  size = 48,
}: {
  name: string;
  accent: string;
  size?: number;
}) {
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
      accessibilityLabel={`Avatar ${initialsFromName(name)}`}
    >
      <Text style={styles.letters}>{initialsFromName(name)}</Text>
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
