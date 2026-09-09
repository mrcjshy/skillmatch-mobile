import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';

/**
 * Client dashboard = "Post a Job" (defense-minimum slice).
 *
 * `client_id` always comes from the authoritative account (AccountProvider),
 * never from input. Location is the fixed deployment constant Santa Ana,
 * Pateros. `status` is never sent: the database default ('open') owns it.
 * Required skills come only from the loaded public.skills master list.
 *
 * Save is job_postings INSERT -> job_id -> job_skills INSERT -> re-read.
 * These are separate requests, not one transaction: success is reported only
 * after every step and the re-read succeed, and a failure after the job row
 * exists is reported truthfully as a partial save (no rollback is claimed).
 */

const DEPLOYMENT_BARANGAY = 'Santa Ana';
const DEPLOYMENT_CITY = 'Pateros';

/** Strict YYYY-MM-DD + HH:MM -> local Date; null when invalid or rolled over. */
function parseSchedule(dateText: string, timeText: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const t = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!d || !t) return null;
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Reject impossible calendar values that JavaScript would silently roll
  // over (e.g. 2026-02-30 becoming March 2).
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    dt.getHours() !== hour ||
    dt.getMinutes() !== minute
  ) {
    return null;
  }
  return dt;
}

/**
 * Every message this screen can put in front of a Client.
 *
 * Raw PostgREST/Postgres text names tables, policies and constraints and is
 * developer diagnostic only; each failure logs its real cause through
 * `console.warn` and throws one of these instead. The post-failure catch
 * still appends its own partial-save sentence, which is deliberate and must
 * survive: a job row can exist without its required skills.
 */
const COPY = {
  postJob: "Couldn't post your job. Please try again.",
  postSkills: "Couldn't save the job's required skills. Please try again.",
  postGeneric: "Couldn't post your job. Please try again.",
} as const;

export default function ClientHome() {
  const { account } = useAccount();
  const router = useRouter();
  const clientId = account?.id;
  const { isLoading, loadError, skills, refresh } = useClientJobs();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  function toggleSkill(skillId: string) {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  }

  async function handlePost() {
    if (isPosting || !clientId) return;
    setPostError(null);
    setPostSuccess(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setPostError('Please enter a job title.');
      return;
    }
    const knownIds = new Set(skills.map((s) => s.id));
    const chosen = selectedSkills.filter((id) => knownIds.has(id));
    if (chosen.length === 0) {
      setPostError('Please select at least one required skill.');
      return;
    }
    const schedule = parseSchedule(dateText, timeText);
    if (!schedule) {
      setPostError('Please enter a valid date (YYYY-MM-DD) and time (HH:MM).');
      return;
    }
    if (schedule.getTime() <= Date.now()) {
      setPostError('Please choose a schedule in the future.');
      return;
    }
    let budget: number | null = null;
    const trimmedBudget = budgetText.trim();
    if (trimmedBudget.length > 0) {
      if (!/^\d+(\.\d{1,2})?$/.test(trimmedBudget)) {
        setPostError('Budget must be a number of 0 or more.');
        return;
      }
      budget = Number(trimmedBudget);
      if (!Number.isFinite(budget) || budget < 0) {
        setPostError('Budget must be a number of 0 or more.');
        return;
      }
    }

    setIsPosting(true);
    let createdJobId: string | null = null;
    try {
      // 1. job_postings INSERT. `status` is never sent: the database default
      //    ('open') owns it. client_id comes from the authoritative account.
      const ins = await supabase
        .from('job_postings')
        .insert({
          client_id: clientId,
          title: trimmedTitle,
          description: description.trim() || null,
          address: address.trim() || null,
          barangay: DEPLOYMENT_BARANGAY,
          city: DEPLOYMENT_CITY,
          scheduled_at: schedule.toISOString(),
          budget,
        })
        .select('id')
        .single();
      if (ins.error || !ins.data?.id) {
        console.warn(
          '[N7-UI] job_postings insert failed:',
          ins.error?.code,
          ins.error?.message ?? 'no id returned'
        );
        throw new Error(COPY.postJob);
      }
      createdJobId = String(ins.data.id);

      // 2. job_skills INSERT for the created job.
      const skillIns = await supabase
        .from('job_skills')
        .insert(chosen.map((skill_id) => ({ job_id: createdJobId, skill_id })));
      if (skillIns.error) {
        console.warn(
          '[N7-UI] job_skills insert failed:',
          skillIns.error.code,
          skillIns.error.message
        );
        throw new Error(COPY.postSkills);
      }

      // 3. Re-read persisted state; only then report success.
      await refresh(clientId);
      setPostSuccess('Job posted.');
      setTitle('');
      setDescription('');
      setAddress('');
      setDateText('');
      setTimeText('');
      setBudgetText('');
      setSelectedSkills([]);
    } catch (e: unknown) {
      const base = e instanceof Error ? e.message : COPY.postGeneric;
      setPostError(
        createdJobId
          ? `${base} The job was created but the post did not finish, so it may be saved without its required skills. Please review "My Posted Jobs" before trying again.`
          : `${base} No job was created.`
      );
      if (clientId) {
        try {
          await refresh(clientId);
        } catch {
          /* keep the original error visible */
        }
      }
    } finally {
      setIsPosting(false);
    }
  }

  const busy = isPosting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/*
        The fixed service area, stated once at the top of the screen. Putting
        it here rather than beside Address is what stops the two from being
        confused: this is context for everything below, and the Address field
        is the only place the Client types a location.
      */}
      <Text style={styles.serviceArea}>
        {DEPLOYMENT_BARANGAY}, {DEPLOYMENT_CITY} · SkillMatch service area
      </Text>
      <Text style={styles.heading}>Post a Job</Text>

      {/*
        Entry point to the AI-01 Help & FAQ screen — added alongside the
        existing entries, replacing none of them. Same protected (client)
        group, so it needs no guard of its own. Placed above the load switch
        because the FAQ reads no account or server data at all and must stay
        reachable regardless of any load failure.
      */}
      <Pressable
        style={[styles.secondaryButton, busy && styles.buttonDisabled]}
        onPress={() => router.push('/client/help')}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Help &amp; FAQ</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>Loading…</Text>
        </View>
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : (
        <>
          <Text style={styles.label}>Job Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Plumbing Repair Assistance"
            editable={!busy}
            accessibilityLabel="Job Title"
          />

          <Text style={styles.label}>Description / Service Expectations</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the work needed."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!busy}
            accessibilityLabel="Description"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="House / street / landmark"
            editable={!busy}
            accessibilityLabel="Address"
          />
          <Text style={styles.help}>Where in the service area the work happens.</Text>

          {/*
            Location is the fixed deployment constant, not an input. It is
            given a locked row rather than a field so it cannot read as
            something the Client forgot to fill in. Address above is the only
            location the Client types.
          */}
          <Text style={styles.label}>Location</Text>
          <View style={styles.lockedRow} accessibilityLabel="Location, fixed service area">
            <Text style={styles.lockedValue}>
              {DEPLOYMENT_BARANGAY}, {DEPLOYMENT_CITY}
            </Text>
            <Text style={styles.lockedTag}>Fixed</Text>
          </View>

          <Text style={styles.label}>Scheduled Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dateText}
            onChangeText={setDateText}
            placeholder="2026-09-01"
            keyboardType="numbers-and-punctuation"
            editable={!busy}
            accessibilityLabel="Scheduled Date"
          />

          <Text style={styles.label}>Scheduled Time (HH:MM)</Text>
          <TextInput
            style={styles.input}
            value={timeText}
            onChangeText={setTimeText}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
            editable={!busy}
            accessibilityLabel="Scheduled Time"
          />

          {/*
            The peso glyph is decoration outside the input, so `budgetText`
            and its validation are untouched -- the Client still types digits
            only and the submitted value is unchanged.
          */}
          <Text style={styles.label}>Budget</Text>
          <View style={styles.inputWithPrefix}>
            <Text style={styles.inputPrefix}>₱</Text>
            <TextInput
              style={styles.inputPrefixed}
              value={budgetText}
              onChangeText={setBudgetText}
              placeholder="800"
              keyboardType="numeric"
              editable={!busy}
              accessibilityLabel="Budget in pesos"
            />
          </View>

          <Text style={styles.label}>Required Skills</Text>
          {skills.length === 0 ? (
            <Text style={styles.note}>No skills are available yet.</Text>
          ) : (
            skills.map((skill) => {
              const on = selectedSkills.includes(skill.id);
              return (
                <Pressable
                  key={skill.id}
                  style={[styles.skillToggle, on && styles.chipSelected]}
                  onPress={() => toggleSkill(skill.id)}
                  disabled={busy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextSelected]}>
                    {on ? '✓ ' : ''}
                    {skill.skill_name}
                  </Text>
                </Pressable>
              );
            })
          )}

          {postError ? <Text style={styles.error}>{postError}</Text> : null}
          {postSuccess ? <Text style={styles.success}>{postSuccess}</Text> : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handlePost}
            disabled={busy}
            accessibilityRole="button"
          >
            {isPosting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Post Job</Text>
            )}
          </Pressable>

        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 10,
    paddingBottom: 48,
  },
  serviceArea: {
    fontSize: 13,
    opacity: 0.6,
  },
  help: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: -4,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  lockedValue: {
    fontSize: 16,
    color: '#334155',
    flexShrink: 1,
  },
  lockedTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWithPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingLeft: 12,
  },
  inputPrefix: {
    fontSize: 16,
    color: '#6b7280',
  },
  inputPrefixed: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 16,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  value: {
    fontSize: 16,
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 76,
  },
  skillToggle: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  chipText: {
    fontSize: 16,
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardLine: {
    fontSize: 14,
    opacity: 0.8,
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
    marginTop: 10,
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    marginTop: 20,
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
