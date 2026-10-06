import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

export type JobPhotoGalleryItem = {
  slot: 1 | 2 | 3;
  signedUrl: string;
};

type JobPhotoGalleryProps = {
  photos: readonly JobPhotoGalleryItem[];
  loading?: boolean;
  error?: boolean;
};

export function JobPhotoGallery({
  photos,
  loading = false,
  error = false,
}: JobPhotoGalleryProps) {
  if (loading) {
    return <InlineStatus variant="loading" message="Loading job photos…" />;
  }
  if (error) {
    return <InlineStatus variant="error" message="Job photos are unavailable." />;
  }

  const visiblePhotos = photos
    .filter((photo) => photo.signedUrl.trim().length > 0)
    .sort((left, right) => left.slot - right.slot);

  if (visiblePhotos.length === 0) return null;

  return (
    <View style={styles.container} accessibilityLabel="Job photos">
      <Text style={styles.heading}>Job photos</Text>
      <View style={styles.gallery}>
        {visiblePhotos.map((photo, index) => (
          <Image
            key={photo.slot}
            source={{ uri: photo.signedUrl }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel={`Job photo ${index + 1} of ${visiblePhotos.length}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  heading: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photo: {
    width: 104,
    height: 104,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    borderCurve: 'continuous',
  },
});
