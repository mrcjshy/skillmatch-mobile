import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';
import { signOutCurrentUser } from '@/lib/sign-out';
import { workerVerificationLabel } from '@/lib/worker-profile';
import { useAccount } from '@/providers/account-provider';
import {
  AVAILABILITY_OPTIONS,
  PROFICIENCY_OPTIONS,
  useWorkerProfile,
} from '@/providers/worker-profile-provider';

export default function WorkerProfile() {
  const router = useRouter();
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

  const busy = isSaving || isSigningOut;
  const verificationLabel = workerVerificationLabel(isVerified);

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
          <View style={styles.row} accessibilityRole="radiogroup">
            {AVAILABILITY_OPTIONS.map((option) => {
              const selected = availability === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setAvailability(option.value)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Skills</Text>
          {skills.length === 0 ? (
            <Text style={styles.note}>No skills are available yet.</Text>
          ) : (
            skills.map((skill) => {
              const level = selection[skill.id];
              const selected = level !== undefined;
              return (
                <View key={skill.id} style={styles.skillBlock}>
                  <Pressable
                    style={[styles.skillToggle, selected && styles.chipSelected]}
                    onPress={() => toggleSkill(skill.id)}
                    disabled={busy}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {selected ? '✓ ' : ''}
                      {skill.skill_name}
                    </Text>
                  </Pressable>
                  {selected ? (
                    <View style={styles.row} accessibilityRole="radiogroup">
                      {PROFICIENCY_OPTIONS.map((option) => {
                        const selectedLevel = level === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            style={[styles.chipSmall, selectedLevel && styles.chipSelected]}
                            onPress={() => setProficiency(skill.id, option.value)}
                            disabled={busy}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: selectedLevel }}
                          >
                            <Text
                              style={[
                                styles.chipTextSmall,
                                selectedLevel && styles.chipTextSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}

          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          {saveSuccess ? <Text style={styles.success}>{saveSuccess}</Text> : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSave}
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
  skillBlock: { gap: 8, marginBottom: 4 },
  skillToggle: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
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
});
