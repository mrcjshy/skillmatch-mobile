import { StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { initialsFromName } from '@/lib/initials';

export function InitialsAvatar({ name, accent }: { name: string; accent: string }) {
  return (
    <View
      style={[styles.circle, { backgroundColor: accent }]}
      accessibilityRole="image"
      accessibilityLabel={`Avatar ${initialsFromName(name)}`}
    >
      <Text style={styles.letters}>{initialsFromName(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
