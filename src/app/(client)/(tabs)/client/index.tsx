import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { HomeHeader } from '@/components/home-header';
import { JobLocationPicker } from '@/components/job-location-picker';
import { JobSchedulePicker } from '@/components/job-schedule-picker';
import { SelectedSkillChips } from '@/components/selected-skill-chips';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SkillMatchTheme } from '@/constants/theme';
import {
  COPY as JOB_LOCATION_COPY,
  JobLocationError,
  createJobLocationErrorCopy,
  createMyJobWithLocation,
  initialJobPin,
  postingLocationError,
  type JobPin,
} from '@/lib/job-location';
import {
  type JobPaymentMethod,
  postingPaymentError,
} from '@/lib/job-payment';
import { combineJobSchedule, postingScheduleError } from '@/lib/job-posting-schedule';
import { selectedCatalogSkills } from '@/lib/skill-catalog';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';

/**
 * Client dashboard = "Post a Job" (defense-minimum slice).
 *
 * Caller identity is `auth.uid()` inside `create_my_job_with_location`.
 * Location is the fixed deployment constant Santa Ana, Pateros, written by
 * the server. `status` is never sent: the database default ('open') owns it.
 * Required skills come only from the loaded public.skills master list.
 *
 * Save is one atomic RPC: Job + required skills + private pin. Exact
 * coordinates never land on public.job_postings and are not used for matching.
 */

const DEPLOYMENT_BARANGAY = 'Santa Ana';
const DEPLOYMENT_CITY = 'Pateros';

export default function ClientHome() {
  const { account } = useAccount();
  const clientId = account?.id;
  const { isLoading, loadError, skills, refresh } = useClientJobs();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<JobPin | null>(initialJobPin);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [mapGesture, setMapGesture] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [scheduleTime, setScheduleTime] = useState<Date | null>(null);
  const [budgetText, setBudgetText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<JobPaymentMethod | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState('');

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
    const trimmedAddress = address.trim();
    const locationError = postingLocationError(trimmedAddress, pin);
    if (locationError !== null || pin === null) {
      setPostError(locationError ?? JOB_LOCATION_COPY.missingPin);
      return;
    }
    const scheduleError = postingScheduleError(scheduleDate, scheduleTime);
    if (scheduleError !== null) {
      setPostError(scheduleError);
      return;
    }
    const schedule = combineJobSchedule(scheduleDate, scheduleTime);
    if (schedule === null) {
      setPostError('Please choose a valid date and time.');
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
    const paymentError = postingPaymentError(paymentMethod, budget);
    if (paymentError !== null || paymentMethod === null) {
      setPostError(paymentError ?? 'Please select a payment method.');
      return;
    }
    const knownIds = new Set(skills.map((s) => s.id));
    const chosen = selectedSkills.filter((id) => knownIds.has(id));
    if (chosen.length === 0) {
      setPostError('Please select at least one required skill.');
      return;
    }

    setIsPosting(true);
    let created = false;
    try {
      await createMyJobWithLocation({
        title: trimmedTitle,
        description: description.trim(),
        address: trimmedAddress,
        scheduledAt: schedule.toISOString(),
        budget,
        paymentMethod,
        skillIds: chosen,
        latitude: pin.latitude,
        longitude: pin.longitude,
      });
      created = true;
      await refresh(clientId);
      setPostSuccess('Job posted.');
      setTitle('');
      setDescription('');
      setAddress('');
      setPin(initialJobPin());
      setLocationNote(null);
      setScheduleDate(null);
      setScheduleTime(null);
      setBudgetText('');
      setPaymentMethod(null);
      setSelectedSkills([]);
      setSkillQuery('');
      setPostError(null);
    } catch (e: unknown) {
      if (created) {
        setPostError('Job posted, but the list could not be refreshed. Check My Posted Jobs.');
      } else {
        const code = e instanceof JobLocationError ? e.code : 'unknown';
        console.warn('[R5E-M1] create_my_job_with_location failed:', code);
        setPostError(`${createJobLocationErrorCopy(e)} No job was created.`);
      }
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
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      scrollEnabled={!mapGesture}
    >
      <HomeHeader fullName={account?.full_name ?? '—'} role="client" />
      <View style={styles.form}>
      <Text style={styles.serviceArea}>
        {DEPLOYMENT_BARANGAY}, {DEPLOYMENT_CITY} · SkillMatch service area
      </Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>Loading…</Text>
        </View>
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : (
        <>
          <View style={styles.section} accessibilityLabel="Job Details">
            <Text style={styles.sectionTitle}>Job Details</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Plumbing Repair Assistance"
              editable={!busy}
              accessibilityLabel="Job Title"
            />

            <Text style={styles.label}>Description (Optional)</Text>
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
          </View>

          <View style={styles.section} accessibilityLabel="Where">
            <Text style={styles.sectionTitle}>Where</Text>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="House / street / landmark"
              editable={!busy}
              accessibilityLabel="Address"
            />
            <Text style={styles.help}>
              Required. Write the house, street, or landmark. The pin does not replace this
              address.
            </Text>

            <Text style={styles.label}>Map</Text>
            <JobLocationPicker
              pin={pin}
              onChangePin={setPin}
              note={locationNote}
              onNote={setLocationNote}
              disabled={busy}
              onMapGesture={setMapGesture}
            />
          </View>

          <View style={styles.section} accessibilityLabel="Schedule">
            <Text style={styles.sectionTitle}>Schedule</Text>
            <JobSchedulePicker
              date={scheduleDate}
              time={scheduleTime}
              onChangeDate={setScheduleDate}
              onChangeTime={setScheduleTime}
              disabled={busy}
            />
          </View>

          <View style={styles.section} accessibilityLabel="Budget and Payment">
            <Text style={styles.sectionTitle}>Budget & Payment</Text>
            <Text style={styles.label}>Budget (Optional)</Text>
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

            <Text style={styles.label}>Payment Method</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Payment Method"
              style={{ gap: 8 }}
            >
              {(
                [
                  { value: 'cod', label: 'Cash' },
                  { value: 'qrph', label: 'QR Ph' },
                ] as const
              ).map((option) => {
                const on = paymentMethod === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.skillToggle, on && styles.chipSelected]}
                    onPress={() => setPaymentMethod(option.value)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: busy }}
                    accessibilityLabel={option.label}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextSelected]}>
                      {on ? '✓ ' : ''}
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.help}>Required. Workers see this before they accept.</Text>
            {paymentMethod === 'qrph' ? (
              <Text style={styles.help}>QR Ph needs a budget of at least ₱1.00.</Text>
            ) : null}
          </View>

          <View style={styles.section} accessibilityLabel="Required Skills">
            <Text style={styles.sectionTitle}>Required Skills</Text>
            <SelectedSkillChips
              skills={selectedCatalogSkills(skills, selectedSkills)}
              onRemove={toggleSkill}
              disabled={busy}
            />
            <SkillCatalogPicker
              skills={skills}
              query={skillQuery}
              onQueryChange={setSkillQuery}
              isSkillSelected={(skillId) => selectedSkills.includes(skillId)}
              onToggleSkill={toggleSkill}
              disabled={busy}
            />
          </View>

          <View style={styles.section} accessibilityLabel="Post Job">
            {postError ? <Text style={styles.error}>{postError}</Text> : null}
            {postSuccess ? <Text style={styles.success}>{postSuccess}</Text> : null}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handlePost}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Post Job"
            >
              {isPosting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>+ Post Job</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    gap: 10,
    paddingBottom: 48,
    backgroundColor: SkillMatchTheme.brand.background,
  },
  form: {
    paddingHorizontal: 24,
    gap: 16,
  },
  section: {
    gap: 10,
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
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: '#dbeafe',
  },
  chipText: {
    fontSize: 16,
  },
  chipTextSelected: {
    color: SkillMatchTheme.brand.primary,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
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
    minHeight: SkillMatchTheme.size.primaryCtaHeight,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: SkillMatchTheme.radius.input,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
