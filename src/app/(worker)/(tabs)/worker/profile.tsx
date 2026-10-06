import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';
import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { AppSegment } from '@/components/app-segment';
import { InlineStatus } from '@/components/inline-status';
import { NavRow } from '@/components/nav-row';
import { InitialsAvatar } from '@/components/initials-avatar';
import { SectionHeader } from '@/components/section-header';
import { SelectedSkillChips } from '@/components/selected-skill-chips';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SurfaceGroup } from '@/components/surface-group';
import { WorkerProfilePhotoPicker } from '@/components/worker-profile-photo-picker';
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
import { WORKER_PROFILE_AVATAR_SIZE, workerProfileHeaderLayout, workerVerificationLabel } from '@/lib/worker-profile';
import {
  getWorkerProfilePhoto,
  loadValidatedWorkerProfilePhoto,
  removeWorkerProfilePhoto,
  replaceWorkerProfilePhoto,
  uploadWorkerProfilePhoto,
} from '@/lib/worker-profile-photo';
import { useAccount } from '@/providers/account-provider';
import {
  PROFICIENCY_OPTIONS,
  useWorkerProfile,
} from '@/providers/worker-profile-provider';



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
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const headerLayout = workerProfileHeaderLayout({ windowWidth, fontScale, gutter: spacing.gutter, avatarGap: spacing.md, columnGap: spacing.sm });
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
      {/* Identity: avatar, then who this Worker is, then how to reach them, with the way to change it right below. */}
      <View style={styles.identity}>
        <View style={styles.identityRow}>
          <InitialsAvatar
            name={account?.full_name ?? 'Worker'}
            accent={colors.accentSubtle}
            size={WORKER_PROFILE_AVATAR_SIZE}
            photoUri={visibleProfilePhoto}
          />
          <View style={[styles.identityBody, headerLayout.columns === 'side-by-side' && styles.identityBodyColumns]}>
            <View
              style={[
                styles.identityCopy,
                headerLayout.columns === 'side-by-side' && { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minWidth: headerLayout.identityMinWidth, maxWidth: headerLayout.identityMaxWidth },
              ]}
            >
              <Text style={styles.identityName} accessibilityRole="header">{account?.full_name ?? '—'}</Text>
              {!isLoading && !loadError ? (
                <Text style={styles.trade}>{profileSkills[0]?.skill_name ?? 'Local service worker'}</Text>
              ) : null}
              {!isLoading && !loadError ? (
                <View
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={verificationLabel}
                  style={styles.badgeWrap}
                >
                  <ProfileIcon tint={isVerified ? colors.success : colors.warning} name={isVerified ? { android: 'verified', ios: 'checkmark.seal.fill' } : { android: 'pending', ios: 'clock' }} />
                  <Text style={[styles.verification, !isVerified && styles.unverified]}>{verificationLabel}</Text>
                </View>
              ) : null}
            </View>
            {/* Contacts take the row's remaining width; at large text they move under the identity instead. */}
            <View style={[styles.contact, headerLayout.columns === 'side-by-side' && { flex: 1, minWidth: headerLayout.contactMinWidth }]}>
              <ContactLine icon={{ android: 'phone', ios: 'phone' }} label="Phone" value={account?.phone ?? null} />
              <ContactLine icon={{ android: 'mail_outline', ios: 'envelope' }} label="Email" value={account?.email ?? null} />
              <ContactLine icon={{ android: 'location_on', ios: 'mappin' }} label="Area" value={account ? `${account.barangay}, ${account.city}` : null} />
            </View>
          </View>
        </View>
        {!isLoading && !loadError ? (
          <View>
            <AppButton
              variant="secondary"
              label="Edit profile"
              icon={{ android: isEditing ? 'expand_less' : 'edit', ios: isEditing ? 'chevron.up' : 'pencil' }}
              onPress={() => setIsEditing((open) => !open)}
              expanded={isEditing}
            />
            {/* Closed, the editor stays mounted (unsaved bio and photo state survive) but takes no space. */}
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
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <InlineStatus variant="loading" message="Loading your profile…" />
      ) : loadError ? (
        <InlineStatus variant="error" message={loadError} />
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title="Work skills" trailing={<Text style={styles.moreSkills}>{profileSkills.length} skills</Text>} />
            {profileSkills.length === 0 ? (
              <Text style={styles.value}>No skills added yet.</Text>
            ) : (
              <View style={styles.skillSummary}>
                {profileSkills.slice(0, 3).map((skill) => (
                  <AppChip key={skill.id} label={skill.skill_name} variant="neutral" />
                ))}
                {profileSkills.length > 3 ? (
                  <Text style={styles.moreSkills}>+{profileSkills.length - 3} more</Text>
                ) : null}
              </View>
            )}
          </View>

          {bio.trim() ? (
            <View style={styles.section}>
              <SectionHeader title="About me" />
              <Text style={styles.value}>{bio}</Text>
            </View>
          ) : null}

          {/* Professional identity: the work examples, resume and skill guidance that back the skills. */}
          <View style={styles.section}>
            <SectionHeader title="Professional identity" subtitle="Your work examples, resume and skill guidance." />
            <SurfaceGroup inset={spacing.lg}>
              <NavRow
                label="View portfolio"
                hint="Work examples behind your skills"
                icon={{ android: 'photo_library', ios: 'photo.on.rectangle' }}
                disabled={busy}
                onPress={() => router.push(PORTFOLIO_PATH as Href)}
              />
              <NavRow
                label="Resume builder"
                hint="Build a PDF of your experience and skills"
                icon={{ android: 'description', ios: 'doc.text' }}
                disabled={busy}
                onPress={() => router.push('/worker/resume' as Href)}
              />
              <NavRow
                label="Skill guidance"
                hint="Review skill gaps in current opportunities"
                icon={{ android: 'work_outline', ios: 'briefcase' }}
                disabled={busy}
                onPress={() => router.push('/worker/skill-gap' as Href)}
              />
            </SurfaceGroup>
          </View>

          <Modal
            visible={isAddingSkills}
            animationType="slide"
            onRequestClose={closeAddSkillsWithoutApply}
          >
            <KeyboardAvoidingView
              style={styles.modalFlex}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View
                style={[
                  styles.modalScreen,
                  { paddingTop: insets.top + spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) },
                ]}
              >
                <Text style={styles.modalTitle}>Manage skills</Text>
                <ScrollView
                  style={styles.modalFlex}
                  contentContainerStyle={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <SelectedSkillChips
                    skills={selectedCatalogSkills(skills, Object.keys(modalWorkingSelection))}
                    onRemove={(skillId) =>
                      setModalWorkingSelection((current) => toggleSkillInSelection(current, skillId))
                    }
                    disabled={busy}
                    renderAfterSkill={(skill) => {
                      const level = modalWorkingSelection[skill.id];
                      if (level === undefined) return null;
                      return (
                        <AppSegment
                          options={PROFICIENCY_OPTIONS}
                          value={level}
                          onChange={(next) =>
                            setModalWorkingSelection((current) => ({ ...current, [skill.id]: next }))
                          }
                          disabled={busy}
                          accessibilityLabel={`${skill.skill_name} proficiency`}
                        />
                      );
                    }}
                  />
                  <SkillCatalogPicker
                    skills={skills}
                    query={modalQuery}
                    onQueryChange={setModalQuery}
                    isSkillSelected={(skillId) => modalWorkingSelection[skillId] !== undefined}
                    onToggleSkill={(skillId) =>
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

      {/* Support and account actions; contact details live with the identity above. */}
      <View style={styles.section}>
        <SectionHeader title="Account and support" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow label="Help and FAQ" hint="Common questions" icon={{ android: 'help_outline', ios: 'questionmark.circle' }} disabled={busy} onPress={() => router.push('/worker/help' as Href)} />
          <NavRow label="My reports" hint="Reports you submitted" icon={{ android: 'flag', ios: 'flag' }} disabled={busy} onPress={() => router.push('/worker/my-reports' as unknown as Href)} />
          <NavRow label="Report an app issue" hint="Send an app issue report" icon={{ android: 'warning', ios: 'exclamationmark.triangle' }} disabled={busy} onPress={() => router.push('/worker/report-app' as unknown as Href)} />
          <NavRow label="Terms and conditions" hint="Draft — not final legal text" icon={{ android: 'description', ios: 'doc.text' }} disabled={busy} onPress={() => router.push('/worker/terms' as Href)} />
          <NavRow label="Privacy policy" hint="Draft — not final legal text" icon={{ android: 'lock', ios: 'lock' }} disabled={busy} onPress={() => router.push('/worker/privacy' as Href)} />
        </SurfaceGroup>
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
    </ScrollView>
  );
}

/** One contact detail beside the identity: a quiet glyph and the copyable value. Empty values render nothing. */
function ContactLine({ icon, label, value }: { icon: SymbolViewProps['name']; label: string; value: string | null }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  if (!value) return null;
  return (
    <View style={styles.contactLine} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.contactIcon}><ProfileIcon tint={ui.colors.textSecondary} name={icon} size={CONTACT_ICON_SIZE} /></View>
      <Text selectable style={styles.contactText}>{value}</Text>
    </View>
  );
}

const CONTACT_ICON_SIZE = 18;

function ProfileIcon({ name, tint, size = 20 }: { name: SymbolViewProps['name']; tint?: string; size?: number }) {
  const ui = useUiTheme();
  const { colors } = ui;

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <SymbolView name={name} size={size} tintColor={tint ?? colors.accent} />
    </View>
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
    trade: { ...type.bodyEmphasis, color: colors.textPrimary },
    identity: { gap: spacing.md },
    identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    contact: { gap: spacing.xs },
    editor: { gap: spacing.md, marginTop: spacing.lg },
    // Keep Yoga children in the layout tree; only the height collapses.
    editorHidden: { maxHeight: 0, overflow: 'hidden', marginTop: 0 },
    contactLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    // Centres the compact glyph on the first 24dp body line, so it stays aligned when a value wraps.
    contactIcon: { paddingTop: (type.body.lineHeight - CONTACT_ICON_SIZE) / 2 },
    contactText: { ...type.body, color: colors.textSecondary, flex: 1, minWidth: 0 },
    identityBody: { flex: 1, minWidth: 0, gap: spacing.md },
    identityBodyColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    identityCopy: { minWidth: 0, gap: spacing.xs },
    identityName: {
      ...type.screenTitle,
      color: colors.textPrimary,
    },
    badgeWrap: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    verification: { ...type.label, color: colors.success, flexShrink: 1 },
    unverified: { color: colors.warning },
    value: {
      ...type.body,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    skillSummary: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
    },
    moreSkills: {
      ...type.helper,
      color: colors.textSecondary,
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
