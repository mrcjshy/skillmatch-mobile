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

type MasterSkill = { id: string; skill_name: string };

type PostedJob = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  budget: number | null;
  skills: string[];
};

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

function formatSchedule(iso: string | null): string {
  if (!iso) return 'No schedule';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'No schedule';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

async function loadSkills(): Promise<MasterSkill[]> {
  const res = await supabase
    .from('skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true });
  if (res.error) throw new Error(`Could not load skills: ${res.error.message}`);
  return (res.data ?? []).filter(
    (s): s is MasterSkill => typeof s.id === 'string' && typeof s.skill_name === 'string'
  );
}

async function loadMyJobs(clientId: string): Promise<PostedJob[]> {
  const jobsRes = await supabase
    .from('job_postings')
    .select('id, title, status, scheduled_at, budget')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (jobsRes.error) throw new Error(`Could not load your jobs: ${jobsRes.error.message}`);

  const jobs = jobsRes.data ?? [];
  if (jobs.length === 0) return [];

  const skillsRes = await supabase
    .from('job_skills')
    .select('job_id, skills(skill_name)')
    .in(
      'job_id',
      jobs.map((j) => String(j.id))
    );
  if (skillsRes.error) {
    throw new Error(`Could not load job skills: ${skillsRes.error.message}`);
  }

  const byJob = new Map<string, string[]>();
  for (const row of (skillsRes.data ?? []) as {
    job_id: string;
    skills: { skill_name: string } | { skill_name: string }[] | null;
  }[]) {
    const rel = Array.isArray(row.skills) ? row.skills[0] : row.skills;
    if (!rel?.skill_name) continue;
    const list = byJob.get(row.job_id) ?? [];
    list.push(rel.skill_name);
    byJob.set(row.job_id, list);
  }

  return jobs.map((j) => ({
    id: String(j.id),
    title: String(j.title),
    status: String(j.status ?? 'open'),
    scheduled_at: (j.scheduled_at as string | null) ?? null,
    budget: (j.budget as number | null) ?? null,
    skills: (byJob.get(String(j.id)) ?? []).sort(),
  }));
}

export default function ClientHome() {
  const { account } = useAccount();
  const clientId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MasterSkill[]>([]);
  const [jobs, setJobs] = useState<PostedJob[]>([]);

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

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const [master, myJobs] = await Promise.all([loadSkills(), loadMyJobs(id)]);
    setSkills(master);
    setJobs(myJobs);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    refresh(clientId)
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load your dashboard.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, refresh]);

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
        throw new Error(`Job could not be posted: ${ins.error?.message ?? 'no id returned'}`);
      }
      createdJobId = String(ins.data.id);

      // 2. job_skills INSERT for the created job.
      const skillIns = await supabase
        .from('job_skills')
        .insert(chosen.map((skill_id) => ({ job_id: createdJobId, skill_id })));
      if (skillIns.error) {
        throw new Error(`Required skills could not be saved: ${skillIns.error.message}`);
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
      const base = e instanceof Error ? e.message : 'Job posting failed.';
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

  const busy = isPosting || isSigningOut;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Post a Job</Text>

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

          <Text style={styles.label}>Location</Text>
          <Text style={styles.value}>
            {DEPLOYMENT_BARANGAY}, {DEPLOYMENT_CITY}
          </Text>

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

          <Text style={styles.label}>Budget</Text>
          <TextInput
            style={styles.input}
            value={budgetText}
            onChangeText={setBudgetText}
            placeholder="e.g. 800"
            keyboardType="numeric"
            editable={!busy}
            accessibilityLabel="Budget"
          />

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

          <Text style={styles.sectionTitle}>My Posted Jobs</Text>
          {jobs.length === 0 ? (
            <Text style={styles.note}>You have not posted a job yet.</Text>
          ) : (
            jobs.map((job) => (
              <View key={job.id} style={styles.card}>
                <Text style={styles.cardTitle}>{job.title}</Text>
                <Text style={styles.cardLine}>Status: {job.status}</Text>
                <Text style={styles.cardLine}>
                  Schedule: {formatSchedule(job.scheduled_at)}
                </Text>
                <Text style={styles.cardLine}>
                  Budget: {job.budget === null ? 'Not set' : job.budget}
                </Text>
                <Text style={styles.cardLine}>
                  Skills: {job.skills.length > 0 ? job.skills.join(', ') : 'None'}
                </Text>
              </View>
            ))
          )}
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
    gap: 10,
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
