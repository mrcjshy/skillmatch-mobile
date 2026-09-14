import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { SkillMatchTheme } from '@/constants/theme';
import {
  PORTFOLIO_COPY,
  PORTFOLIO_TITLE_MAX,
  PROJECT_SCALE_OPTIONS,
  buildPortfolioInsertPayload,
  createOwnPortfolioItem,
  deleteOwnPortfolioItem,
  insertFailureCopy,
  loadOwnPortfolio,
  portfolioPhotoCountLabel,
  projectScaleLabel,
  type PortfolioDraftImage,
  type PortfolioItem,
  type PortfolioItemImage,
  type ProjectScale,
} from '@/lib/portfolio';
import {
  MAX_PORTFOLIO_IMAGES,
  remainingPortfolioImageSlots,
} from '@/lib/portfolio-images';
import { useAccount } from '@/providers/account-provider';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no-profile' }
  | { kind: 'ready'; workerProfileId: string; items: PortfolioItem[] };

function coverImage(images: PortfolioItemImage[]): PortfolioItemImage | null {
  return images.find((image) => image.position === 1) ?? null;
}

function galleryImages(images: PortfolioItemImage[]): PortfolioItemImage[] {
  return images.filter((image) => image.position !== 1);
}

export default function WorkerPortfolio() {
  const { account } = useAccount();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectScale, setProjectScale] = useState<ProjectScale | null>(null);
  const [draftImages, setDraftImages] = useState<PortfolioDraftImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (run: { cancelled: boolean }) => {
      if (!account) return;
      try {
        const result = await loadOwnPortfolio(account.id);
        if (run.cancelled) return;
        setFormError(null);
        if (result.kind === 'no-profile') {
          setState({ kind: 'no-profile' });
          return;
        }
        setState({
          kind: 'ready',
          workerProfileId: result.workerProfileId,
          items: result.items,
        });
      } catch {
        if (run.cancelled) return;
        setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
        setFormError(PORTFOLIO_COPY.loadFailed);
      }
    },
    [account]
  );

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; same convention as resume-builder */
  useEffect(() => {
    const run = { cancelled: false };
    void load(run);
    return () => {
      run.cancelled = true;
    };
  }, [load, retryToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const busy = isSaving || deletingId !== null;
  const remainingSlots = remainingPortfolioImageSlots(draftImages.length);

  function retry() {
    setState({ kind: 'loading' });
    setFormError(null);
    setSuccess(null);
    setRetryToken((token) => token + 1);
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setProjectScale(null);
    setDraftImages([]);
  }

  async function handleAddPhotos() {
    if (busy || remainingSlots <= 0) return;
    setFormError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSuccess(null);
      setFormError(PORTFOLIO_COPY.photosDenied);
      return;
    }

    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        legacy: false,
        allowsEditing: false,
      });
      if (picked.canceled) return;
      setDraftImages((current) =>
        [...current, ...picked.assets.map((asset) => ({ uri: asset.uri }))].slice(
          0,
          MAX_PORTFOLIO_IMAGES
        )
      );
    } catch {
      setSuccess(null);
      setFormError(PORTFOLIO_COPY.photosUnavailable);
    }
  }

  function removeDraftImage(index: number) {
    if (busy) return;
    setDraftImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSave(workerProfileId: string) {
    if (inFlight.current || busy || !account) return;
    const built = buildPortfolioInsertPayload({
      workerId: workerProfileId,
      title,
      description,
      projectScale: projectScale ?? '',
    });
    if (!built.ok) {
      setSuccess(null);
      setFormError(insertFailureCopy(built.reason));
      return;
    }

    inFlight.current = true;
    setIsSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const result = await createOwnPortfolioItem({
        accountId: account.id,
        title: built.payload.title,
        description: built.payload.description ?? '',
        projectScale: built.payload.project_scale,
        images: draftImages,
      });
      if (result.status === 'success') {
        resetForm();
        setState({
          kind: 'ready',
          workerProfileId: result.workerProfileId,
          items: result.items,
        });
        setSuccess(PORTFOLIO_COPY.saved);
        return;
      }
      if (result.status === 'saved_refresh_failed') {
        resetForm();
        setSuccess(result.message);
        setRetryToken((token) => token + 1);
        return;
      }
      setFormError(result.message);
    } catch {
      setFormError(PORTFOLIO_COPY.saveFailed);
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  }

  async function handleDelete(workerProfileId: string, itemId: string) {
    if (inFlight.current || busy || !account) return;
    inFlight.current = true;
    setDeletingId(itemId);
    setFormError(null);
    setSuccess(null);
    try {
      const result = await deleteOwnPortfolioItem(workerProfileId, itemId);
      if (result.status === 'success') {
        setSuccess(PORTFOLIO_COPY.deleted);
        setRetryToken((token) => token + 1);
        return;
      }
      setFormError(result.message);
    } catch {
      setFormError(PORTFOLIO_COPY.deleteFailed);
    } finally {
      inFlight.current = false;
      setDeletingId(null);
    }
  }

  function promptDelete(workerProfileId: string, item: PortfolioItem) {
    if (busy) return;
    Alert.alert(PORTFOLIO_COPY.deleteTitle, PORTFOLIO_COPY.deleteBody, [
      { text: PORTFOLIO_COPY.dismiss, style: 'cancel' },
      {
        text: PORTFOLIO_COPY.delete,
        style: 'destructive',
        onPress: () => {
          void handleDelete(workerProfileId, item.id);
        },
      },
    ]);
  }

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{PORTFOLIO_COPY.loading}</Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{PORTFOLIO_COPY.loadFailed}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={PORTFOLIO_COPY.retry}
        >
          <Text style={styles.secondaryButtonText}>{PORTFOLIO_COPY.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === 'no-profile') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{PORTFOLIO_COPY.noProfile}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{PORTFOLIO_COPY.heading}</Text>
      <Text style={styles.helper}>{PORTFOLIO_COPY.helper}</Text>

      {state.items.length === 0 ? (
        <Text style={styles.muted}>{PORTFOLIO_COPY.empty}</Text>
      ) : (
        state.items.map((item) => {
          const cover = coverImage(item.images);
          const rest = galleryImages(item.images);
          return (
            <View key={item.id} style={styles.card}>
              {cover ? <SavedCover image={cover} /> : null}
              {rest.length > 0 ? (
                <View style={styles.galleryRow}>
                  {rest.map((image) => (
                    <SavedThumb key={image.id} image={image} />
                  ))}
                </View>
              ) : null}
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.muted}>{projectScaleLabel(item.projectScale)}</Text>
              {item.description ? <Text style={styles.line}>{item.description}</Text> : null}
              <Pressable
                style={[styles.deleteButton, busy && styles.buttonDisabled]}
                onPress={() => promptDelete(state.workerProfileId, item)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${PORTFOLIO_COPY.delete} ${item.title}`}
              >
                {deletingId === item.id ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.deleteButtonText}>{PORTFOLIO_COPY.delete}</Text>
                )}
              </Pressable>
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>{PORTFOLIO_COPY.add}</Text>
      <Text style={styles.label}>{PORTFOLIO_COPY.titleLabel}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        editable={!busy}
        maxLength={PORTFOLIO_TITLE_MAX}
        accessibilityLabel={PORTFOLIO_COPY.titleLabel}
      />

      <Text style={styles.label}>{PORTFOLIO_COPY.descriptionLabel}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        editable={!busy}
        multiline
        textAlignVertical="top"
        accessibilityLabel={PORTFOLIO_COPY.descriptionLabel}
      />

      <Text style={styles.label}>{PORTFOLIO_COPY.scaleLabel}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {PROJECT_SCALE_OPTIONS.map((option) => {
          const selected = projectScale === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected, busy && styles.buttonDisabled]}
              onPress={() => setProjectScale(option.value)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        {PORTFOLIO_COPY.photosLabel} · {portfolioPhotoCountLabel(draftImages.length)}
      </Text>
      <Pressable
        style={[
          styles.secondaryButton,
          (busy || remainingSlots <= 0) && styles.buttonDisabled,
        ]}
        onPress={() => void handleAddPhotos()}
        disabled={busy || remainingSlots <= 0}
        accessibilityRole="button"
        accessibilityLabel={PORTFOLIO_COPY.addPhotos}
      >
        <Text style={styles.secondaryButtonText}>{PORTFOLIO_COPY.addPhotos}</Text>
      </Pressable>
      {draftImages.length > 0 ? (
        <View style={styles.galleryRow}>
          {draftImages.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.draftThumbWrap}>
              <Image source={{ uri: image.uri }} style={styles.draftThumb} contentFit="cover" />
              {index === 0 ? <Text style={styles.coverBadge}>{PORTFOLIO_COPY.cover}</Text> : null}
              <Pressable
                style={styles.removeThumb}
                onPress={() => removeDraftImage(index)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${PORTFOLIO_COPY.removePhoto} ${index + 1}`}
              >
                <Text style={styles.removeThumbText}>{PORTFOLIO_COPY.removePhoto}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={() => void handleSave(state.workerProfileId)}
        disabled={busy}
        accessibilityRole="button"
      >
        {isSaving ? (
          <ActivityIndicator color={SkillMatchTheme.text.inverse} />
        ) : (
          <Text style={styles.buttonText}>{PORTFOLIO_COPY.save}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function SavedCover({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return <Text style={styles.muted}>{PORTFOLIO_COPY.imageUnavailable}</Text>;
  }
  return (
    <View>
      <Image source={{ uri: image.signedUrl }} style={styles.cover} contentFit="cover" />
      <Text style={styles.coverBadge}>{PORTFOLIO_COPY.cover}</Text>
    </View>
  );
}

function SavedThumb({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.savedThumbFallback}>
        <Text style={styles.muted}>{PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.savedThumb} contentFit="cover" />;
}

const styles = StyleSheet.create({
  container: {
    padding: SkillMatchTheme.spacing.screenGutter,
    gap: SkillMatchTheme.spacing.cardGap,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: SkillMatchTheme.text.primary,
  },
  helper: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    color: SkillMatchTheme.text.primary,
  },
  card: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.text.primary,
  },
  line: {
    fontSize: 14,
    color: SkillMatchTheme.text.primary,
  },
  muted: {
    fontSize: 14,
    color: SkillMatchTheme.text.secondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: SkillMatchTheme.text.secondary,
  },
  input: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: SkillMatchTheme.size.iconTarget,
    backgroundColor: SkillMatchTheme.surface.default,
    color: SkillMatchTheme.text.primary,
  },
  textArea: {
    minHeight: 96,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  galleryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: SkillMatchTheme.radius.input,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  coverBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
  },
  savedThumb: {
    width: 64,
    height: 64,
    borderRadius: SkillMatchTheme.radius.input,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  savedThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: SkillMatchTheme.radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SkillMatchTheme.surface.subtle,
    padding: 4,
  },
  draftThumbWrap: {
    width: 96,
    gap: 4,
  },
  draftThumb: {
    width: 96,
    height: 96,
    borderRadius: SkillMatchTheme.radius.input,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  removeThumb: {
    minHeight: SkillMatchTheme.size.iconTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeThumbText: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  chip: {
    flex: 1,
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: SkillMatchTheme.brand.primaryMuted,
  },
  chipText: { fontSize: 16, color: SkillMatchTheme.text.primary },
  chipTextSelected: { color: SkillMatchTheme.brand.primary, fontWeight: '600' },
  error: { color: SkillMatchTheme.feedback.danger, fontSize: 14 },
  success: { color: SkillMatchTheme.feedback.success, fontSize: 14 },
  button: {
    minHeight: SkillMatchTheme.size.primaryCtaHeight,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.feedback.danger,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: SkillMatchTheme.feedback.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: SkillMatchTheme.text.inverse, fontSize: 16, fontWeight: '600' },
});
