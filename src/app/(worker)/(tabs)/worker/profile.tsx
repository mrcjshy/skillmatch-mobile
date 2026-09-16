import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvailabilityControl } from '@/components/availability-control';
import { SelectedSkillChips } from '@/components/selected-skill-chips';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.identityName}>{account?.full_name ?? '—'}</Text>
        {!isLoading && !loadError ? (
          <View
            style={[styles.badge, isVerified ? styles.badgeVerified : styles.badgePending]}
            accessibilityRole="text"
            accessibilityLabel={verificationLabel}
          >
            <Text style={[styles.badgeText, isVerified ? styles.badgeTextVerified : styles.badgeTextPending]}>
              {verificationLabel}
            </Text>
          </View>
        ) : null}
        <Text style={styles.location}>
          {account ? `${account.barangay}, ${account.city}` : '—'}
        </Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{account?.phone ?? '—'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{account?.email ?? '—'}</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>Loading your profile…</Text>
        </View>
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Worker profile</Text>
          <Text style={styles.fieldLabel}>About Me</Text>
          <TextInput
            style={styles.textArea}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell clients about your work experience."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!busy}
            accessibilityLabel="About Me"
          />

          <Text style={styles.fieldLabel}>Availability</Text>
          <AvailabilityControl value={availability} onChange={setAvailability} disabled={busy} />

          <Text style={styles.sectionTitle}>Skills</Text>
          <SelectedSkillChips
            skills={selectedSkills}
            onRemove={toggleSkill}
            disabled={busy}
            renderAfterSkill={(skill) => {
              const level = selection[skill.id];
              if (level === undefined) return null;
              return (
                <View
                  style={styles.row}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`${skill.skill_name} proficiency`}
                >
                  {PROFICIENCY_OPTIONS.map((option) => {
                    const selectedLevel = level === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[styles.chipSmall, selectedLevel && styles.chipSelected]}
                        onPress={() => setProficiency(skill.id, option.value)}
                        disabled={busy}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selectedLevel, disabled: busy }}
                        accessibilityLabel={option.label}
                      >
                        <Text
                          style={[styles.chipTextSmall, selectedLevel && styles.chipTextSelected]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            }}
          />
          <Pressable
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            onPress={openAddSkills}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Add Skills"
          >
            <Text style={styles.secondaryButtonText}>+ Add Skills</Text>
          </Pressable>

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
                  { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) },
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
                <Pressable
                  style={[styles.button, busy && styles.buttonDisabled]}
                  onPress={confirmAddSkills}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text style={styles.buttonText}>Done</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, busy && styles.buttonDisabled]}
                  onPress={closeAddSkillsWithoutApply}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          {saveSuccess ? <Text style={styles.success}>{saveSuccess}</Text> : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={promptSave}
            disabled={busy}
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Save Profile</Text>
            )}
          </Pressable>
        </>
      )}

      <Text style={styles.sectionTitle}>Tools / Support</Text>
      <View style={styles.card}>
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
          last
          onPress={() => router.push('/worker/report-app' as unknown as Href)}
        />
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <Pressable
        style={[styles.secondaryButton, busy && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={busy}
        accessibilityRole="button"
      >
        {isSigningOut ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign Out</Text>
        )}
      </Pressable>
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
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
      style={[styles.navRow, !last && styles.navRowBorder, disabled && styles.buttonDisabled]}
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
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  card: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  identityName: { fontSize: 22, fontWeight: '700', color: SkillMatchTheme.text.primary },
  location: { fontSize: 14, color: SkillMatchTheme.text.secondary },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeVerified: { backgroundColor: SkillMatchTheme.brand.primaryMuted },
  badgePending: { backgroundColor: SkillMatchTheme.surface.subtle },
  badgeText: { fontSize: 13, fontWeight: '600' },
  badgeTextVerified: { color: SkillMatchTheme.brand.primary },
  badgeTextPending: { color: SkillMatchTheme.text.secondary },
  label: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginTop: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: SkillMatchTheme.text.secondary },
  value: { fontSize: 16, color: SkillMatchTheme.text.primary },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8, color: SkillMatchTheme.text.primary },
  note: { fontSize: 14, opacity: 0.7 },
  textArea: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 96,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flex: 1,
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: SkillMatchTheme.brand.primary, backgroundColor: SkillMatchTheme.brand.primaryMuted },
  chipText: { fontSize: 16 },
  chipTextSmall: { fontSize: 14 },
  chipTextSelected: { color: SkillMatchTheme.brand.primary, fontWeight: '600' },
  error: { color: SkillMatchTheme.feedback.danger, fontSize: 14 },
  success: { color: SkillMatchTheme.feedback.success, fontSize: 14 },
  button: {
    marginTop: 8,
    minHeight: SkillMatchTheme.size.primaryCtaHeight,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: SkillMatchTheme.text.inverse, fontSize: 16, fontWeight: '600' },
  secondaryButtonText: { color: SkillMatchTheme.brand.primary, fontSize: 16, fontWeight: '600' },
  navRow: {
    minHeight: SkillMatchTheme.size.iconTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: SkillMatchTheme.border.default,
  },
  navCopy: { flex: 1, gap: 2 },
  navLabel: { fontSize: 16, fontWeight: '600', color: SkillMatchTheme.brand.primary },
  navHint: { fontSize: 12, color: SkillMatchTheme.text.secondary },
  navChevron: { fontSize: 22, color: SkillMatchTheme.text.secondary, lineHeight: 24 },
  modalFlex: { flex: 1 },
  modalScreen: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: SkillMatchTheme.brand.background,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: SkillMatchTheme.text.primary },
  modalContent: { gap: 12, paddingBottom: 24 },
});
