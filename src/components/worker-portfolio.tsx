import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
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

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

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
        <InlineStatus variant="loading" message={PORTFOLIO_COPY.loading} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={PORTFOLIO_COPY.loadFailed}
          action={
            <AppButton
              label={PORTFOLIO_COPY.retry}
              variant="secondary"
              onPress={retry}
              accessibilityLabel={PORTFOLIO_COPY.retry}
            />
          }
        />
      </View>
    );
  }

  if (state.kind === 'no-profile') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="empty" message={PORTFOLIO_COPY.noProfile} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.helper}>{PORTFOLIO_COPY.helper}</Text>

      {state.items.length === 0 ? (
        <InlineStatus variant="empty" message={PORTFOLIO_COPY.empty} />
      ) : (
        state.items.map((item) => {
          const cover = coverImage(item.images);
          const rest = galleryImages(item.images);
          return (
            <AppCard key={item.id}>
              {cover ? <SavedCover image={cover} /> : null}
              {rest.length > 0 ? (
                <View style={styles.galleryRow}>
                  {rest.map((image) => (
                    <SavedThumb key={image.id} image={image} />
                  ))}
                </View>
              ) : null}
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.meta}>{projectScaleLabel(item.projectScale)}</Text>
              {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
              <AppButton
                label={PORTFOLIO_COPY.delete}
                variant="destructive"
                onPress={() => promptDelete(state.workerProfileId, item)}
                disabled={busy}
                loading={deletingId === item.id}
                accessibilityLabel={`${PORTFOLIO_COPY.delete} ${item.title}`}
              />
            </AppCard>
          );
        })
      )}

      <View style={styles.section}>
        <SectionHeader title={PORTFOLIO_COPY.add} />
        <AppField
          label={PORTFOLIO_COPY.titleLabel}
          value={title}
          onChangeText={setTitle}
          disabled={busy}
          maxLength={PORTFOLIO_TITLE_MAX}
          accessibilityLabel={PORTFOLIO_COPY.titleLabel}
        />
        <AppField
          label={PORTFOLIO_COPY.descriptionLabel}
          value={description}
          onChangeText={setDescription}
          disabled={busy}
          multiline
          accessibilityLabel={PORTFOLIO_COPY.descriptionLabel}
        />

        <Text style={styles.label}>{PORTFOLIO_COPY.scaleLabel}</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {PROJECT_SCALE_OPTIONS.map((option) => {
            const selected = projectScale === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setProjectScale(option.value)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: busy }}
                accessibilityLabel={option.label}
                style={busy ? styles.chipDisabled : undefined}
              >
                <AppChip label={option.label} variant={selected ? 'selected' : 'neutral'} />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>
          {PORTFOLIO_COPY.photosLabel} · {portfolioPhotoCountLabel(draftImages.length)}
        </Text>
        <AppButton
          label={PORTFOLIO_COPY.addPhotos}
          variant="secondary"
          onPress={() => void handleAddPhotos()}
          disabled={busy || remainingSlots <= 0}
          accessibilityLabel={PORTFOLIO_COPY.addPhotos}
        />
        {draftImages.length > 0 ? (
          <View style={styles.galleryRow}>
            {draftImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.draftThumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.draftThumb} contentFit="cover" />
                {index === 0 ? (
                  <AppChip label={PORTFOLIO_COPY.cover} variant="selected" style={styles.coverChip} />
                ) : null}
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

        {formError ? <AppNotice variant="danger" message={formError} /> : null}
        {success ? <AppNotice variant="success" message={success} /> : null}

        <AppButton
          label={PORTFOLIO_COPY.save}
          variant="primary"
          onPress={() => void handleSave(state.workerProfileId)}
          disabled={busy}
          loading={isSaving}
          accessibilityLabel={PORTFOLIO_COPY.save}
        />
      </View>
    </ScrollView>
  );
}

function SavedCover({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.coverFallback}>
        <Text style={styles.meta}>{PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return (
    <View style={styles.coverBlock}>
      <Image source={{ uri: image.signedUrl }} style={styles.cover} contentFit="cover" />
      <AppChip label={PORTFOLIO_COPY.cover} variant="selected" style={styles.coverChip} />
    </View>
  );
}

function SavedThumb({ image }: { image: PortfolioItemImage }) {
  if (image.signedUrl === null) {
    return (
      <View style={styles.savedThumbFallback}>
        <Text style={styles.fallbackText}>{PORTFOLIO_COPY.imageUnavailable}</Text>
      </View>
    );
  }
  return <Image source={{ uri: image.signedUrl }} style={styles.savedThumb} contentFit="cover" />;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  helper: {
    ...type.helper,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.md,
  },
  itemTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  body: {
    ...type.body,
    color: colors.textPrimary,
  },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  galleryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  coverBlock: {
    gap: spacing.xs,
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  coverFallback: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderCurve: 'continuous',
  },
  coverChip: {
    alignSelf: 'flex-start',
  },
  savedThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  savedThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.xs,
    borderCurve: 'continuous',
  },
  fallbackText: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  draftThumbWrap: {
    width: 96,
    gap: spacing.xs,
  },
  draftThumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderCurve: 'continuous',
  },
  removeThumb: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeThumbText: {
    ...type.helper,
    fontWeight: '600',
    color: colors.danger,
  },
  chipDisabled: {
    opacity: 0.6,
  },
});
