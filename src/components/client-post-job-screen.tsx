import { useCallback, useState } from 'react';
import {
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
import { useFocusEffect, useNavigation } from 'expo-router';
import { useHeaderHeight, useIsFocused, usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { AppSymbol } from '@/components/app-symbol';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoPicker } from '@/components/job-photo-picker';
import { JobLocationPicker } from '@/components/job-location-picker';
import { JobSchedulePicker } from '@/components/job-schedule-picker';
import { RadioRow } from '@/components/radio-row';
import { SectionHeader } from '@/components/section-header';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { formatDetailDateTime } from '@/lib/date-time';
import { postingDescriptionError, postingLocationError } from '@/lib/job-location';
import { submitClientPostJob } from '@/lib/client-post-job-submission';
import { useClientPostJobDraft, type ClientPostJobDraft, type FeePreset } from '@/providers/client-post-job-draft-provider';
import {
  postingPaymentError,
} from '@/lib/job-payment';
import { combineJobSchedule, postingScheduleError } from '@/lib/job-posting-schedule';
import { canAddPostJobSkill, orderedPostJobSkillIds, postJobSkillRole, togglePostJobSkill } from '@/lib/post-job-skill-selection';
import { type CatalogSkill } from '@/lib/skill-catalog';
import { validatePostJobWizardStep, type PostJobWizardStep } from '@/lib/post-job-wizard';
import { saveRecentLocation } from '@/lib/recent-locations';
import { useClientJobs } from '@/providers/client-jobs-provider';

/** Dedicated posting UI; committed values and operation lifetime belong to the Client draft provider. */

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

const PAYMENT_OPTIONS = [
  { value: 'cod', label: 'Cash', meaning: 'The worker confirms the cash after the job.' },
  { value: 'qrph', label: 'QR Ph', meaning: 'Pay through QR Ph. Payments run in test mode.' },
] as const;

/** One title per real wizard step; the step count, order and validation live in the draft owner. */
const STEP_TITLES: Record<number, string> = {
  1: 'What needs to be done',
  2: 'Where',
  3: 'When, budget and payment',
  4: 'Review your job',
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
  const { draft, isPosting } = owner;
  const { description, address, pin, locationNote, scheduleDate, scheduleTime, budgetText, feePreset, paymentMethod, primarySkillId, additionalSkillIds, modalQuery, modalPrimaryId, modalAdditionalIds, jobPhotos, wizardStep, postError, postSuccess, photoError } = draft;
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { isLoading, loadError, skills, refresh } = useClientJobs();
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  function setField<K extends keyof ClientPostJobDraft>(key: K, value: ClientPostJobDraft[K] | ((previous: ClientPostJobDraft[K]) => ClientPostJobDraft[K])) {
    owner.updateDraft(previous => ({ [key]: typeof value === 'function' ? value(previous[key]) : value }));
  }
  const setDescription = (value: ClientPostJobDraft['description'] | ((previous: ClientPostJobDraft['description']) => ClientPostJobDraft['description'])) => setField('description', value);
  const setLocationNote = (value: ClientPostJobDraft['locationNote'] | ((previous: ClientPostJobDraft['locationNote']) => ClientPostJobDraft['locationNote'])) => setField('locationNote', value);
  const setScheduleDate = (value: ClientPostJobDraft['scheduleDate'] | ((previous: ClientPostJobDraft['scheduleDate']) => ClientPostJobDraft['scheduleDate'])) => setField('scheduleDate', value);
  const setScheduleTime = (value: ClientPostJobDraft['scheduleTime'] | ((previous: ClientPostJobDraft['scheduleTime']) => ClientPostJobDraft['scheduleTime'])) => setField('scheduleTime', value);
  const setBudgetText = (value: ClientPostJobDraft['budgetText'] | ((previous: ClientPostJobDraft['budgetText']) => ClientPostJobDraft['budgetText'])) => setField('budgetText', value);
  const setFeePreset = (value: ClientPostJobDraft['feePreset'] | ((previous: ClientPostJobDraft['feePreset']) => ClientPostJobDraft['feePreset'])) => setField('feePreset', value);
  const setPaymentMethod = (value: ClientPostJobDraft['paymentMethod'] | ((previous: ClientPostJobDraft['paymentMethod']) => ClientPostJobDraft['paymentMethod'])) => setField('paymentMethod', value);
  const setModalQuery = (value: ClientPostJobDraft['modalQuery'] | ((previous: ClientPostJobDraft['modalQuery']) => ClientPostJobDraft['modalQuery'])) => setField('modalQuery', value);
  const setJobPhotos = (value: ClientPostJobDraft['jobPhotos'] | ((previous: ClientPostJobDraft['jobPhotos']) => ClientPostJobDraft['jobPhotos'])) => setField('jobPhotos', value);
  const setWizardStep = (value: ClientPostJobDraft['wizardStep'] | ((previous: ClientPostJobDraft['wizardStep']) => ClientPostJobDraft['wizardStep'])) => setField('wizardStep', value);
  const setPostError = (value: ClientPostJobDraft['postError'] | ((previous: ClientPostJobDraft['postError']) => ClientPostJobDraft['postError'])) => setField('postError', value);
  useFocusEffect(useCallback(() => () => {
    setLocationPickerVisible(false);
    setSkillsModalVisible(false);
  }, []));
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

  function openSkillsModal() {
    owner.updateDraft({
      modalPrimaryId: primarySkillId,
      modalAdditionalIds: uniqueSkillIds(additionalSkillIds, knownSkillIds, primarySkillId),
      modalQuery: '',
    });
    setSkillsModalVisible(true);
  }

  function closeSkillsModal() {
    setSkillsModalVisible(false);
    setModalQuery('');
  }

  function confirmSkillsModal() {
    const ordered = orderedPostJobSkillIds(modalSelection).filter((id) => knownSkillIds.has(id));
    owner.updateDraft({ primarySkillId: ordered[0] ?? null, additionalSkillIds: ordered.slice(1) });
    closeSkillsModal();
  }

  /** One list: the first skill chosen is the primary, the next the secondary, no third; tapping again removes. */
  function toggleModalSkill(skillId: string) {
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

  function goToNextStep() {
    if (busy || !owner.isOwnerCurrent() || wizardStep >= 4) return;
    const error = validatePostJobWizardStep(wizardStep, wizardDraft());
    if (error) {
      setPostError(error);
      return;
    }
    setPostError(null);
    setWizardStep((wizardStep + 1) as PostJobWizardStep);
  }

  function goToPreviousStep() {
    if (busy || !owner.isOwnerCurrent() || wizardStep <= 1) return;
    owner.updateDraft({ postError: null, wizardStep: (wizardStep - 1) as PostJobWizardStep });
  }

  async function handlePost() {
    if (isLoading || loadError || !isFocused || !owner.isOwnerCurrent()) return;
    await submitClientPostJob({ owner, skills, refresh });
  }

  const busy = isPosting;
  const budgetLabel = budgetText.trim() ? `₱${budgetText.trim()}` : 'Not specified';
  const showDock = wizardStep === 4 && !isLoading && !loadError;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >

        <View style={styles.form}>
          {/* The success words stay the confirmation; the static mascot follows them, never beside a post error. */}
          {postSuccess ? <View style={styles.successRow}>
            <Text style={[styles.success, styles.successCopy]}>{postSuccess}</Text>
            {postError ? null : <SkillMatchMascot pose="success" />}
          </View> : null}
          {isLoading ? (
            <InlineStatus variant="loading" message="Loading…" />
          ) : loadError ? (
            <InlineStatus variant="error" message={loadError} />
          ) : (
            <>
              <View style={styles.progressBand}>
                <View style={styles.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {[1, 2, 3, 4].map(step => <View key={step} style={[styles.progressSegment, step <= wizardStep && styles.progressSegmentComplete]} />)}
                </View>
                <Text style={styles.wizardProgress}>Step {wizardStep} of 4</Text>
                <Text accessibilityRole="header" style={styles.stepTitle}>{STEP_TITLES[wizardStep]}</Text>
              </View>

              {/* Step 1. The description, then the skills it implies. A future
                  description -> optional photo -> suggested-skill block belongs between
                  these two sections; the manual skill choice below stays authoritative. */}
              {wizardStep === 1 ? <View style={styles.section} accessibilityLabel="Job details">
                <SectionHeader title="Describe the job" />
                <AppField
                  inputStyle={styles.descriptionInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the work needed."
                  helperText="Required."
                  multiline
                  numberOfLines={3}
                  disabled={busy}
                  accessibilityLabel="Description"
                />
              </View> : null}

              {wizardStep === 1 ? <View style={styles.section} accessibilityLabel="Required skills">
                <SectionHeader title="Required skills" subtitle="Choose up to two skills. The first is the primary skill and the second the secondary." />
                {/* One group and one picker: the chosen skills in order, then the single way to change them. */}
                <SurfaceGroup>
                  {selectedSkills.map((skill) => {
                    const role = postJobSkillRole({ primarySkillId, additionalSkillIds }, skill.id);
                    return (
                      <View key={skill.id} style={styles.skillRow} accessible accessibilityLabel={`${skill.skill_name}, ${role} skill`}>
                        <Text style={styles.skillName}>{skill.skill_name}</Text>
                        {role ? <AppChip label={role} variant={role === 'Primary' ? 'selected' : 'neutral'} /> : null}
                      </View>
                    );
                  })}
                  <Pressable
                    style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                    onPress={openSkillsModal}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={hasSelectedSkills ? 'Edit skills' : 'Choose skills'}
                    accessibilityState={{ disabled: busy }}
                  >
                    <View style={styles.choiceCopy}>
                      {hasSelectedSkills ? null : <Text style={styles.choicePlaceholder}>No skills selected yet.</Text>}
                      <Text style={styles.choiceAction}>{hasSelectedSkills ? 'Edit skills' : 'Choose skills'}</Text>
                    </View>
                    <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={size.icon} tintColor={colors.textSecondary} />
                  </Pressable>
                </SurfaceGroup>
              </View> : null}

              {/* Step 2. Location surface: a later map region (centre pin, recenter,
                  explicit confirm) sits above this row without changing the step. */}
              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Location and Photos">
                <SectionHeader title="Service location" subtitle="Workers see only the general area until they accept." />
                <SurfaceGroup>
                  <Pressable
                    style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                    onPress={() => { setLocationNote(null); setLocationPickerVisible(true); }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={pin && address ? 'Change location' : 'Choose location'}
                    // The label names the action; the value carries what the row shows, so the
                    // confirmed address is heard ("Change location, Confirmed address: …").
                    accessibilityValue={{ text: address ? `Confirmed address: ${address}` : 'No location selected' }}
                    accessibilityState={{ disabled: busy }}
                  >
                    <AppSymbol name={{ android: 'location_on', ios: 'mappin' }} size={size.icon} tintColor={colors.accent} />
                    <View style={styles.choiceCopy}>
                      <Text style={styles.choiceLabel}>Confirmed address</Text>
                      <Text style={address ? styles.choiceValue : styles.choicePlaceholder}>
                        {address || 'No location selected'}
                      </Text>
                    </View>
                    <Text style={styles.choiceAction}>{pin && address ? 'Change' : 'Choose'}</Text>
                  </Pressable>
                </SurfaceGroup>
              </View> : null}

              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Job photos">
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
              </View> : null}

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
                        style={[styles.feePreset, on && styles.feePresetSelected]}
                        onPress={() => applyFeePreset(preset.value)}
                        disabled={busy}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: busy }}
                        accessibilityLabel={preset.label}
                      >
                        <Text style={[styles.feePresetLabel, on && styles.feePresetLabelSelected]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.feePreset, feePreset === 'custom' && styles.feePresetSelected]}
                    onPress={() => applyFeePreset('custom')}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: feePreset === 'custom', disabled: busy }}
                    accessibilityLabel="Custom"
                  >
                    <Text
                      style={[
                        styles.feePresetLabel,
                        feePreset === 'custom' && styles.feePresetLabelSelected,
                      ]}
                    >
                      Custom
                    </Text>
                  </Pressable>
                </View>
                {showBudgetField ? (
                  <View style={styles.budgetField}>
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
                    />
                  </View>
                ) : null}
              </View> : null}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Payment method">
                <SectionHeader title="Payment method" subtitle="Required. Workers see this before they accept." />
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Payment method"
                  style={styles.paymentGroup}
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <RadioRow
                      key={option.value}
                      label={option.label}
                      meaning={option.meaning}
                      selected={paymentMethod === option.value}
                      disabled={busy}
                      accessibilityLabel={option.label}
                      onPress={() => setPaymentMethod(option.value)}
                    />
                  ))}
                </View>
                {paymentMethod === 'qrph' ? (
                  <Text style={styles.help}>QR Ph needs a budget of at least ₱1.00.</Text>
                ) : null}
              </View> : null}

              {wizardStep === 4 ? (
                <View style={styles.section} accessibilityLabel="Review and Post">
                  <SectionHeader title="Job summary" subtitle="Check the details, then post." />
                  <SurfaceGroup>
                    <FactRow icon={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} label="Skills" value={selectedSkills.map((skill) => skill.skill_name).join(', ')} strong />
                    <FactRow icon={{ android: 'description', ios: 'text.alignleft' }} label="Description" value={description.trim()} />
                    <FactRow icon={{ android: 'schedule', ios: 'clock' }} label="Schedule" value={formatDetailDateTime(combineJobSchedule(scheduleDate, scheduleTime)) ?? 'Not selected'} strong />
                    <FactRow icon={{ android: 'location_on', ios: 'mappin' }} label="Location" value={address.trim()} />
                    <FactRow icon={{ android: 'photo_library', ios: 'photo' }} label="Photos" value={`${jobPhotos.length} selected`} />
                    <FactRow icon={{ android: 'account_balance_wallet', ios: 'wallet.pass' }} label="Budget" value={budgetLabel} strong inline />
                    <FactRow icon={{ android: 'receipt_long', ios: 'doc.plaintext' }} label="Payment" value={paymentMethod === 'cod' ? 'Cash' : paymentMethod === 'qrph' ? 'QR Ph' : 'Not selected'} inline />
                  </SurfaceGroup>
                </View>
              ) : null}

              <View style={styles.wizardActions}>
                {wizardStep > 1 ? (
                  <AppButton style={styles.wizardAction} variant="secondary" label="Previous step" onPress={goToPreviousStep} disabled={busy} />
                ) : null}
                {wizardStep < 4 ? (
                  <AppButton style={styles.wizardAction} variant="primary" label="Next" onPress={goToNextStep} disabled={busy} />
                ) : null}
              </View>

              {wizardStep < 4 && postError ? <InlineStatus variant="error" message={postError} /> : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* Review only: no text input here, so the dock cannot fight the keyboard. */}
      {showDock ? (
        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityLabel="Post job">
          {postError ? <InlineStatus variant="error" message={postError} /> : null}
          <View style={styles.dockRow}>
            <View style={styles.dockSummary} accessible accessibilityLabel={`Budget: ${budgetLabel}`}>
              <Text style={styles.dockCaption}>Budget</Text>
              <Text style={styles.dockAmount}>{budgetLabel}</Text>
            </View>
            <View style={styles.dockAction}>
              <AppButton
                variant="primary"
                label="Post job"
                onPress={() => {
                  void handlePost();
                }}
                loading={isPosting}
                disabled={busy}
                accessibilityLabel="Post job"
              />
            </View>
          </View>
        </View>
      ) : null}

      <Modal visible={locationPickerVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setLocationPickerVisible(false)}>
        {locationPickerVisible ? (
          <JobLocationPicker
            pin={pin}
            initialAddress={address}
            note={locationNote}
            onNote={setLocationNote}
            onCancel={() => setLocationPickerVisible(false)}
            onConfirm={(location) => {
              if (!isFocused || !owner.updateDraft({ pin: location.pin, address: location.address })) return;
              setLocationPickerVisible(false);
              void saveRecentLocation(location).catch(() => undefined);
            }}
          />
        ) : null}
      </Modal>

      <Modal visible={skillsModalVisible} animationType="slide" onRequestClose={closeSkillsModal}>
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
            <Text style={styles.modalTitle}>Choose skills</Text>
            <Text style={styles.help}>
              Choose up to two skills. The first is the primary skill and the second the secondary. Tap a chosen skill to remove it.
            </Text>
            <ScrollView
              style={styles.modalFlex}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <SkillCatalogPicker
                skills={skills}
                query={modalQuery}
                onQueryChange={setModalQuery}
                isSkillSelected={(skillId) => postJobSkillRole(modalSelection, skillId) !== null}
                onToggleSkill={toggleModalSkill}
                disabled={busy}
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
    </KeyboardAvoidingView>
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
    gap: spacing.sm,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressSegment: {
    flex: 1,
    height: spacing.xs,
    backgroundColor: colors.hairline,
    borderRadius: radius.pill,
  },
  progressSegmentComplete: {
    backgroundColor: colors.accent,
  },
  wizardProgress: {
    ...type.helper,
    color: colors.textSecondary,
  },
  stepTitle: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  descriptionInput: {
    minHeight: 140,
  },
  wizardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wizardAction: {
    flexGrow: 1,
    flexBasis: 120,
    flexShrink: 1,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  skillName: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  feePresetGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  feePreset: {
    minHeight: size.ghostButton,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    justifyContent: 'center',
  },
  feePresetSelected: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  feePresetLabel: {
    ...type.label,
    color: colors.textPrimary,
  },
  feePresetLabelSelected: {
    color: colors.accentPressed,
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
  budgetPrefix: {
    ...type.body,
    color: colors.textSecondary,
  },
  budgetInput: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  dockRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.lg,
  },
  dockSummary: {
    gap: spacing.xxs,
  },
  dockCaption: {
    ...type.helper,
    color: colors.textSecondary,
  },
  dockAmount: {
    ...type.money,
    color: colors.textPrimary,
  },
  dockAction: {
    flex: 1,
    minWidth: 148,
  },
  success: {
    ...type.helper,
    color: colors.success,
  },
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
