import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { NavRow } from '@/components/nav-row';
import { ProfileFooter, ProfileHero, type ProfileHeroBadge } from '@/components/profile-hero';
import { ProfileQuickActions } from '@/components/profile-quick-actions';
import { SectionHeader } from '@/components/section-header';
import { SelectedSkillChips } from '@/components/selected-skill-chips';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SurfaceGroup } from '@/components/surface-group';
import { WorkerProfilePhotoPicker } from '@/components/worker-profile-photo-picker';
import { WorkerStrikeStatus } from '@/components/worker-strike-status';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import {
  copySkillSelection,
  hasSkillSelectionChanged,
  selectedCatalogSkills,
  toggleSkillInSelection,
  type SkillSelectionMap,
} from '@/lib/skill-catalog';
import { PORTFOLIO_PATH } from '@/lib/portfolio';
import { signOutCurrentUser } from '@/lib/sign-out';
import { workerVerificationLabel } from '@/lib/worker-profile';
import {
  getWorkerProfilePhoto,
  loadValidatedWorkerProfilePhoto,
  removeWorkerProfilePhoto,
  replaceWorkerProfilePhoto,
  uploadWorkerProfilePhoto,
} from '@/lib/worker-profile-photo';
import { loadMyWorkerStats, workerRatingLabel, workerStrikesLabel, type WorkerProfileStats } from '@/lib/worker-profile-stats';
import { useAccount } from '@/providers/account-provider';
import { useWorkerProfile } from '@/providers/worker-profile-provider';



const SKILL_CONFIRMATION = {
  title: 'Confirm selected skills?',
  body: "Please confirm that you have experience performing the skills you've selected. These skills will appear on your profile and may be used to match you with relevant job opportunities.",
  cancel: 'Cancel',
  confirm: 'Confirm skills',
} as const;

export default function WorkerProfile() {
  return <RefinementThemeProvider><WorkerProfileContent /></RefinementThemeProvider>;
}

function WorkerProfileContent() {
  const ui = useUiTheme();
  const { colors, spacing } = ui;
  const styles = createStyles(ui);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const {
    isLoading,
    loadError,
    skills,
    bio,
    setBio,
    selection,
    persistedSelection,
    isVerified,
    isSaving,
    isPersistingAvailability,
    saveError,
    saveSuccess,
    handleSave,
  } = useWorkerProfile();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isAddingSkills, setIsAddingSkills] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const [modalWorkingSelection, setModalWorkingSelection] = useState<SkillSelectionMap>({});
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [profilePhotoStatus, setProfilePhotoStatus] = useState<
    'loading' | 'available' | 'missing' | 'unavailable'
  >('loading');
  const [isProfilePhotoBusy, setIsProfilePhotoBusy] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(null);
  const busy = isSaving || isSigningOut || isPersistingAvailability;
  const verificationLabel = workerVerificationLabel(isVerified);
  const profileSkills = selectedCatalogSkills(skills, Object.keys(persistedSelection));
  const workerUserId = account?.is_active && account.role === 'worker' ? account.id : undefined;
  const [photoOwner, setPhotoOwner] = useState<string | undefined>(undefined);
  const photoReadEpoch = useRef(0);
  const visibleProfilePhoto = photoOwner === workerUserId ? profilePhotoUri : null;
  // The hero's rating and strikes belong to the account that read them, like the photo.
  const [stats, setStats] = useState<{ owner: string; value: WorkerProfileStats } | null>(null);
  const visibleStats = stats && stats.owner === workerUserId ? stats.value : null;
  const profileReady = !isLoading && !loadError;
  const area = account ? [account.barangay, account.city].filter(Boolean).join(', ') : '';
  const badges: ProfileHeroBadge[] = [];
  if (profileReady) {
    badges.push({
      label: verificationLabel,
      icon: isVerified ? { android: 'verified', ios: 'checkmark.seal.fill' } : { android: 'hourglass_empty', ios: 'hourglass' },
      statusColor: isVerified ? colors.success : colors.warning,
    });
  }
  if (area) badges.push({ label: area, accessibilityLabel: `Area: ${area}`, icon: { android: 'location_on', ios: 'mappin' }, selectable: true });

  const refreshProfilePhoto = useCallback(async () => {
    if (!workerUserId) {
      setProfilePhotoUri(null);
      setProfilePhotoStatus('missing');
      return;
    }
    const epoch = ++photoReadEpoch.current;
    const result = await getWorkerProfilePhoto(workerUserId);
    if (epoch !== photoReadEpoch.current || AppState.currentState !== 'active') return;
    setPhotoOwner(workerUserId);
    if (result.status === 'available') {
      setProfilePhotoUri(result.signedUrl);
      setProfilePhotoStatus('available');
      return;
    }
    setProfilePhotoUri(null);
    setProfilePhotoStatus(result.reason);
  }, [workerUserId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setProfilePhotoUri(null);
      setProfilePhotoStatus('loading');
      void refreshProfilePhoto().catch(() => {
        if (!cancelled) {
          setProfilePhotoUri(null);
          setProfilePhotoStatus('unavailable');
        }
      });
      const subscription = AppState.addEventListener('change', (next) => {
        photoReadEpoch.current++;
        setProfilePhotoUri(null);
        if (next === 'active') {
          setProfilePhotoStatus('loading');
          void refreshProfilePhoto().catch(() => {
            if (!cancelled) setProfilePhotoStatus('unavailable');
          });
        }
      });
      return () => {
        cancelled = true;
        photoReadEpoch.current++;
        subscription.remove();
      };
    }, [refreshProfilePhoto])
  );

  // Ratings and strikes change outside this screen, so they are read again each time Profile is shown.
  useFocusEffect(
    useCallback(() => {
      if (!workerUserId) return undefined;
      let cancelled = false;
      void loadMyWorkerStats(workerUserId).then((value) => {
        if (!cancelled) setStats({ owner: workerUserId, value });
      });
      return () => {
        cancelled = true;
      };
    }, [workerUserId])
  );

  async function handleProfilePhotoSelected(asset: { uri: string }) {
    if (!account?.id || isProfilePhotoBusy || profilePhotoStatus === 'unavailable') return;
    setIsProfilePhotoBusy(true);
    setProfilePhotoError(null);
    try {
      const checked = await loadValidatedWorkerProfilePhoto(asset.uri);
      if (!checked.ok) {
        setProfilePhotoError(
          checked.reason === 'too_large'
            ? 'Choose a photo that is 5 MiB or smaller.'
            : checked.reason === 'unsupported_type'
              ? 'Choose a JPEG, PNG, or WebP image.'
              : 'The selected photo could not be read. Choose another photo.'
        );
        return;
      }
      if (profilePhotoStatus === 'available') {
        await replaceWorkerProfilePhoto({ workerUserId: account.id, image: checked.image });
      } else {
        await uploadWorkerProfilePhoto({ workerUserId: account.id, image: checked.image });
      }
      await refreshProfilePhoto();
    } catch {
      setProfilePhotoError('Your profile photo could not be updated. Please try again.');
    } finally {
      setIsProfilePhotoBusy(false);
    }
  }

  async function handleProfilePhotoRemove() {
    if (!account?.id || isProfilePhotoBusy || profilePhotoStatus !== 'available') return;
    setIsProfilePhotoBusy(true);
    setProfilePhotoError(null);
    try {
      await removeWorkerProfilePhoto(account.id);
      setProfilePhotoUri(null);
      setProfilePhotoStatus('missing');
    } catch {
      setProfilePhotoError('Your profile photo could not be removed. Please try again.');
    } finally {
      setIsProfilePhotoBusy(false);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await signOutCurrentUser();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  function openAddSkills() {
    if (busy) return;
    setModalWorkingSelection(copySkillSelection(selection));
    setModalQuery('');
    setIsAddingSkills(true);
  }

  function closeAddSkillsWithoutApply() {
    setIsAddingSkills(false);
    setModalQuery('');
    setModalWorkingSelection({});
  }

  function saveManagedSkills() {
    if (busy) return;
    Alert.alert(SKILL_CONFIRMATION.title, SKILL_CONFIRMATION.body, [
      { text: SKILL_CONFIRMATION.cancel, style: 'cancel' },
      {
        text: SKILL_CONFIRMATION.confirm,
        onPress: () => void handleSave(modalWorkingSelection).then((saved) => {
          if (saved) closeAddSkillsWithoutApply();
        }),
      },
    ]);
  }

  function promptSave() {
    if (busy) return;
    if (!hasSkillSelectionChanged(selection, persistedSelection)) {
      void handleSave();
      return;
    }
    Alert.alert(SKILL_CONFIRMATION.title, SKILL_CONFIRMATION.body, [
      { text: SKILL_CONFIRMATION.cancel, style: 'cancel' },
      { text: SKILL_CONFIRMATION.confirm, onPress: () => void handleSave() },
    ]);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {/* The hero and its editor share one block, so the closed editor adds no gap. */}
      <View>
        <ProfileHero
          name={account?.full_name ?? '—'}
          role={profileReady ? `Worker · ${profileSkills[0]?.skill_name ?? 'Local service worker'}` : 'Worker'}
          photoUri={visibleProfilePhoto}
          badges={badges}
          stats={[
            { label: 'Rating', value: visibleStats ? workerRatingLabel(visibleStats.ratingAvg) : null },
            { label: 'Skills', value: profileReady ? String(profileSkills.length) : null },
            { label: 'Strikes', value: visibleStats ? workerStrikesLabel(visibleStats.strikeCount) : null },
          ]}
          action={profileReady ? {
            label: 'Edit profile',
            icon: { android: isEditing ? 'expand_less' : 'edit', ios: isEditing ? 'chevron.up' : 'pencil' },
            onPress: () => setIsEditing((open) => !open),
            expanded: isEditing,
          } : undefined}
        />
        {profileReady ? (
          // Closed, the editor stays mounted (unsaved bio and photo state survive) but takes no space.
          <View
            style={[styles.editor, !isEditing && styles.editorHidden]}
            pointerEvents={isEditing ? 'auto' : 'none'}
            accessibilityElementsHidden={!isEditing}
            importantForAccessibility={isEditing ? 'auto' : 'no-hide-descendants'}
          >
            <AppField
              label="About me"
              value={bio}
              onChangeText={setBio}
              placeholder="Tell clients about your work experience."
              multiline
              numberOfLines={4}
              editable={!busy}
              accessibilityLabel="About me"
            />
            <WorkerProfilePhotoPicker
              photoUri={visibleProfilePhoto}
              onPhotoSelected={(asset) => void handleProfilePhotoSelected(asset)}
              onRemove={() => void handleProfilePhotoRemove()}
              validationMessage={
                profilePhotoStatus === 'unavailable'
                  ? 'Your profile photo is unavailable right now. Your initials will be shown.'
                  : profilePhotoError
              }
              disabled={busy || !account || profilePhotoStatus === 'unavailable'}
              busy={isProfilePhotoBusy || profilePhotoStatus === 'loading'}
              helpText="Optional. Choose one JPEG, PNG, or WebP image up to 5 MiB from your gallery."
            />
            <AppButton
              variant="secondary"
              label="Manage skills"
              icon={{ android: 'handyman', ios: 'wrench.and.screwdriver' }}
              onPress={openAddSkills}
              disabled={busy}
              accessibilityLabel="Manage skills"
            />
            {saveError ? <AppNotice variant="danger" message={saveError} /> : null}
            {saveSuccess ? <AppNotice variant="success" message={saveSuccess} /> : null}
            <AppButton
              variant="primary"
              label="Save profile"
              icon={{ android: 'check', ios: 'checkmark' }}
              onPress={promptSave}
              loading={isSaving}
              disabled={busy}
            />
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <InlineStatus variant="loading" skeleton="detail" message="Loading your profile…" />
      ) : loadError ? (
        <InlineStatus variant="error" message={loadError} />
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title="Work skills" />
            {profileSkills.length === 0 ? (
              <Text style={styles.value}>No skills added yet.</Text>
            ) : (
              // One row that scrolls sideways when the skills don't fit (owner 2026-11-06).
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityLabel="Work skills"
                style={styles.skillCarousel}
                contentContainerStyle={styles.skillChips}
              >
                {profileSkills.map((skill) => (
                  <AppChip key={skill.id} label={skill.skill_name} variant="neutral" />
                ))}
              </ScrollView>
            )}
          </View>

          {bio.trim() ? (
            <View style={styles.section}>
              <SectionHeader title="About me" />
              <Text style={styles.value}>{bio}</Text>
            </View>
          ) : null}

          {account ? <WorkerStrikeStatus userId={account.id} /> : null}

          <View style={styles.section}>
            <SectionHeader title="Portfolio and resume" />
            <ProfileQuickActions
              actions={[
                { label: 'Portfolio', hint: 'Work examples', icon: { android: 'photo_library', ios: 'photo.on.rectangle' }, disabled: busy, onPress: () => router.push(PORTFOLIO_PATH as Href) },
                { label: 'Portfolio files', hint: 'Your projects as files', icon: { android: 'content_copy', ios: 'doc.on.doc' }, disabled: busy, onPress: () => router.push('/worker/portfolio-files' as Href) },
                { label: 'Resume', hint: 'Printable PDF', icon: { android: 'description', ios: 'doc.text' }, disabled: busy, onPress: () => router.push('/worker/resume' as Href) },
                { label: 'Resume details', hint: 'Education and past jobs', icon: { android: 'badge', ios: 'person.text.rectangle' }, disabled: busy, onPress: () => router.push('/worker/resume-details' as Href) },
              ]}
            />
          </View>

          <Modal
            visible={isAddingSkills}
            animationType="slide"
            onRequestClose={closeAddSkillsWithoutApply}
          >
            <KeyboardAvoidingView
              style={styles.modalFlex}
              behavior="padding"
            >
              <View
                style={[
                  styles.modalScreen,
                  { paddingTop: insets.top + spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) },
                ]}
              >
                <Text style={styles.modalTitle}>Manage skills</Text>
                <AppField variant="search" value={modalQuery} onChangeText={setModalQuery} accessibilityLabel="Search skills"
                  placeholder="Search skills" autoCapitalize="none" autoCorrect={false} disabled={busy} />
                <ScrollView
                  style={styles.modalFlex}
                  contentContainerStyle={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                >
                  <SkillCatalogPicker
                    hideSearch
                    skills={skills}
                    query={modalQuery}
                    onQueryChange={setModalQuery}
                    isSkillSelected={(skillId) => modalWorkingSelection[skillId] !== undefined}
                    onToggleSkill={(skillId) =>
                      setModalWorkingSelection((current) => toggleSkillInSelection(current, skillId))
                    }
                    disabled={busy}
                  />
                  <SelectedSkillChips
                    skills={selectedCatalogSkills(skills, Object.keys(modalWorkingSelection))}
                    onRemove={(skillId) =>
                      setModalWorkingSelection((current) => toggleSkillInSelection(current, skillId))
                    }
                    disabled={busy}
                  />
                </ScrollView>
                <AppButton
                  variant="primary"
                  label="Save"
                  onPress={saveManagedSkills}
                  disabled={busy}
                  accessibilityLabel="Save skills"
                />
                <AppButton
                  variant="secondary"
                  label="Cancel"
                  onPress={closeAddSkillsWithoutApply}
                  disabled={busy}
                  accessibilityLabel="Cancel"
                />
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </>
      )}

      {/* Contact: only the details the account carries; a missing one leaves no empty row. */}
      {account?.phone || account?.email ? (
        <View style={styles.section}>
          <SectionHeader title="Contact" />
          <SurfaceGroup>
            {account.phone ? <FactRow icon={{ android: 'phone', ios: 'phone' }} label="Phone" value={account.phone} selectable /> : null}
            {account.email ? <FactRow icon={{ android: 'mail_outline', ios: 'envelope' }} label="Email" value={account.email} selectable /> : null}
          </SurfaceGroup>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Settings and support" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow label="Settings" hint="Notifications, map and password" icon={{ android: 'settings', ios: 'gearshape' }} disabled={busy} onPress={() => router.push('/worker/settings' as unknown as Href)} />
          <NavRow label="Help and FAQ" hint="Common questions" icon={{ android: 'help_outline', ios: 'questionmark.circle' }} disabled={busy} onPress={() => router.push('/worker/help' as Href)} />
          <NavRow label="My reports" hint="Reports you submitted" icon={{ android: 'flag', ios: 'flag' }} disabled={busy} onPress={() => router.push('/worker/my-reports' as unknown as Href)} />
          <NavRow label="Report an app issue" hint="Send an app issue report" icon={{ android: 'warning', ios: 'exclamationmark.triangle' }} disabled={busy} onPress={() => router.push('/worker/report-app' as unknown as Href)} />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <AppButton
          variant="secondary"
          label="Sign out"
          icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
          onPress={handleSignOut}
          loading={isSigningOut}
          disabled={busy}
        />
        {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
      </View>

      <ProfileFooter />
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  const styles = StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    content: {
      flexGrow: 1,
      backgroundColor: colors.canvas,
      padding: spacing.gutter,
      gap: spacing.xl,
      paddingBottom: spacing.xxxxl,
    },
    section: { gap: spacing.md },
    editor: { gap: spacing.md, marginTop: spacing.lg },
    // Keep Yoga children in the layout tree; only the height collapses.
    editorHidden: { maxHeight: 0, overflow: 'hidden', marginTop: 0 },
    value: {
      ...type.body,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    // Runs edge to edge so a cut-off chip shows there is more to swipe.
    skillCarousel: {
      flexGrow: 0,
      marginHorizontal: -spacing.gutter,
    },
    skillChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.gutter,
    },
    modalFlex: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    modalScreen: {
      flex: 1,
      paddingHorizontal: spacing.gutter,
      gap: spacing.md,
      backgroundColor: colors.canvas,
    },
    modalTitle: {
      ...type.screenTitle,
      color: colors.textPrimary,
    },
    modalContent: {
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
  });

  return styles;
}
