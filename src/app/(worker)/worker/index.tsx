import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

/**
 * Worker dashboard = "My Profile" editor (defense-minimum slice).
 *
 * Identity/location are displayed read-only from the authoritative account
 * (AccountProvider). Editable state is limited to `bio` and
 * `availability_status` on the Worker's own `worker_profiles` row plus the
 * Worker's `worker_skills` rows (master skills from `public.skills`, each with
 * one proficiency). Server-owned columns (is_verified, verified_by,
 * rating_avg, strike_count, badge_level) are never part of UI state or
 * payloads. Profile save uses explicit SELECT → INSERT | UPDATE; skills are
 * saved as a diff (delete removed, update changed, insert added). The
 * operations are not one transaction: success is shown only after every
 * step succeeds and the persisted state has been re-read.
 */

type AvailabilityStatus = 'available' | 'busy' | 'offline';
type Proficiency = 'beginner' | 'intermediate' | 'expert';

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'offline', label: 'Offline' },
];

const PROFICIENCY_OPTIONS: { value: Proficiency; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
];

type MasterSkill = { id: string; skill_name: string };
/** skillId → proficiency; absent key = not selected. */
type SkillSelection = Record<string, Proficiency>;

function isAvailability(v: unknown): v is AvailabilityStatus {
  return v === 'available' || v === 'busy' || v === 'offline';
}
function isProficiency(v: unknown): v is Proficiency {
  return v === 'beginner' || v === 'intermediate' || v === 'expert';
}

type LoadedState = {
  skills: MasterSkill[];
  profileId: string | null;
  bio: string;
  availability: AvailabilityStatus;
  selection: SkillSelection;
};

async function loadWorkerData(userId: string): Promise<LoadedState> {
  const skillsRes = await supabase
    .from('skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true });
  if (skillsRes.error) throw new Error(`Could not load skills: ${skillsRes.error.message}`);
  const skills: MasterSkill[] = (skillsRes.data ?? []).filter(
    (s): s is MasterSkill => typeof s.id === 'string' && typeof s.skill_name === 'string'
  );

  const profileRes = await supabase
    .from('worker_profiles')
    .select('id, bio, availability_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileRes.error) {
    throw new Error(`Could not load your profile: ${profileRes.error.message}`);
  }

  if (!profileRes.data) {
    return { skills, profileId: null, bio: '', availability: 'available', selection: {} };
  }

  const profileId = String(profileRes.data.id);
  const skillRowsRes = await supabase
    .from('worker_skills')
    .select('skill_id, proficiency_level')
    .eq('worker_id', profileId);
  if (skillRowsRes.error) {
    throw new Error(`Could not load your skills: ${skillRowsRes.error.message}`);
  }
  const selection: SkillSelection = {};
  for (const row of skillRowsRes.data ?? []) {
    if (typeof row.skill_id === 'string' && isProficiency(row.proficiency_level)) {
      selection[row.skill_id] = row.proficiency_level;
    }
  }

  return {
    skills,
    profileId,
    bio: typeof profileRes.data.bio === 'string' ? profileRes.data.bio : '',
    availability: isAvailability(profileRes.data.availability_status)
      ? profileRes.data.availability_status
      : 'available',
    selection,
  };
}

export default function WorkerHome() {
  const { account } = useAccount();
  const router = useRouter();
  const userId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MasterSkill[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus>('available');
  const [selection, setSelection] = useState<SkillSelection>({});
  const [persistedSelection, setPersistedSelection] = useState<SkillSelection>({});

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const applyLoaded = useCallback((loaded: LoadedState) => {
    setSkills(loaded.skills);
    setProfileId(loaded.profileId);
    setBio(loaded.bio);
    setAvailability(loaded.availability);
    setSelection(loaded.selection);
    setPersistedSelection(loaded.selection);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadWorkerData(userId)
      .then((loaded) => {
        if (cancelled) return;
        applyLoaded(loaded);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load your profile.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, applyLoaded]);

  function toggleSkill(skillId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[skillId]) delete next[skillId];
      else next[skillId] = 'beginner';
      return next;
    });
  }

  function setProficiency(skillId: string, level: Proficiency) {
    setSelection((prev) => ({ ...prev, [skillId]: level }));
  }

  async function handleSave() {
    if (isSaving || !userId) return;
    setSaveError(null);
    setSaveSuccess(null);

    if (!isAvailability(availability)) {
      setSaveError('Please choose an availability status.');
      return;
    }
    const knownSkillIds = new Set(skills.map((s) => s.id));
    for (const [skillId, level] of Object.entries(selection)) {
      if (!knownSkillIds.has(skillId) || !isProficiency(level)) {
        setSaveError('Please choose a valid proficiency for each selected skill.');
        return;
      }
    }

    setIsSaving(true);
    const trimmedBio = bio.trim();
    const bioValue = trimmedBio.length > 0 ? trimmedBio : null;
    try {
      // 1. Profile: explicit SELECT-resolved INSERT | UPDATE (server-owned
      //    columns are never supplied; the guard trigger normalizes them).
      let currentProfileId = profileId;
      if (!currentProfileId) {
        const ins = await supabase
          .from('worker_profiles')
          .insert({ user_id: userId, bio: bioValue, availability_status: availability })
          .select('id')
          .single();
        if (ins.error || !ins.data?.id) {
          throw new Error(`Profile could not be created: ${ins.error?.message ?? 'no id'}`);
        }
        currentProfileId = String(ins.data.id);
        setProfileId(currentProfileId);
      } else {
        const upd = await supabase
          .from('worker_profiles')
          .update({ bio: bioValue, availability_status: availability })
          .eq('id', currentProfileId)
          .eq('user_id', userId);
        if (upd.error) throw new Error(`Profile could not be updated: ${upd.error.message}`);
      }

      // 2. Skills: diff desired vs persisted; touch only necessary own rows.
      const removed = Object.keys(persistedSelection).filter((id) => !selection[id]);
      const added = Object.keys(selection).filter((id) => !persistedSelection[id]);
      const changed = Object.keys(selection).filter(
        (id) => persistedSelection[id] && persistedSelection[id] !== selection[id]
      );

      if (removed.length > 0) {
        const del = await supabase
          .from('worker_skills')
          .delete()
          .eq('worker_id', currentProfileId)
          .in('skill_id', removed);
        if (del.error) throw new Error(`Skill removal failed: ${del.error.message}`);
      }
      for (const skillId of changed) {
        const upd = await supabase
          .from('worker_skills')
          .update({ proficiency_level: selection[skillId] })
          .eq('worker_id', currentProfileId)
          .eq('skill_id', skillId);
        if (upd.error) throw new Error(`Skill update failed: ${upd.error.message}`);
      }
      if (added.length > 0) {
        const ins = await supabase.from('worker_skills').insert(
          added.map((skillId) => ({
            worker_id: currentProfileId,
            skill_id: skillId,
            proficiency_level: selection[skillId],
          }))
        );
        if (ins.error) throw new Error(`Skill save failed: ${ins.error.message}`);
      }

      // 3. Re-read persisted state; only then report success.
      const reloaded = await loadWorkerData(userId);
      applyLoaded(reloaded);
      setSaveSuccess('Profile saved.');
    } catch (e: unknown) {
      setSaveError(
        (e instanceof Error ? e.message : 'Save failed.') +
          ' Some changes may not have been saved — please review and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

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
      <Text style={styles.heading}>My Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{account?.full_name ?? '—'}</Text>
        <Text style={styles.label}>Location</Text>
        <Text style={styles.value}>
          {account ? `${account.barangay}, ${account.city}` : '—'}
        </Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{account?.phone ?? '—'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{account?.email ?? '—'}</Text>
      </View>

      {/*
        Entry point to the read-only N8-UI opportunity list. The route lives
        inside the already-protected (worker) group, so it needs no guard of
        its own.
      */}
      <Pressable
        style={[styles.secondaryButton, busy && styles.buttonDisabled]}
        onPress={() => router.push('/worker/opportunities')}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Job Opportunities</Text>
      </Pressable>

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
          <View style={styles.row}>
            {AVAILABILITY_OPTIONS.map((opt) => {
              const selected = availability === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setAvailability(opt.value)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {opt.label}
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
                    <View style={styles.row}>
                      {PROFICIENCY_OPTIONS.map((opt) => {
                        const on = level === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            style={[styles.chipSmall, on && styles.chipSelected]}
                            onPress={() => setProficiency(skill.id, opt.value)}
                            disabled={busy}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipTextSmall, on && styles.chipTextSelected]}>
                              {opt.label}
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
  container: {
    padding: 24,
    gap: 12,
    paddingBottom: 48,
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 6,
  },
  value: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 96,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
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
  chipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  chipText: {
    fontSize: 16,
  },
  chipTextSmall: {
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  skillBlock: {
    gap: 8,
    marginBottom: 4,
  },
  skillToggle: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  success: {
    color: '#15803d',
    fontSize: 14,
  },
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
});
