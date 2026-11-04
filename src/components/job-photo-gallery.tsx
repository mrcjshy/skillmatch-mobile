import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { InlineStatus } from '@/components/inline-status';
import { JobPhotoViewer, lightenStatusBarForPhotoViewer } from '@/components/job-photo-viewer';
import { MotionView, usePressScale } from '@/components/motion';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/** A held thumbnail eases down this far (the app's scale-on-hold press feedback). */
const PRESSED_SCALE = 0.96;
const THUMBNAIL_SIZE = 104;
const RING_WIDTH = 2;

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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const visiblePhotos = photos
    .filter((photo) => photo.signedUrl.trim().length > 0)
    .sort((left, right) => left.slot - right.slot);
  // A reload, an error, a blur or no photos left closes the viewer; it never reopens on its own.
  if (openIndex !== null && (loading || error || visiblePhotos.length === 0)) setOpenIndex(null);

  if (loading) {
    return <InlineStatus variant="loading" skeleton="lines" message="Loading job photos…" />;
  }
  if (error) {
    return <InlineStatus variant="error" message="Job photos are unavailable." />;
  }

  if (visiblePhotos.length === 0) return null;

  const open = (index: number) => {
    lightenStatusBarForPhotoViewer();
    setOpenIndex(index);
  };

  return (
    <View style={styles.container} accessibilityLabel="Job photos">
      <Text style={styles.heading}>Job photos</Text>
      <View style={styles.gallery}>
        {visiblePhotos.map((photo, index) => (
          <JobPhotoThumbnail
            key={photo.slot}
            photo={photo}
            label={`Open job photo ${index + 1} of ${visiblePhotos.length}`}
            onPress={() => open(index)}
          />
        ))}
      </View>
      {openIndex !== null ? (
        <JobPhotoViewer photos={visiblePhotos} initialIndex={openIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </View>
  );
}

/** A thumbnail button: held, it eases down and takes an accent ring, so it never relies on opacity. */
function JobPhotoThumbnail({ photo, label, onPress }: { photo: JobPhotoGalleryItem; label: string; onPress: () => void }) {
  const press = usePressScale(PRESSED_SCALE);
  return (
    <MotionView style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.thumbnail, pressed ? styles.thumbnailPressed : null]}
      >
        <Image source={{ uri: photo.signedUrl }} style={styles.photo} contentFit="cover" accessible={false} />
      </Pressable>
    </MotionView>
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
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.control,
    borderWidth: RING_WIDTH,
    borderColor: 'transparent',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  thumbnailPressed: {
    borderColor: colors.accent,
  },
  photo: {
    flex: 1,
    borderRadius: radius.control - RING_WIDTH,
    backgroundColor: colors.surfaceSunken,
    borderCurve: 'continuous',
  },
});
