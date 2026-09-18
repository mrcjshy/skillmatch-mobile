import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { AppSegment } from '@/components/app-segment';
import { AvailabilityControl } from '@/components/availability-control';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SelectedSkillChips } from '@/components/selected-skill-chips';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { WorkerIdentitySection } from '@/components/worker-identity-section';
import { SkillMatchTheme } from '@/constants/theme';
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
import { useAccount } from '@/providers/account-provider';
import {
  PROFICIENCY_OPTIONS,
  useWorkerProfile,
} from '@/providers/worker-profile-provider';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

const SKILL_CONFIRMATION = {
  title: 'Confirm selected skills?',
  body: "Please confirm that you have experience performing the skills you've selected. These skills will appear on your profile and may be used to match you with relevant job opportunities.",
  cancel: 'Cancel',
  confirm: 'Confirm Skills',
} as const;

export default function WorkerProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const {
    isLoading,
    loadError,
    skills,
    bio,
    setBio,
    availability,
    setAvailability,
    selection,
    persistedSelection,
    applySkillDraft,
    isVerified,
    isSaving,
    saveError,
    saveSuccess,
    toggleSkill,
    setProficiency,
    handleSave,
  } = useWorkerProfile();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isAddingSkills, setIsAddingSkills] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const [modalWorkingSelection, setModalWorkingSelection] = useState<SkillSelectionMap>({});
  const busy = isSaving || isSigningOut;
  const verificationLabel = workerVerificationLabel(isVerified);
  const selectedSkills = selectedCatalogSkills(skills, Object.keys(selection));

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

  function confirmAddSkills() {
    applySkillDraft(modalWorkingSelection);
    closeAddSkillsWithoutApply();
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
      keyboardShouldPersistTaps="handled"
    >
      <AppCard>
        <Text style={styles.identityName}>{account?.full_name ?? '—'}</Text>
        {!isLoading && !loadError ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={verificationLabel}
            style={styles.badgeWrap}
          >
            <AppChip
              label={verificationLabel}
              variant={isVerified ? 'positive' : 'warning'}
            />
          </View>
        ) : null}
        <Text style={styles.location}>
          {account ? `${account.barangay}, ${account.city}` : '—'}
        </Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{account?.phone ?? '—'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{account?.email ?? '—'}</Text>
      </AppCard>

      {isLoading ? (
        <InlineStatus variant="loading" message="Loading your profile…" />
      ) : loadError ? (
        <InlineStatus variant="error" message={loadError} />
      ) : (
        <>
          <SectionHeader title="Worker profile" />
          <AppField
            label="About Me"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell clients about your work experience."
            multiline
            numberOfLines={4}
            editable={!busy}
            accessibilityLabel="About Me"
          />

          <Text style={styles.fieldLabel}>Availability</Text>
          <AvailabilityControl value={availability} onChange={setAvailability} disabled={busy} />

          <WorkerIdentitySection disabled={busy} surface="profile" />

          <SectionHeader title="Skills" />
          <SelectedSkillChips
            skills={selectedSkills}
            onRemove={toggleSkill}
            disabled={busy}
            renderAfterSkill={(skill) => {
              const level = selection[skill.id];
              if (level === undefined) return null;
              return (
                <AppSegment
                  options={PROFICIENCY_OPTIONS}
                  value={level}
                  onChange={(next) => setProficiency(skill.id, next)}
                  disabled={busy}
                  accessibilityLabel={`${skill.skill_name} proficiency`}
                />
              );
            }}
          />
          <AppButton
            variant="secondary"
            label="+ Add Skills"
            onPress={openAddSkills}
            disabled={busy}
            accessibilityLabel="Add Skills"
          />

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
                <Text style={styles.modalTitle}>Add Skills</Text>
                <ScrollView
                  style={styles.modalFlex}
                  contentContainerStyle={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                >
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
                  label="Done"
                  onPress={confirmAddSkills}
                  disabled={busy}
                  accessibilityLabel="Done"
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

          {saveError ? <AppNotice variant="danger" message={saveError} /> : null}
          {saveSuccess ? <AppNotice variant="success" message={saveSuccess} /> : null}

          <AppButton
            variant="primary"
            label="Save Profile"
            onPress={promptSave}
            loading={isSaving}
            disabled={busy}
          />
        </>
      )}

      <SectionHeader title="Tools / Support" />
      <AppCard>
        <NavRow
          label="Resume Builder"
          hint="Make a PDF resume"
          disabled={busy}
          onPress={() => router.push('/worker/resume' as Href)}
        />
        <NavRow
          label="Portfolio"
          hint="Past projects"
          disabled={busy}
          onPress={() => router.push(PORTFOLIO_PATH as Href)}
        />
        <NavRow
          label="Help & FAQ"
          hint="Common questions"
          disabled={busy}
          onPress={() => router.push('/worker/help' as Href)}
        />
        <NavRow
          label="My Reports"
          hint="Reports you submitted"
          disabled={busy}
          onPress={() => router.push('/worker/my-reports' as unknown as Href)}
        />
        <NavRow
          label="Report an app issue"
          hint="Send an app issue report"
          disabled={busy}
          onPress={() => router.push('/worker/report-app' as unknown as Href)}
        />
        <NavRow
          label="Terms and Conditions"
          hint="Draft — not final legal text"
          disabled={busy}
          onPress={() => router.push('/worker/terms' as Href)}
        />
        <NavRow
          label="Privacy Policy"
          hint="Draft — not final legal text"
          disabled={busy}
          last
          onPress={() => router.push('/worker/privacy' as Href)}
        />
      </AppCard>

      <SectionHeader title="Account" />
      <AppButton
        variant="secondary"
        label="Sign Out"
        onPress={handleSignOut}
        loading={isSigningOut}
        disabled={busy}
      />
      {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
    </ScrollView>
  );
}

function NavRow({
  label,
  hint,
  disabled,
  last,
  onPress,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.navRow, !last && styles.navRowBorder, disabled && styles.navDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.navCopy}>
        <Text style={styles.navLabel}>{label}</Text>
        <Text style={styles.navHint}>{hint}</Text>
      </View>
      <Text style={styles.navChevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
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
  identityName: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  location: {
    ...type.helper,
    color: colors.textSecondary,
  },
  label: {
    ...type.helper,
    color: colors.textSecondary,
  },
  value: {
    ...type.body,
    color: colors.textPrimary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  navRow: {
    minHeight: size.listRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navCopy: { flex: 1, gap: 2 },
  navLabel: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  navHint: {
    ...type.helper,
    color: colors.textSecondary,
  },
  navChevron: {
    fontSize: 22,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  navDisabled: { opacity: 0.4 },
  modalFlex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalScreen: {
    flex: 1,
    paddingHorizontal: spacing.gutter,
    gap: spacing.md,
    backgroundColor: colors.background,
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
