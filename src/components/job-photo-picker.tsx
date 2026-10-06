import { useLayoutEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const MAX_JOB_PHOTOS = 3;

export type JobPhotoDraft = {
  uri: string;
  assetId: string | null;
  fileName: string | null;
  fileSize: number | null;
  pickerMimeType: string | null;
};

type JobPhotoPickerProps = {
  disabled?: boolean;
  photos: JobPhotoDraft[];
  error: string | null;
  ownerKey: string;
  resetEpoch: number;
  isOwnerCurrent: () => boolean;
  onErrorChange: (error: string | null) => void;
  onPhotosChange: (photos: JobPhotoDraft[]) => void;
};

function toDraft(asset: ImagePicker.ImagePickerAsset): JobPhotoDraft | null {
  if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) return null;
  return {
    uri: asset.uri,
    assetId: asset.assetId ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    // Metadata is retained for display/diagnostics only. Upload validation must inspect bytes.
    pickerMimeType: asset.mimeType ?? null,
  };
}

export function JobPhotoPicker({ disabled = false, photos, error, ownerKey, resetEpoch,
  isOwnerCurrent, onErrorChange, onPhotosChange }: JobPhotoPickerProps) {
  const mounted = useRef(true);
  const request = useRef(0);
  const signature = JSON.stringify(photos);
  const latest = useRef({ disabled, ownerKey, resetEpoch, signature, isOwnerCurrent });
  // Publish only committed props; abandoned renders cannot cancel live work.
  // Layout effects run before asynchronous gallery completions can publish.
  useLayoutEffect(() => {
    let ownerCurrent = false;
    try { ownerCurrent = isOwnerCurrent() === true; } catch { /* Revoke without exposing owner errors. */ }
    // A committed blur/revocation ends this request even if focus returns later.
    if (!ownerCurrent || latest.current.disabled !== disabled || latest.current.ownerKey !== ownerKey ||
        latest.current.resetEpoch !== resetEpoch || latest.current.signature !== signature) {
      request.current += 1;
    }
    latest.current = { disabled, ownerKey, resetEpoch, signature, isOwnerCurrent };
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);
  const remaining = MAX_JOB_PHOTOS - photos.length;

  function replacePhotos(next: JobPhotoDraft[]) {
    request.current += 1;
    onPhotosChange(next);
  }
  async function pickPhotos() {
    if (disabled || !isOwnerCurrent() || remaining <= 0) return;
    const id = ++request.current;
    const current = () => mounted.current && request.current === id &&
      !latest.current.disabled && latest.current.isOwnerCurrent();
    onErrorChange(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!current()) return;
      if (!permission.granted) {
        onErrorChange('Allow photo-library access to select job photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        allowsEditing: false,
        legacy: false,
      });
      if (!current() || result.canceled) return;

      const candidates = result.assets.map(toDraft);
      if (candidates.some((photo) => photo === null)) {
        onErrorChange('One or more selected photos could not be read. Choose them again.');
        return;
      }
      const selected = candidates.filter((photo): photo is JobPhotoDraft => photo !== null);
      if (selected.length > remaining) {
        onErrorChange('You can add up to 3 job photos.');
        return;
      }

      replacePhotos([...photos, ...selected]);
    } catch {
      if (!current()) return;
      onErrorChange('The photo gallery is unavailable right now. Try again.');
    }
  }

  function removePhoto(index: number) {
    if (disabled || !isOwnerCurrent()) return;
    onErrorChange(null);
    replacePhotos(photos.filter((_, currentIndex) => currentIndex !== index));
  }

  function movePhoto(index: number, direction: -1 | 1) {
    if (disabled || !isOwnerCurrent()) return;
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onErrorChange(null);
    replacePhotos(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>Job photos</Text>
        <Text style={styles.count} accessibilityLabel={`${photos.length} of 3 job photos selected`}>
          {photos.length}/3
        </Text>
      </View>
      <Text style={styles.help}>
        Optional. Add up to 3 JPEG, PNG, or WebP images. Each image can be up to 5 MiB.
      </Text>

      {photos.length > 0 ? (
        <View style={styles.gallery}>
          {photos.map((photo, index) => (
            <View key={`${photo.assetId ?? photo.uri}-${index}`} style={styles.photoCard}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.thumbnail}
                contentFit="cover"
                accessibilityLabel={`Selected job photo ${index + 1}`}
              />
              <Text style={styles.position}>Photo {index + 1}</Text>
              <View style={styles.orderRow}>
                <Pressable
                  style={[styles.orderButton, index === 0 && styles.disabledControl]}
                  onPress={() => movePhoto(index, -1)}
                  disabled={disabled || index === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Move photo ${index + 1} earlier`}
                  accessibilityState={{ disabled: disabled || index === 0 }}
                >
                  <Text style={styles.orderButtonText}>Earlier</Text>
                </Pressable>
                <Pressable
                  style={[styles.orderButton, index === photos.length - 1 && styles.disabledControl]}
                  onPress={() => movePhoto(index, 1)}
                  disabled={disabled || index === photos.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`Move photo ${index + 1} later`}
                  accessibilityState={{ disabled: disabled || index === photos.length - 1 }}
                >
                  <Text style={styles.orderButtonText}>Later</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.removeButton}
                onPress={() => removePhoto(index)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove job photo ${index + 1}`}
                accessibilityState={{ disabled }}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <AppButton
        label={photos.length === 0 ? 'Choose photos' : 'Add more photos'}
        variant="secondary"
        onPress={() => void pickPhotos()}
        disabled={disabled || remaining <= 0}
        accessibilityLabel={photos.length === 0 ? 'Choose job photos from gallery' : 'Add more job photos from gallery'}
      />
      {error ? <AppNotice variant="danger" message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  count: {
    ...type.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCard: {
    width: 104,
    gap: spacing.xs,
  },
  thumbnail: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  position: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  orderButton: {
    minHeight: 44,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledControl: {
    opacity: 0.35,
  },
  orderButtonText: {
    ...type.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  removeButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    ...type.helper,
    fontWeight: '600',
    color: colors.danger,
  },
});
