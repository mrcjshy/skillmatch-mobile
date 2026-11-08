import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppSymbol } from '@/components/app-symbol';
import { AppField } from '@/components/app-field';
import { AppSelect } from '@/components/app-select';
import { FormMessage } from '@/components/form-message';
import { InlineStatus } from '@/components/inline-status';
import { JobLocationPicker } from '@/components/job-location-picker';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import {
  EDUCATION_LABELS, EDUCATION_LEVELS, MAX_JOBS, MAX_RESUME_SKILLS, SERVICE_AREA_LABEL, hasErrors, loadMyProfileDetails,
  homeAddressLabel, loadSkillCatalog, saveMyHomeLocation, saveMyProfileDetails, saveMyWorkerResume, validateProfileDetails, validateWorkerResume,
  type FieldErrors, type ProfileDetailsInput, type WorkHistoryEntry,
  type NameHint, type WorkerResumeInput,
} from '@/lib/profile-details';
import { JOB_LOCATION_DISPLAY_FALLBACK } from '@/lib/canonical-job-location';
import type { JobPin } from '@/lib/job-location';
import type { CatalogSkill } from '@/lib/skill-catalog';

type Props = {
  userId: string;
  role: 'worker' | 'client';
  submitLabel: string;
  /** Untrusted sign-up name hints for prefill. */
  nameHint?: NameHint;
  /** Shows the saved name read-only (Workers editing later: the name matches their verified ID). */
  lockName?: boolean;
  onSaved: () => void | Promise<void>;
};

const EDUCATION_OPTIONS = EDUCATION_LEVELS.map((value) => ({ value, label: EDUCATION_LABELS[value] }));
const CURRENT_OPTIONS = [
  { value: 'past' as const, label: 'No, I have left this job' },
  { value: 'current' as const, label: 'Yes, I still work here' },
];
const EMPTY_JOB: WorkHistoryEntry = { employer: '', role: '', startYear: '', endYear: '', current: false };

/** Keeps digits and inserts dashes as YYYY-MM-DD while typing. */
function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}

/**
 * REG-01 profile form: name parts and home address for everyone, and
 * the lean resume for Workers (birth date, education, skills, up to three past jobs).
 * Loads the caller's saved values (or a split of the legacy full name) and saves through the two
 * caller-scoped RPCs. Errors are shown under each field and summarised above the button.
 */
export function ProfileDetailsForm({ userId, role, submitLabel, nameHint, lockName = false, onSaved }: Props) {
  const styles = createStyles(useUiTheme());
  const [loadState, setLoadState] = useState<{ error: string | null; attempt: number; loaded: boolean }>({ error: null, attempt: 0, loaded: false });
  const [details, setDetails] = useState<ProfileDetailsInput | null>(null);
  const [resume, setResume] = useState<WorkerResumeInput | null>(null);
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // REG-02 Client home pin, chosen on the real map (with the current-location button).
  const [homePin, setHomePin] = useState<JobPin | null>(null);
  const [pickingHome, setPickingHome] = useState(false);
  const [homeNote, setHomeNote] = useState<string | null>(null);
  const homeBackRef = useRef<(() => void) | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMyProfileDetails(userId, role, { firstName: nameHint?.firstName, lastName: nameHint?.lastName }), role === 'worker' ? loadSkillCatalog() : Promise.resolve([])])
      .then(([mine, skills]) => {
        if (cancelled) return;
        setDetails(mine.details);
        setHomePin(mine.homePin);
        setResume(mine.resume);
        setCatalog(skills);
        setLoadState((s) => ({ ...s, error: null, loaded: true }));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadState((s) => ({ ...s, error: error instanceof Error ? error.message : 'Your details could not be loaded.' }));
      });
    return () => { cancelled = true; };
  }, [userId, role, loadState.attempt, nameHint?.firstName, nameHint?.lastName]);

  if (loadState.error) {
    return (
      <InlineStatus variant="error" message={loadState.error}
        action={<AppButton label="Retry" variant="secondary" onPress={() => setLoadState((s) => ({ error: null, attempt: s.attempt + 1, loaded: false }))} />} />
    );
  }
  if (!loadState.loaded || !details) return <InlineStatus variant="loading" skeleton="detail" message="Loading your details…" />;

  const setDetail = <K extends keyof ProfileDetailsInput>(key: K) => (value: ProfileDetailsInput[K]) => {
    setDetails((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => { const next = { ...current }; delete next[key as string]; return next; });
  };
  const setResumeField = <K extends keyof WorkerResumeInput>(key: K, value: WorkerResumeInput[K]) => {
    setResume((current) => (current ? { ...current, [key]: value } : current));
  };
  const setJob = (index: number, patch: Partial<WorkHistoryEntry>) => {
    if (!resume) return;
    setResumeField('jobs', resume.jobs.map((job, i) => (i === index ? { ...job, ...patch } : job)));
  };
  const toggleSkill = (skillId: string) => {
    if (!resume) return;
    const has = resume.skills.some((s) => s.skillId === skillId);
    setResumeField('skills', has ? resume.skills.filter((s) => s.skillId !== skillId) : [...resume.skills, { skillId }]);
  };
  const err = (key: string) => errors[key];

  async function submit() {
    if (inFlight.current || !details) return;
    const nextErrors = {
      ...validateProfileDetails(details, role),
      ...(role === 'worker' && resume ? validateWorkerResume(resume) : {}),
      ...(role === 'client' && homePin === null ? { homePin: 'Pin your home on the map.' } : {}),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      setFormError('Please fix the highlighted fields.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFormError(null);
    try {
      // The pin first: the server rejects one outside Santa Ana before anything else is saved.
      if (role === 'client' && homePin) await saveMyHomeLocation(homePin);
      await saveMyProfileDetails(details, role);
      if (role === 'worker' && resume) await saveMyWorkerResume(resume);
      await onSaved();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Your details could not be saved. Please try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const field = (key: keyof ProfileDetailsInput, label: string, extra: Partial<ComponentProps<typeof AppField>> = {}) => (
    <AppField
      label={label}
      value={String(details[key] ?? '')}
      onChangeText={setDetail(key) as (value: string) => void}
      editable={!saving}
      errorText={err(key)}
      {...extra}
    />
  );
  const nameField = (key: 'firstName' | 'middleName' | 'lastName' | 'suffix', label: string, extra: Partial<ComponentProps<typeof AppField>>) =>
    field(key, label, lockName ? { ...extra, editable: false, disabled: true } : extra);

  return (
    <View style={styles.form}>
      <View style={styles.section}>
        <SectionHeader title="Your name" />
        {lockName ? (
          <Text style={styles.note}>Your name matches your verified ID, so it cannot be changed here. Contact SkillMatch through Help if it is wrong.</Text>
        ) : (
          <Text style={styles.note}>Your first name is how SkillMatch greets you.</Text>
        )}
        {nameField('firstName', 'First name', { autoComplete: 'name-given', textContentType: 'givenName', autoCapitalize: 'words' })}
        {nameField('middleName', 'Middle name (optional)', { autoComplete: 'name-middle', textContentType: 'middleName', autoCapitalize: 'words' })}
        {nameField('lastName', 'Last name', { autoComplete: 'name-family', textContentType: 'familyName', autoCapitalize: 'words' })}
        {nameField('suffix', 'Suffix (optional)', { placeholder: 'Jr., Sr., III', autoCapitalize: 'words' })}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Home address" />
        <Text style={styles.note}>SkillMatch serves residents of Barangay Santa Ana, Pateros. Only you and SkillMatch Administrators can see your address.</Text>
        {field('street', 'House number and street', { autoComplete: 'street-address', textContentType: 'streetAddressLine1', autoCapitalize: 'words', placeholder: 'e.g. 12 M. Almeda St.' })}
        <View style={styles.area} accessible accessibilityLabel={`Area: ${SERVICE_AREA_LABEL}`}>
          <Text style={styles.areaLabel}>Area</Text>
          <Text style={styles.areaValue}>{SERVICE_AREA_LABEL}</Text>
        </View>
        {role === 'client' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={homePin ? 'Change your home pin' : 'Pin your home on the map'}
              accessibilityHint="Opens the map. Tap the location button to use where you are now."
              disabled={saving}
              onPress={() => { setHomeNote(null); setPickingHome(true); }}
              style={({ pressed }) => [styles.pinRow, err('homePin') ? styles.pinRowError : null, pressed ? styles.pinRowPressed : null]}
            >
              <AppSymbol name={{ android: 'home_pin', ios: 'house' }} size={24} tintColor={styles.pinIcon.color} />
              <View style={styles.pinCopy}>
                <Text style={styles.pinLabel}>{homePin ? 'Home pinned on the map' : 'Pin your home on the map'}</Text>
                <Text style={styles.note}>
                  {homePin ? 'Used as a quick choice when you post a job.' : 'Move the map or tap the location button to use where you are now.'}
                </Text>
              </View>
              <Text style={styles.pinAction}>{homePin ? 'Change' : 'Pin'}</Text>
            </Pressable>
            {err('homePin') ? <FormMessage tone="error" message={err('homePin')!} /> : null}
          </>
        ) : null}
      </View>

      {role === 'worker' && resume ? (
        <>
          <View style={styles.section}>
            <SectionHeader title="About you" />
            <AppField
              label="Birth date"
              value={resume.birthDate}
              onChangeText={(value) => setResumeField('birthDate', formatBirthDateInput(value))}
              placeholder="YYYY-MM-DD"
              keyboardType="number-pad"
              maxLength={10}
              editable={!saving}
              helperText="Only Administrators see your birth date. Your age may appear on your resume."
              errorText={err('birthDate')}
            />
            <AppSelect
              label="Highest education"
              options={EDUCATION_OPTIONS}
              value={resume.educationLevel}
              onChange={(value) => setResumeField('educationLevel', value)}
              disabled={saving}
              errorText={err('educationLevel')}
            />
            <AppField label="School (optional)" value={resume.schoolName} onChangeText={(value) => setResumeField('schoolName', value)}
              autoCapitalize="words" editable={!saving} errorText={err('schoolName')} />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Skills" />
            <Text style={styles.note}>Choose up to {MAX_RESUME_SKILLS} skills.</Text>
            {err('skills') ? <FormMessage tone="error" message={err('skills')!} /> : null}
            <SkillCatalogPicker
              skills={catalog}
              query={query}
              onQueryChange={setQuery}
              isSkillSelected={(id) => resume.skills.some((s) => s.skillId === id)}
              onToggleSkill={toggleSkill}
              isSkillUnavailable={() => resume.skills.length >= MAX_RESUME_SKILLS}
              disabled={saving}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Past jobs (optional)" />
            <Text style={styles.note}>Add up to {MAX_JOBS} jobs, newest first.</Text>
            {resume.jobs.map((job, index) => (
              <View key={index} style={styles.job}>
                <Text style={styles.jobTitle}>Job {index + 1}</Text>
                <AppField label="Employer or client" value={job.employer} onChangeText={(value) => setJob(index, { employer: value })}
                  autoCapitalize="words" editable={!saving} errorText={err(`job${index}.employer`)} />
                <AppField label="Job title" value={job.role} onChangeText={(value) => setJob(index, { role: value })}
                  autoCapitalize="words" editable={!saving} errorText={err(`job${index}.role`)} />
                <AppSelect
                  label="Do you still work here?"
                  options={CURRENT_OPTIONS}
                  value={job.current ? 'current' : 'past'}
                  onChange={(value) => setJob(index, { current: value === 'current', endYear: value === 'current' ? '' : job.endYear })}
                  disabled={saving}
                />
                <View style={styles.years}>
                  <AppField containerStyle={styles.yearField} label="Start year" value={job.startYear} placeholder="2019"
                    onChangeText={(value) => setJob(index, { startYear: value.replace(/\D/g, '').slice(0, 4) })}
                    keyboardType="number-pad" maxLength={4} editable={!saving} errorText={err(`job${index}.startYear`)} />
                  {job.current ? null : (
                    <AppField containerStyle={styles.yearField} label="End year" value={job.endYear} placeholder="2022"
                      onChangeText={(value) => setJob(index, { endYear: value.replace(/\D/g, '').slice(0, 4) })}
                      keyboardType="number-pad" maxLength={4} editable={!saving} errorText={err(`job${index}.endYear`)} />
                  )}
                </View>
                <AppButton variant="ghost" label={`Remove job ${index + 1}`} disabled={saving}
                  onPress={() => setResumeField('jobs', resume.jobs.filter((_, i) => i !== index))} />
              </View>
            ))}
            {resume.jobs.length < MAX_JOBS ? (
              <AppButton variant="secondary" label="Add a past job" icon={{ android: 'add', ios: 'plus' }} disabled={saving}
                onPress={() => setResumeField('jobs', [...resume.jobs, { ...EMPTY_JOB }])} />
            ) : null}
          </View>
        </>
      ) : null}

      {role === 'client' ? (
        <Modal visible={pickingHome} animationType="slide" presentationStyle="fullScreen"
          onRequestClose={() => { if (homeBackRef.current) homeBackRef.current(); else setPickingHome(false); }}>
          {pickingHome ? (
            <JobLocationPicker
              purpose="home"
              backHandlerRef={homeBackRef}
              pin={homePin}
              initialAddress={homePin ? homeAddressLabel(details.street) : undefined}
              note={homeNote}
              onNote={setHomeNote}
              onCancel={() => setPickingHome(false)}
              onConfirm={(location) => {
                setHomePin(location.pin);
                setErrors((current) => { const next = { ...current }; delete next.homePin; return next; });
                // Prefill the street from the pin's address when the field is still empty.
                const firstPart = location.address === JOB_LOCATION_DISPLAY_FALLBACK ? '' : location.address.split(',')[0]?.trim() ?? '';
                if (!details.street.trim() && firstPart) setDetail('street')(firstPart);
                setPickingHome(false);
              }}
            />
          ) : null}
        </Modal>
      ) : null}

      <View style={styles.section}>
        {formError ? <FormMessage tone="error" message={formError} /> : null}
        <AppButton label={saving ? 'Saving…' : submitLabel} loading={saving} onPress={() => { void submit(); }} />
      </View>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
  return StyleSheet.create({
    form: { gap: spacing.xl },
    section: { gap: spacing.md },
    note: { ...type.helper, color: colors.textSecondary },
    area: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceSunken },
    areaLabel: { ...type.helper, color: colors.textSecondary },
    areaValue: { ...type.body, color: colors.textPrimary },
    pinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.control, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface },
    pinRowPressed: { backgroundColor: colors.surfaceSunken },
    pinRowError: { borderColor: colors.error },
    pinIcon: { color: colors.accent },
    pinCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    pinLabel: { ...type.label, color: colors.textPrimary },
    pinAction: { ...type.label, color: colors.accent },
    job: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
    jobTitle: { ...type.label, color: colors.textPrimary },
    years: { flexDirection: 'row', gap: spacing.md },
    yearField: { flex: 1 },
  });
}
