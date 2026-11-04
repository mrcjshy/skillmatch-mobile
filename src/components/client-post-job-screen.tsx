import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useIsFocused, usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { KeyboardSpacer } from '@/components/skeleton';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppSymbol } from '@/components/app-symbol';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoPicker } from '@/components/job-photo-picker';
import { JobSkillSuggestionsPanel } from '@/components/job-skill-suggestions-panel';
import { JobLocationPicker } from '@/components/job-location-picker';
import { CheckBadge, COBALT, CobaltButton, CobaltTicket, GlowWell, LiftCard, StepStage } from '@/components/cobalt-ui';
import { PostJobSteps } from '@/components/post-job-steps';
import { PostingProgressOverlay } from '@/components/posting-progress-overlay';
import { waitForPostedChecklist } from '@/lib/posting-hold';
import { loadMyHomeLocation } from '@/lib/profile-details';
import type { CanonicalJobLocation } from '@/lib/canonical-job-location';
import { JobSchedulePicker } from '@/components/job-schedule-picker';
import { RadioRow } from '@/components/radio-row';
import { SectionHeader } from '@/components/section-header';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import { JOB_SKILL_SUGGESTIONS_ENABLED } from '@/lib/job-skill-suggestions';
import { descriptionPresetsForSkill } from '@/lib/job-description-presets';
import { postingDescriptionError, postingLocationError } from '@/lib/job-location';
import { submitClientPostJob } from '@/lib/client-post-job-submission';
import { openPostedJobMap, postingRecoveryNotice } from '@/lib/client-post-job-navigation';
import { useClientPostJobDraft, type ClientPostJobDraft, type FeePreset } from '@/providers/client-post-job-draft-provider';
import {
  formatJobPaymentReviewValue,
  JOB_PAYMENT_OPTIONS,
  postingPaymentError,
} from '@/lib/job-payment';
import { combineJobSchedule, postingScheduleError } from '@/lib/job-posting-schedule';
import { canAddPostJobSkill, orderedPostJobSkillIds, postJobSkillRole, togglePostJobSkill } from '@/lib/post-job-skill-selection';
import { type CatalogSkill } from '@/lib/skill-catalog';
import { validatePostJobWizardStep, type PostJobWizardStep } from '@/lib/post-job-wizard';
import { saveRecentLocation } from '@/lib/recent-locations';
import { JOB_LOCATION_DISPLAY_FALLBACK } from '@/lib/canonical-job-location';
import { useSession } from '@/providers/session-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';

/** Dedicated posting UI; committed values and operation lifetime belong to the Client draft provider. */

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

/** One title per real wizard step; the step count, order and validation live in the draft owner. */
const STEP_TITLES: Record<number, string> = {
  1: 'Service location',
  2: 'Job details',
  3: 'Schedule, budget and payment',
  4: 'Review and post',
};

const FEE_PRESETS = [
  { value: 300, label: '₱300' },
  { value: 500, label: '₱500' },
  { value: 1000, label: '₱1,000' },
  { value: 1500, label: '₱1,500' },
] as const;

function uniqueSkillIds(ids: readonly string[], knownIds: ReadonlySet<string>, excludeId?: string | null): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (excludeId != null && id === excludeId) continue;
    if (!knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function orderedSelectedSkills(
  catalog: readonly CatalogSkill[],
  primarySkillId: string | null,
  additionalSkillIds: readonly string[]
): CatalogSkill[] {
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const knownIds = new Set(byId.keys());
  const orderedIds =
    primarySkillId === null
      ? uniqueSkillIds(additionalSkillIds, knownIds)
      : [primarySkillId, ...uniqueSkillIds(additionalSkillIds, knownIds, primarySkillId)];
  const selected: CatalogSkill[] = [];
  for (const id of orderedIds) {
    const skill = byId.get(id);
    if (skill) selected.push(skill);
  }
  return selected;
}

export function ClientPostJobScreen() {
  const owner = useClientPostJobDraft();
  const session = useSession();
  const { draft, isPosting } = owner;
  // Finished posting stages (0…5) while the posting checklist covers the screen; null when hidden.
  const [postStages, setPostStages] = useState<number | null>(null);
  // The field wearing the focus glow (premium cobalt, owner 2026-11-04).
  const [glowField, setGlowField] = useState<'description' | 'budget' | null>(null);
  const { description, address, pin, locationNote, scheduleDate, scheduleTime, budgetText, feePreset, paymentMethod, primarySkillId, additionalSkillIds, modalQuery, modalPrimaryId, modalAdditionalIds, jobPhotos, wizardStep, postError, postSuccess, photoError } = draft;
  const navigation = useNavigation();
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { isLoading, loadError, skills, refresh } = useClientJobs();
  const [locationPickerBackHandlerRef] = useState<{ current: (() => void) | null }>(() => ({ current: null }));
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [retryingSkills, setRetryingSkills] = useState(false);
  /** The step-validation message last shown by Next; hidden once the current step no longer produces it. */
  const [shownValidationError, setShownValidationError] = useState<string | null>(null);
  const [suggestionAuthority] = useState(() => ({ revision: 0 }));
  const [presetChooser, setPresetChooser] = useState<{ skillId: string; pending: string | null } | null>(null);
  const [locationAuthority] = useState(() => ({ focused: true, generation: 0, pickerGeneration: 0, pickerOpen: false, owner, session }));
  // REG-02: the Client's sign-up home pin, offered as a one-tap Job location and as a Saved place.
  const [home, setHome] = useState<{ ownerId: string; location: CanonicalJobLocation } | null>(null);
  useEffect(() => {
    const ownerId = owner.ownerId;
    if (!ownerId) return undefined;
    let cancelled = false;
    void loadMyHomeLocation(ownerId).then((location) => { if (!cancelled && location) setHome({ ownerId, location }); });
    return () => { cancelled = true; };
  }, [owner.ownerId]);
  const homeLocation = home && home.ownerId === owner.ownerId ? home.location : null;
  const pinIsHome = !!homeLocation && !!pin && pin.latitude === homeLocation.pin.latitude && pin.longitude === homeLocation.pin.longitude;
  useLayoutEffect(() => { locationAuthority.focused = isFocused; locationAuthority.owner = owner; locationAuthority.session = session; }, [locationAuthority, isFocused, owner, session]);
  function invalidateSuggestions() { suggestionAuthority.revision++; }
  function setField<K extends keyof ClientPostJobDraft>(key: K, value: ClientPostJobDraft[K] | ((previous: ClientPostJobDraft[K]) => ClientPostJobDraft[K])) {
    owner.updateDraft(previous => ({ [key]: typeof value === 'function' ? value(previous[key]) : value }));
  }
  const setDescription = (value: ClientPostJobDraft['description'] | ((previous: ClientPostJobDraft['description']) => ClientPostJobDraft['description'])) => { invalidateSuggestions(); setField('description', value); };
  const setLocationNote = (value: ClientPostJobDraft['locationNote'] | ((previous: ClientPostJobDraft['locationNote']) => ClientPostJobDraft['locationNote'])) => setField('locationNote', value);
  const setScheduleDate = (value: ClientPostJobDraft['scheduleDate'] | ((previous: ClientPostJobDraft['scheduleDate']) => ClientPostJobDraft['scheduleDate'])) => setField('scheduleDate', value);
  const setScheduleTime = (value: ClientPostJobDraft['scheduleTime'] | ((previous: ClientPostJobDraft['scheduleTime']) => ClientPostJobDraft['scheduleTime'])) => setField('scheduleTime', value);
  const setBudgetText = (value: ClientPostJobDraft['budgetText'] | ((previous: ClientPostJobDraft['budgetText']) => ClientPostJobDraft['budgetText'])) => setField('budgetText', value);
  const setFeePreset = (value: ClientPostJobDraft['feePreset'] | ((previous: ClientPostJobDraft['feePreset']) => ClientPostJobDraft['feePreset'])) => setField('feePreset', value);
  const setPaymentMethod = (value: ClientPostJobDraft['paymentMethod'] | ((previous: ClientPostJobDraft['paymentMethod']) => ClientPostJobDraft['paymentMethod'])) => setField('paymentMethod', value);
  const setModalQuery = (value: ClientPostJobDraft['modalQuery'] | ((previous: ClientPostJobDraft['modalQuery']) => ClientPostJobDraft['modalQuery'])) => setField('modalQuery', value);
  const setJobPhotos = (value: ClientPostJobDraft['jobPhotos'] | ((previous: ClientPostJobDraft['jobPhotos']) => ClientPostJobDraft['jobPhotos'])) => { invalidateSuggestions(); setField('jobPhotos', value); };
  const setWizardStep = (value: ClientPostJobDraft['wizardStep'] | ((previous: ClientPostJobDraft['wizardStep']) => ClientPostJobDraft['wizardStep'])) => setField('wizardStep', value);
  const setPostError = (value: ClientPostJobDraft['postError'] | ((previous: ClientPostJobDraft['postError']) => ClientPostJobDraft['postError'])) => setField('postError', value);
  useFocusEffect(useCallback(() => () => {
    suggestionAuthority.revision++;
    locationAuthority.focused = false;
    locationAuthority.generation++;
    locationAuthority.pickerGeneration++;
    locationAuthority.pickerOpen = false;
    setLocationPickerVisible(false);
    setSkillsModalVisible(false);
  }, [suggestionAuthority, locationAuthority]));
  usePreventRemove(isFocused && owner.isOwnerCurrent() && (wizardStep > 1 || isPosting) && !locationPickerVisible && !skillsModalVisible, ({ data }) => {
    if (!owner.isOwnerCurrent() || (data.action.type !== 'GO_BACK' && data.action.type !== 'POP')) {
      navigation.dispatch(data.action);
      return;
    }
    if (!isPosting && wizardStep > 1) goToPreviousStep();
  });

  const knownSkillIds = new Set(skills.map((skill) => skill.id));
  const selectedSkills = orderedSelectedSkills(skills, primarySkillId, additionalSkillIds);
  const showBudgetField = feePreset === null || feePreset === 'custom';
  const hasSelectedSkills = selectedSkills.length > 0;
  // The picker edits a working copy; Done commits it and Cancel leaves the job's skills as they were.
  const modalSelection = { primarySkillId: modalPrimaryId, additionalSkillIds: modalAdditionalIds };

  function openLocationPicker() {
    if (busy || !isFocused || !owner.isOwnerCurrent()) return;
    locationAuthority.pickerGeneration++;
    locationAuthority.pickerOpen = true;
    setLocationNote(null);
    setLocationPickerVisible(true);
  }

  function closeLocationPicker() {
    locationAuthority.pickerGeneration++;
    locationAuthority.pickerOpen = false;
    setLocationPickerVisible(false);
  }

  function openSkillsModal() {
    if (!skillsReady || busy || !isFocused || !owner.isOwnerCurrent()) return;
    invalidateSuggestions();
    owner.updateDraft({
      modalPrimaryId: primarySkillId,
      modalAdditionalIds: uniqueSkillIds(additionalSkillIds, knownSkillIds, primarySkillId),
      modalQuery: '',
    });
    setSkillsModalVisible(true);
  }

  function closeSkillsModal() {
    invalidateSuggestions();
    setSkillsModalVisible(false);
    setModalQuery('');
  }

  function confirmSkillsModal() {
    if (!skillsReady || busy || !isFocused || !owner.isOwnerCurrent()) return;
    invalidateSuggestions();
    const ordered = orderedPostJobSkillIds(modalSelection).filter((id) => knownSkillIds.has(id));
    owner.updateDraft({ primarySkillId: ordered[0] ?? null, additionalSkillIds: ordered.slice(1) });
    closeSkillsModal();
  }

  /** One list: the first skill chosen is the primary, the next the secondary, no third; tapping again removes. */
  function toggleModalSkill(skillId: string) {
    if (!skillsReady || busy || !isFocused || !owner.isOwnerCurrent()) return;
    invalidateSuggestions();
    owner.updateDraft((previous) => {
      const next = togglePostJobSkill({ primarySkillId: previous.modalPrimaryId, additionalSkillIds: previous.modalAdditionalIds }, skillId);
      return { modalPrimaryId: next.primarySkillId, modalAdditionalIds: next.additionalSkillIds };
    });
  }

  function applyFeePreset(preset: FeePreset) {
    setFeePreset(preset);
    if (preset !== 'custom') {
      setBudgetText(String(preset));
    }
  }

  /** Presets only start an editable description; replacing written text needs confirmation. */
  function choosePreset(text: string) {
    if (busy || !isFocused || !owner.isOwnerCurrent() || primarySkillId === null) return;
    if (description.trim() === '') { setDescription(text); setPresetChooser(null); return; }
    setPresetChooser({ skillId: primarySkillId, pending: text });
  }

  function confirmPreset() {
    const pending = presetChooser?.pending;
    if (busy || !isFocused || !owner.isOwnerCurrent() || pending == null || presetChooser?.skillId !== primarySkillId) return;
    setDescription(pending);
    setPresetChooser(null);
  }

  function onBudgetTextChange(next: string) {
    setBudgetText(next);
    const matched = FEE_PRESETS.find((preset) => next.trim() === String(preset.value));
    setFeePreset(matched ? matched.value : 'custom');
  }

  function wizardDraft() {
    const trimmedBudget = budgetText.trim();
    const budgetIsValid = trimmedBudget === '' || /^\d+(\.\d{1,2})?$/.test(trimmedBudget);
    const budget = trimmedBudget === '' || !budgetIsValid ? null : Number(trimmedBudget);
    return {
      hasPrimarySkill: primarySkillId !== null && knownSkillIds.has(primarySkillId),
      descriptionError: postingDescriptionError(description),
      locationError: postingLocationError(address.trim(), pin),
      scheduleError: postingScheduleError(scheduleDate, scheduleTime),
      budgetError:
        !budgetIsValid || (budget !== null && (!Number.isFinite(budget) || budget < 0))
          ? 'Budget must be a number of 0 or more.'
          : null,
      paymentError: postingPaymentError(paymentMethod, budget),
    };
  }

  // One validation point per render: Next uses it, and the banner hides a shown message once it no longer applies.
  const stepError = wizardStep < 4 ? validatePostJobWizardStep(wizardStep, wizardDraft()) : null;

  function goToNextStep() {
    if (busy || !owner.isOwnerCurrent() || wizardStep >= 4 || (wizardStep === 2 && !skillsReady)) return;
    const error = stepError;
    if (error) {
      setShownValidationError(error);
      setPostError(error);
      return;
    }
    setPostError(null);
    invalidateSuggestions();
    setWizardStep((wizardStep + 1) as PostJobWizardStep);
  }

  function goToPreviousStep() {
    if (busy || !owner.isOwnerCurrent() || wizardStep <= 1) return;
    invalidateSuggestions();
    owner.updateDraft({ postError: null, wizardStep: (wizardStep - 1) as PostJobWizardStep });
  }

  async function handlePost() {
    if (!skillsReady || locationAuthority.pickerOpen || skillsModalVisible || !isFocused || !owner.isOwnerCurrent()) return;
    invalidateSuggestions();
    // The wizard's Post a job checklist takes the screen and its fifth step follows the real posting
    // stages; it holds briefly on "Job posted" so the last check lands, then the Job map (and the Itik
    // celebration) take over.
    let finished = 0;
    setPostStages(0);
    await submitClientPostJob({ owner, skills, refresh, onStage: (n) => { finished = n; setPostStages(n); } });
    if (finished >= 5) await waitForPostedChecklist();
    setPostStages(null);
    // Settlement publishes a server-confirmed Job ID after photo/refresh outcomes.
    // A lost screen lifetime retains that receipt for Home instead of navigating late.
    openPostedJobMap({
      isCurrent: () => locationAuthority.focused && AppState.currentState === 'active' && owner.isOwnerCurrent() && !owner.isPosting,
      takePendingCreatedJob: owner.takePendingCreatedJob,
      navigate: jobId => {
        const postingWarning = postingRecoveryNotice(owner.draft);
        router.replace({ pathname: '/client/job-details', params: { jobId, posted: '1', ...(postingWarning ? { postingWarning } : {}) } });
      },
    });
  }

  async function retrySkills() {
    if (retryingSkills || busy || !isFocused || !owner.isOwnerCurrent()) return;
    setRetryingSkills(true);
    try { await refresh(owner.ownerId); }
    catch { /* The provider retains its load error until a refresh succeeds. */ }
    finally { setRetryingSkills(false); }
  }

  const busy = isPosting;
  const skillsReady = !isLoading && !loadError && !retryingSkills;
  const budgetLabel = budgetText.trim() ? `₱${budgetText.trim()}` : 'Not specified';
  const showDock = wizardStep === 4 && !isLoading && !loadError;
  const locationGeneration = locationAuthority.pickerGeneration;
  const presetSkillId = primarySkillId !== null && knownSkillIds.has(primarySkillId) ? primarySkillId : null;
  const descriptionPresets = descriptionPresetsForSkill(presetSkillId);
  const presetsOpen = presetSkillId !== null && presetChooser?.skillId === presetSkillId;
  // With suggestions enabled, photos sit beside the panel that can use them.
  const photosSection = wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Job photos">
                <SectionHeader title="Photos" subtitle="Optional" />
                <JobPhotoPicker
                  photos={jobPhotos}
                  error={photoError}
                  ownerKey={owner.ownerId}
                  resetEpoch={owner.draftEpoch}
                  isOwnerCurrent={() => isFocused && owner.isOwnerCurrent()}
                  onErrorChange={(error) => owner.updateDraft({ photoError: error })}
                  disabled={busy}
                  onPhotosChange={setJobPhotos}
                />
              </View> : null;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >

        <View style={styles.form}>
          {/* The success words stay the confirmation; the static mascot follows them, never beside a post error. */}
          {postSuccess ? <View style={styles.successRow}>
            <Text style={[styles.success, styles.successCopy]}>{postSuccess}</Text>
            {postError ? null : <SkillMatchMascot pose="success" />}
          </View> : null}
              <View style={styles.progressBand}>
                {/* Recruiter Steps checklist (owner request): Location, Details, Schedule, Review, then Post. */}
                <PostJobSteps step={wizardStep} />
                <View style={styles.stepHeading}>
                  <Text accessibilityRole="header" style={styles.stepTitle}>{STEP_TITLES[wizardStep]}</Text>
                  {/* Step 1's section repeated this title; the step heading carries it, with the access note beneath. */}
                  {wizardStep === 1 ? <Text style={styles.stepLead}>Shared only with workers who qualify for this job.</Text> : null}
                </View>
              </View>

              {/* Steps travel on one horizontal axis: Next in from the right, Previous from the left. */}
              <StepStage step={wizardStep}>

              {/* Step 2 retains manual skill authority after optional reviewed suggestions. */}
              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Job details">
                <SectionHeader title="Describe the job" />
                <GlowWell focused={glowField === 'description'}>
                  <AppField
                    inputStyle={styles.descriptionInput}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe the work needed."
                    multiline
                    numberOfLines={3}
                    disabled={busy}
                    accessibilityLabel="Description"
                    cursorColor={colors.accent}
                    onFocus={() => setGlowField('description')}
                    onBlur={() => setGlowField((field) => (field === 'description' ? null : field))}
                  />
                </GlowWell>
              </View> : null}

              {JOB_SKILL_SUGGESTIONS_ENABLED ? photosSection : null}

              {JOB_SKILL_SUGGESTIONS_ENABLED && wizardStep === 2 && skillsReady ? <JobSkillSuggestionsPanel owner={owner} skills={skills} focused={isFocused} authority={suggestionAuthority} /> : null}

              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Required skills">
                <SectionHeader title="Required skills" subtitle="Up to two" />
                {isLoading || retryingSkills ? <InlineStatus variant="loading" skeleton="lines" message="Loading skills…" /> : loadError ? <InlineStatus variant="error" message={loadError} /> : null}
                {loadError ? <AppButton label="Retry skills" variant="secondary" onPress={retrySkills} disabled={busy || retryingSkills} /> : null}
                {/* One group and one picker: the chosen skills in order, then the single way to change them. */}
                <LiftCard>
                <SurfaceGroup style={styles.cardGroup}>
                  {selectedSkills.map((skill) => {
                    const role = postJobSkillRole({ primarySkillId, additionalSkillIds }, skill.id);
                    return (
                      <View key={skill.id} style={styles.skillRow} accessible accessibilityLabel={`${skill.skill_name}, ${role} skill`}>
                        <CheckBadge />
                        <Text style={styles.skillName}>{skill.skill_name}</Text>
                        {role ? <AppChip label={role} variant={role === 'Primary' ? 'selected' : 'neutral'} /> : null}
                      </View>
                    );
                  })}
                  <Pressable
                    style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                    onPress={openSkillsModal}
                    disabled={busy || !skillsReady}
                    accessibilityRole="button"
                    accessibilityLabel={hasSelectedSkills ? 'Edit skills' : 'Choose skills'}
                    accessibilityState={{ disabled: busy || !skillsReady }}
                  >
                    <View style={styles.choiceCopy}>
                      {hasSelectedSkills ? null : <Text style={styles.choicePlaceholder}>No skills selected yet.</Text>}
                      <Text style={styles.choiceAction}>{hasSelectedSkills ? 'Edit skills' : 'Choose skills'}</Text>
                    </View>
                    <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={size.icon} tintColor={colors.textSecondary} />
                  </Pressable>
                </SurfaceGroup>
                </LiftCard>
                {presetSkillId === null ? null : presetsOpen ? <View style={styles.section} accessibilityLabel="Description presets">
                  <Text style={styles.help}>Edit the parts in [brackets].</Text>
                  <SurfaceGroup>
                    {descriptionPresets.map((preset) => (
                      <Pressable
                        key={preset}
                        style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                        onPress={() => choosePreset(preset)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Use preset: ${preset}`}
                        accessibilityState={{ disabled: busy }}
                      >
                        <Text style={[styles.choiceValue, styles.choiceCopy]}>{preset}</Text>
                      </Pressable>
                    ))}
                  </SurfaceGroup>
                  {presetChooser?.pending != null ? <View style={styles.section} accessibilityLabel="Confirm replacing description">
                    <Text style={styles.help}>Replace your description with this preset?</Text>
                    <AppButton label="Replace description" onPress={confirmPreset} disabled={busy} />
                    <AppButton label="Keep my description" variant="secondary" onPress={() => setPresetChooser({ skillId: presetSkillId, pending: null })} disabled={busy} />
                  </View> : null}
                  <AppButton label="Close presets" variant="secondary" onPress={() => setPresetChooser(null)} disabled={busy} />
                </View> : <AppButton label="Start from a preset" variant="secondary" onPress={() => setPresetChooser({ skillId: presetSkillId, pending: null })} disabled={busy} />}
              </View> : null}

              {wizardStep === 1 ? <View style={styles.section} accessibilityLabel="Service location">
                <LiftCard>
                <SurfaceGroup style={styles.cardGroup}>
                  <Pressable
                    style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                    onPress={openLocationPicker}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={pin && address ? 'Change location' : 'Choose location'}
                    // The label names the action; the value carries what the row shows, so the
                    // confirmed address is heard ("Change location, Confirmed address: …").
                    accessibilityValue={{ text: address ? `${address === JOB_LOCATION_DISPLAY_FALLBACK ? 'General area' : 'Confirmed address'}: ${address}` : 'No location selected' }}
                    accessibilityState={{ disabled: busy }}
                  >
                    <View style={[styles.lead, pin && address ? cobaltStyles.leadCobalt : null]}>
                      <AppSymbol name={{ android: 'location_on', ios: 'mappin' }} size={size.icon} tintColor={pin && address ? COBALT.text : colors.accent} />
                    </View>
                    <View style={styles.choiceCopy}>
                      <Text style={styles.choiceLabel}>{address === JOB_LOCATION_DISPLAY_FALLBACK ? 'General area (selected pin confirmed)' : 'Confirmed address'}</Text>
                      <Text style={address ? styles.choiceValue : styles.choicePlaceholder}>
                        {address || 'No location selected'}
                      </Text>
                    </View>
                    <Text style={styles.choiceAction}>{pin && address ? 'Change' : 'Choose'}</Text>
                  </Pressable>
                  {homeLocation && !pinIsHome ? (
                    <Pressable
                      style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                      onPress={() => { if (!busy && owner.isOwnerCurrent()) owner.updateDraft({ pin: homeLocation.pin, address: homeLocation.address }); }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Use my home location"
                      accessibilityValue={{ text: `Saved at sign-up: ${homeLocation.address}` }}
                      accessibilityState={{ disabled: busy }}
                    >
                      <View style={styles.lead}>
                        <AppSymbol name={{ android: 'home', ios: 'house' }} size={size.icon} tintColor={colors.accent} />
                      </View>
                      <View style={styles.choiceCopy}>
                        <Text style={styles.choiceLabel}>Use my home location</Text>
                        <Text style={styles.choiceValue}>{homeLocation.address}</Text>
                      </View>
                      <Text style={styles.choiceAction}>Use</Text>
                    </Pressable>
                  ) : null}
                </SurfaceGroup>
                </LiftCard>
                {pinIsHome ? <Text style={styles.homeNote}>Using your home location from sign-up. Tap Change to pick another place.</Text> : null}
              </View> : null}

              {JOB_SKILL_SUGGESTIONS_ENABLED ? null : photosSection}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Schedule">
                <SectionHeader title="When" />
                <JobSchedulePicker
                  date={scheduleDate}
                  time={scheduleTime}
                  onChangeDate={setScheduleDate}
                  onChangeTime={setScheduleTime}
                  disabled={busy}
                />
              </View> : null}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Budget">
                <SectionHeader title="Budget" subtitle="Optional" />
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Fee presets"
                  style={styles.feePresetGroup}
                >
                  {FEE_PRESETS.map((preset) => {
                    const on = feePreset === preset.value;
                    return (
                      <Pressable
                        key={preset.value}
                        style={[styles.feePreset, on && cobaltStyles.feePresetSelected]}
                        onPress={() => applyFeePreset(preset.value)}
                        disabled={busy}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: busy }}
                        accessibilityLabel={preset.label}
                      >
                        {on ? <CheckBadge diameter={18} tone="white" /> : null}
                        <Text style={[styles.feePresetLabel, on && cobaltStyles.feePresetLabelSelected]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.feePreset, feePreset === 'custom' && cobaltStyles.feePresetSelected]}
                    onPress={() => applyFeePreset('custom')}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: feePreset === 'custom', disabled: busy }}
                    accessibilityLabel="Custom"
                  >
                    {feePreset === 'custom' ? <CheckBadge diameter={18} tone="white" /> : null}
                    <Text
                      style={[
                        styles.feePresetLabel,
                        feePreset === 'custom' && cobaltStyles.feePresetLabelSelected,
                      ]}
                    >
                      Custom
                    </Text>
                  </Pressable>
                </View>
                {showBudgetField ? (
                  <GlowWell focused={glowField === 'budget'}>
                  <View style={[styles.budgetField, glowField === 'budget' ? styles.budgetFieldFocused : null]}>
                    <Text style={styles.budgetPrefix}>₱</Text>
                    <TextInput
                      style={styles.budgetInput}
                      value={budgetText}
                      onChangeText={onBudgetTextChange}
                      placeholder="800"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      editable={!busy}
                      underlineColorAndroid="transparent"
                      accessibilityLabel="Budget in pesos"
                      cursorColor={colors.accent}
                      onFocus={() => setGlowField('budget')}
                      onBlur={() => setGlowField((field) => (field === 'budget' ? null : field))}
                    />
                  </View>
                  </GlowWell>
                ) : null}
              </View> : null}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Payment method">
                <SectionHeader title="Payment method" />
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Payment method"
                  style={styles.paymentGroup}
                >
                  {JOB_PAYMENT_OPTIONS.map((option) => (
                    <RadioRow
                      key={option.value}
                      label={option.label}
                      selected={paymentMethod === option.value}
                      disabled={busy}
                      accessibilityLabel={option.label}
                      appearance="cobalt"
                      onPress={() => setPaymentMethod(option.value)}
                    />
                  ))}
                </View>
              </View> : null}

              {wizardStep === 4 ? (
                <View style={styles.section} accessibilityLabel="Review and Post">
                  <SectionHeader title="Job summary" />
                  <CobaltTicket>
                    <FactRow tone="cobalt" icon={{ android: 'location_on', ios: 'mappin' }} label="Location" value={address.trim()} />
                    <FactRow tone="cobalt" icon={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} label="Skills" value={selectedSkills.map((skill) => skill.skill_name).join(', ')} strong />
                    <FactRow tone="cobalt" icon={{ android: 'description', ios: 'text.alignleft' }} label="Description" value={description.trim()} />
                    <FactRow tone="cobalt" icon={{ android: 'schedule', ios: 'clock' }} label="Schedule" value={formatDetailDateTime(combineJobSchedule(scheduleDate, scheduleTime)) ?? 'Not selected'} strong />
                    <FactRow tone="cobalt" icon={{ android: 'photo_library', ios: 'photo' }} label="Photos" value={`${jobPhotos.length} selected`} />
                    <FactRow tone="cobalt" icon={{ android: 'account_balance_wallet', ios: 'wallet.pass' }} label="Budget" value={budgetLabel} strong inline />
                    <FactRow tone="cobalt" icon={{ android: 'receipt_long', ios: 'doc.plaintext' }} label="Payment" value={formatJobPaymentReviewValue(paymentMethod)} inline />
                  </CobaltTicket>
                  <AppButton label="Edit location" variant="secondary" onPress={openLocationPicker} disabled={busy} />
                </View>
              ) : null}

              </StepStage>

              <View style={styles.wizardActions}>
                {wizardStep > 1 ? (
                  <AppButton style={wizardStep < 4 ? styles.wizardBack : styles.wizardBackAlone} variant="secondary" label="Previous step" onPress={goToPreviousStep} disabled={busy} />
                ) : null}
                {wizardStep < 4 ? (
                  <CobaltButton style={styles.wizardNext} label="Next" onPress={goToNextStep} disabled={busy || (wizardStep === 2 && !skillsReady)} />
                ) : null}
              </View>

              {wizardStep < 4 && postError && !(postError === shownValidationError && stepError !== postError)
                ? <InlineStatus variant="error" message={postError} /> : null}
        </View>
      </ScrollView>

      {/* Review only: no text input here, so the dock cannot fight the keyboard. */}
      {showDock ? (
        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityLabel="Post job">
          {postError ? <InlineStatus variant="error" message={postError} /> : null}
          <CobaltButton
            label="Post job"
            onPress={() => {
              void handlePost();
            }}
            loading={isPosting}
            disabled={busy || locationPickerVisible || skillsModalVisible}
            accessibilityLabel="Post job"
          />
        </View>
      ) : null}

      <KeyboardSpacer />

      {postStages !== null ? <PostingProgressOverlay finished={postStages} /> : null}

      <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (locationPickerBackHandlerRef.current) locationPickerBackHandlerRef.current(); else closeLocationPicker(); }}>
        {locationPickerVisible ? (
          <JobLocationPicker
            backHandlerRef={locationPickerBackHandlerRef}
            pin={pin}
            initialAddress={address}
            note={locationNote}
            onNote={setLocationNote}
            onCancel={closeLocationPicker}
            savedPlaces={homeLocation ? [{ label: 'Home (saved at sign-up)', location: homeLocation }] : []}
            onConfirm={(location) => {
              if (!isFocused || !locationAuthority.focused || !locationAuthority.pickerOpen || locationAuthority.pickerGeneration !== locationGeneration || AppState.currentState !== 'active' ||
                locationAuthority.owner.updateDraft !== owner.updateDraft || locationAuthority.session.sessionLifetime !== session.sessionLifetime ||
                session.sessionLifetime?.isCurrent() !== true || !(session.isSessionRevisionCurrent?.(session.sessionRevision ?? 0) ?? false) ||
                !owner.updateDraft({ pin: location.pin, address: location.address })) return;
              closeLocationPicker();
              const captured = { ownerId: owner.ownerId, updateDraft: owner.updateDraft, epoch: owner.draftEpoch,
                lifetime: session.sessionLifetime, revision: session.sessionRevision ?? 0, generation: locationAuthority.generation };
              void saveRecentLocation({ userId: captured.ownerId, isCurrent: () => {
                const current = locationAuthority;
                return AppState.currentState === 'active' && current.focused && current.generation === captured.generation && current.owner.ownerId === captured.ownerId &&
                  current.owner.updateDraft === captured.updateDraft && current.owner.draftEpoch === captured.epoch && current.owner.isOwnerCurrent() &&
                  current.session.sessionLifetime === captured.lifetime && captured.lifetime?.isCurrent() === true &&
                  (current.session.isSessionRevisionCurrent?.(captured.revision) ?? false);
              } }, location).catch(() => undefined);
            }}
          />
        ) : null}
      </Modal>

      <Modal visible={skillsModalVisible} animationType="slide" onRequestClose={closeSkillsModal}>
        <KeyboardAvoidingView
          style={styles.modalFlex}
          behavior="padding"
        >
          <View
            style={[
              styles.modalScreen,
              { paddingTop: insets.top + spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            <Text style={styles.modalTitle}>Choose skills</Text>
            <AppField variant="search" value={modalQuery} onChangeText={setModalQuery} accessibilityLabel="Search skills"
              placeholder="Search skills" autoCapitalize="none" autoCorrect={false} disabled={busy || !skillsReady} />
            <Text style={styles.help}>Up to two</Text>
            <ScrollView
              style={styles.modalFlex}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <SkillCatalogPicker
                hideSearch
                skills={skills}
                query={modalQuery}
                onQueryChange={setModalQuery}
                isSkillSelected={(skillId) => postJobSkillRole(modalSelection, skillId) !== null}
                onToggleSkill={toggleModalSkill}
                disabled={busy || !skillsReady}
                badgeForSkill={(skill) => postJobSkillRole(modalSelection, skill.id)}
                isSkillUnavailable={(skillId) => !canAddPostJobSkill(modalSelection, skillId)}
              />
            </ScrollView>
            <AppButton
              variant="primary"
              label="Done"
              onPress={confirmSkillsModal}
              disabled={busy}
              accessibilityLabel="Done"
            />
            <AppButton
              variant="secondary"
              label="Cancel"
              onPress={closeSkillsModal}
              disabled={busy}
              accessibilityLabel="Cancel"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    paddingBottom: spacing.xxxxl,
  },
  form: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  progressBand: {
    // Room for the checklist panel's shadow above the step title.
    gap: spacing.lg,
  },
  stepHeading: {
    gap: spacing.xs,
  },
  stepTitle: {
    ...type.display,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  stepLead: {
    ...type.helper,
    color: colors.textSecondary,
  },
  // White groups lift off the canvas on LiftCard's shadow instead of a hairline edge.
  cardGroup: {
    borderWidth: 0,
    borderRadius: radius.sheet - spacing.xs,
  },
  lead: {
    width: size.iconCircle,
    height: size.iconCircle,
    borderRadius: size.iconCircle / 2,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionInput: {
    minHeight: 140,
  },
  wizardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wizardBack: {
    flexShrink: 0,
  },
  wizardBackAlone: {
    flexGrow: 1,
  },
  wizardNext: {
    flex: 1,
  },
  choiceRow: {
    minHeight: size.listRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  choiceRowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  choiceLabel: {
    ...type.helper,
    color: colors.textSecondary,
  },
  choiceValue: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  choicePlaceholder: {
    ...type.body,
    color: colors.textSecondary,
  },
  choiceAction: {
    ...type.label,
    color: colors.accent,
    flexShrink: 0,
  },
  skillRow: {
    minHeight: size.listRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  skillName: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
    flex: 1,
  },
  feePresetGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  feePreset: {
    minHeight: size.ghostButton,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    boxShadow: '0px 2px 6px rgba(13, 22, 41, 0.06)',
  },
  feePresetLabel: {
    ...type.label,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  budgetField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.fieldHeight,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingLeft: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderCurve: 'continuous',
  },
  budgetFieldFocused: {
    borderColor: colors.accent,
  },
  budgetPrefix: {
    ...type.body,
    color: colors.textSecondary,
  },
  budgetInput: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  paymentGroup: {
    gap: spacing.sm,
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  dock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    // Lifted by an upward shadow rather than a hairline.
    boxShadow: '0px -10px 24px rgba(13, 22, 41, 0.06)',
  },
  success: {
    ...type.helper,
    color: colors.success,
  },
  homeNote: { ...type.helper, color: colors.textSecondary, paddingTop: spacing.sm },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  successCopy: {
    flex: 1,
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

// Chosen things turn lit cobalt, like the Recruiter Steps panel (components/cobalt-ui.tsx). Kept
// apart from `styles`, which holds only theme tokens.
const cobaltStyles = StyleSheet.create({
  leadCobalt: {
    backgroundColor: COBALT.base,
    experimental_backgroundImage: COBALT.sheen,
  },
  // Same 1dp edge as an unchosen chip, so nothing shifts.
  feePresetSelected: {
    backgroundColor: COBALT.base,
    borderColor: COBALT.base,
    experimental_backgroundImage: COBALT.sheen,
    boxShadow: '0px 8px 18px rgba(28, 58, 166, 0.28)',
  },
  feePresetLabelSelected: {
    color: COBALT.text,
  },
});
