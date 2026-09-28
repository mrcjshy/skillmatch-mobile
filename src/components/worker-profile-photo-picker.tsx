import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

export type WorkerProfilePhotoPickerProps = {
  photoUri: string | null;
  onPhotoSelected: (asset: ImagePicker.ImagePickerAsset) => void;
  onRemove: () => void;
  validationMessage?: string | null;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  helpText?: string;
};

const DEFAULT_HELP_TEXT = 'Choose one photo from your gallery.';
const PICKER_ERROR = 'The photo gallery is unavailable right now. Try again.';
const PERMISSION_ERROR = 'Allow photo-library access to choose a profile photo.';
const INVALID_PHOTO_ERROR = 'The selected photo could not be read. Choose another photo.';

export function WorkerProfilePhotoPicker({
  photoUri,
  onPhotoSelected,
  onRemove,
  validationMessage = null,
  disabled = false,
  busy = false,
  label = 'Profile photo',
  helpText = DEFAULT_HELP_TEXT,
}: WorkerProfilePhotoPickerProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const blocked = disabled || busy || isPicking;
  const previewUri = typeof photoUri === 'string' && photoUri.trim().length > 0 ? photoUri : null;
  const hasPhoto = previewUri !== null;

  async function choosePhoto() {
    if (blocked) return;

    setPickerError(null);
    setIsPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickerError(PERMISSION_ERROR);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: false,
        selectionLimit: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
        setPickerError(INVALID_PHOTO_ERROR);
        return;
      }

      onPhotoSelected(asset);
    } catch {
      setPickerError(PICKER_ERROR);
    } finally {
      setIsPicking(false);
    }
  }

  function removePhoto() {
    if (blocked || !hasPhoto) return;
    setPickerError(null);
    onRemove();
  }

  const feedback = validationMessage ?? pickerError;

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>{helpText}</Text>
      </View>

      {hasPhoto ? (
        <Image
          source={{ uri: previewUri }}
          style={styles.preview}
          contentFit="cover"
          accessibilityLabel="Worker profile photo preview"
        />
      ) : (
        <View
          style={styles.emptyPreview}
          accessible
          accessibilityRole="image"
          accessibilityLabel="No worker profile photo selected"
        >
          <Text style={styles.emptyText}>No photo selected</Text>
        </View>
      )}

      <View style={styles.actions}>
        <AppButton
          label={hasPhoto ? 'Replace photo' : 'Choose photo'}
          variant="secondary"
          onPress={() => void choosePhoto()}
          disabled={disabled}
          loading={busy || isPicking}
          accessibilityLabel={
            hasPhoto
              ? 'Replace worker profile photo from gallery'
              : 'Choose worker profile photo from gallery'
          }
        />
        {hasPhoto ? (
          <AppButton
            label="Remove photo"
            variant="destructive"
            onPress={removePhoto}
            disabled={blocked}
            accessibilityLabel="Remove worker profile photo"
          />
        ) : null}
      </View>

      {feedback ? <AppNotice variant="danger" message={feedback} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  copy: {
    gap: spacing.xs,
  },
  label: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  preview: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  emptyPreview: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  emptyText: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
  },
});
