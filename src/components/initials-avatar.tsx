import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { initialsFromName } from '@/lib/initials';

const { colors } = SkillMatchTheme.ui;

export function InitialsAvatar({
  name,
  accent,
  size = 48,
  initials,
  photoUri,
}: {
  name: string;
  accent: string;
  size?: number;
  initials?: string;
  photoUri?: string | null;
}) {
  const letters = initials ?? initialsFromName(name);
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);

  if (photoUri && photoUri !== failedPhotoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityLabel={`${name} profile photo`}
        onError={() => setFailedPhotoUri(photoUri)}
      />
    );
  }

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
