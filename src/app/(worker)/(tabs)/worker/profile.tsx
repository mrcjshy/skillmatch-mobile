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

import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';
import {
  AVAILABILITY_OPTIONS,
  PROFICIENCY_OPTIONS,
  useWorkerProfile,
} from '@/providers/worker-profile-provider';

export default function WorkerProfile() {
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
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  const busy = isSaving || isSigningOut;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
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
          <Text style={styles.sectionTitle}>About Me</Text>
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

          <Text style={styles.sectionTitle}>Availability</Text>
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

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  card: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, gap: 2 },
  label: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginTop: 6 },
  value: { fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  note: { fontSize: 14, opacity: 0.7 },
  textArea: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 96,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipSmall: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chipSelected: { borderColor: '#1d4ed8', backgroundColor: '#dbeafe' },
  chipText: { fontSize: 16 },
  chipTextSmall: { fontSize: 14 },
  chipTextSelected: { color: '#1d4ed8', fontWeight: '600' },
  skillBlock: { gap: 8, marginBottom: 4 },
  skillToggle: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  error: { color: '#b91c1c', fontSize: 14 },
  success: { color: '#15803d', fontSize: 14 },
  button: {
    marginTop: 8,
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  secondaryButtonText: { color: '#1d4ed8', fontSize: 16, fontWeight: '600' },
});
