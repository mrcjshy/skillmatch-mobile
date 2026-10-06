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
import { useIsFocused, usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppField } from '@/components/app-field';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoPicker } from '@/components/job-photo-picker';
import { JobLocationPicker } from '@/components/job-location-picker';
import { JobSchedulePicker } from '@/components/job-schedule-picker';
import { SectionHeader } from '@/components/section-header';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SkillListSummary } from '@/components/skill-list-summary';
import { SkillMatchTheme } from '@/constants/theme';
import { postingDescriptionError, postingLocationError } from '@/lib/job-location';
import { submitClientPostJob } from '@/lib/client-post-job-submission';
import { useClientPostJobDraft, type ClientPostJobDraft, type FeePreset } from '@/providers/client-post-job-draft-provider';
import {
  postingPaymentError,
} from '@/lib/job-payment';
import { combineJobSchedule, postingScheduleError } from '@/lib/job-posting-schedule';
import { type CatalogSkill } from '@/lib/skill-catalog';
import { validatePostJobWizardStep, type PostJobWizardStep } from '@/lib/post-job-wizard';
import { saveRecentLocation } from '@/lib/recent-locations';
import { useClientJobs } from '@/providers/client-jobs-provider';

/** Dedicated posting UI; committed values and operation lifetime belong to the Client draft provider. */

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

const PAYMENT_OPTIONS = [
  { value: 'cod', label: 'Cash' },
  { value: 'qrph', label: 'QR Ph' },
] as const;

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
  const { description, address, pin, locationNote, scheduleDate, scheduleTime, budgetText, feePreset, paymentMethod, primarySkillId, additionalSkillIds, skillsModalMode, modalQuery, modalPrimaryId, modalAdditionalIds, jobPhotos, wizardStep, postError, postSuccess, photoError } = draft;
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
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
  const setPrimarySkillId = (value: ClientPostJobDraft['primarySkillId'] | ((previous: ClientPostJobDraft['primarySkillId']) => ClientPostJobDraft['primarySkillId'])) => setField('primarySkillId', value);
  const setAdditionalSkillIds = (value: ClientPostJobDraft['additionalSkillIds'] | ((previous: ClientPostJobDraft['additionalSkillIds']) => ClientPostJobDraft['additionalSkillIds'])) => setField('additionalSkillIds', value);
  const setSkillsModalMode = (value: ClientPostJobDraft['skillsModalMode'] | ((previous: ClientPostJobDraft['skillsModalMode']) => ClientPostJobDraft['skillsModalMode'])) => setField('skillsModalMode', value);
  const setModalQuery = (value: ClientPostJobDraft['modalQuery'] | ((previous: ClientPostJobDraft['modalQuery']) => ClientPostJobDraft['modalQuery'])) => setField('modalQuery', value);
  const setModalPrimaryId = (value: ClientPostJobDraft['modalPrimaryId'] | ((previous: ClientPostJobDraft['modalPrimaryId']) => ClientPostJobDraft['modalPrimaryId'])) => setField('modalPrimaryId', value);
  const setModalAdditionalIds = (value: ClientPostJobDraft['modalAdditionalIds'] | ((previous: ClientPostJobDraft['modalAdditionalIds']) => ClientPostJobDraft['modalAdditionalIds'])) => setField('modalAdditionalIds', value);
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
  const primarySkill = skills.find((skill) => skill.id === primarySkillId) ?? null;
  const selectedSkills = orderedSelectedSkills(skills, primarySkillId, additionalSkillIds);
  const showBudgetField = feePreset === null || feePreset === 'custom';
  const hasSelectedSkills = selectedSkills.length > 0;
  const lockedModalPrimaryId = modalPrimaryId;

  function openSkillsModal(mode: 'primary' | 'additional') {
    setSkillsModalMode(mode);
    setModalPrimaryId(primarySkillId);
    setModalAdditionalIds(uniqueSkillIds(additionalSkillIds, knownSkillIds, primarySkillId));
    setModalQuery('');
    setSkillsModalVisible(true);
  }

  function closeSkillsModal() {
    setSkillsModalVisible(false);
    setModalQuery('');
  }

  function confirmSkillsModal() {
    const nextPrimary =
      modalPrimaryId !== null && knownSkillIds.has(modalPrimaryId) ? modalPrimaryId : primarySkillId;
    if (nextPrimary !== null && knownSkillIds.has(nextPrimary)) {
      setPrimarySkillId(nextPrimary);
    }
    setAdditionalSkillIds(uniqueSkillIds(modalAdditionalIds, knownSkillIds, nextPrimary));
    closeSkillsModal();
  }

  function toggleModalSkill(skillId: string) {
    if (skillsModalMode === 'primary') {
      if (skillId === modalPrimaryId) return;
      setModalPrimaryId(skillId);
      setModalAdditionalIds((prev) => uniqueSkillIds(prev, knownSkillIds, skillId));
      return;
    }
    if (lockedModalPrimaryId !== null && skillId === lockedModalPrimaryId) return;
    if (lockedModalPrimaryId === null) {
      setModalPrimaryId(skillId);
      return;
    }
    setModalAdditionalIds((prev) => {
      if (prev.includes(skillId)) return prev.filter((id) => id !== skillId);
      return [...prev, skillId];
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >

        <View style={styles.form}>
          {postSuccess ? <Text style={styles.success}>{postSuccess}</Text> : null}
          {isLoading ? (
            <InlineStatus variant="loading" message="Loading…" />
          ) : loadError ? (
            <InlineStatus variant="error" message={loadError} />
          ) : (
            <>
              <Text style={styles.wizardProgress}>Step {wizardStep} / 4</Text>
              {wizardStep === 1 ? <View style={styles.section} accessibilityLabel="Job Details">
                <SectionHeader title="Job Details" />
                <AppField
                  label="Description"
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

              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Location and Photos">
                <SectionHeader title="Location & Photos" />
                <AppCard>
                  <Text style={styles.fieldLabel}>Service Location</Text>
                  <Text accessibilityLabel="Confirmed job address" style={styles.locationAddress}>
                    {address || 'No location selected'}
                  </Text>
                  <AppButton
                    label={pin && address ? 'Change Location' : 'Choose Location'}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => { setLocationNote(null); setLocationPickerVisible(true); }}
                  />
                </AppCard>
              </View> : null}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Schedule">
                <SectionHeader title="Schedule & Payment" />
                <JobSchedulePicker
                  date={scheduleDate}
                  time={scheduleTime}
                  onChangeDate={setScheduleDate}
                  onChangeTime={setScheduleTime}
                  disabled={busy}
                />
              </View> : null}

              {wizardStep === 3 ? <View style={styles.section} accessibilityLabel="Budget and Payment">
                <Text style={styles.fieldLabel}>Budget (Optional)</Text>
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
                      placeholderTextColor={colors.textDisabled}
                      keyboardType="numeric"
                      editable={!busy}
                      underlineColorAndroid="transparent"
                      accessibilityLabel="Budget in pesos"
                    />
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>Payment Method</Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Payment Method"
                  style={styles.paymentGroup}
                >
                  {PAYMENT_OPTIONS.map((option) => {
                    const on = paymentMethod === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[styles.paymentOption, on && styles.paymentOptionSelected]}
                        onPress={() => setPaymentMethod(option.value)}
                        disabled={busy}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: busy }}
                        accessibilityLabel={option.label}
                      >
                        <Text style={[styles.paymentLabel, on && styles.paymentLabelSelected]}>
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
              </View> : null}

              {wizardStep === 1 ? <View style={styles.section} accessibilityLabel="Required Skills">
                <SectionHeader title="Required Skills" />
                <Text style={styles.fieldLabel}>Primary skill</Text>
                <Text style={styles.help}>
                  Required. This is the visible service identity.
                </Text>
                {primarySkill ? (
                  <View style={styles.primarySelected} accessibilityLabel="Selected primary skill">
                    <Text style={styles.primarySelectedName} numberOfLines={3}>
                      {primarySkill.skill_name}
                    </Text>
                    <Pressable
                      onPress={() => openSkillsModal('primary')}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Change primary skill"
                      accessibilityState={{ disabled: busy }}
                    >
                      <Text style={styles.changePrimary}>Change</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => openSkillsModal('primary')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Choose primary skill"
                    accessibilityState={{ disabled: busy }}
                  >
                    <Text style={styles.help}>Choose the main skill for this job.</Text>
                    <Text style={styles.changePrimary}>Choose</Text>
                  </Pressable>
                )}

                <SkillListSummary
                  skills={selectedSkills}
                  emptyLabel="No skills selected yet."
                  onPressView={hasSelectedSkills ? () => openSkillsModal('additional') : undefined}
                  viewLabel={hasSelectedSkills ? 'Edit Skills' : undefined}
                />
                <AppButton
                  variant="secondary"
                  label={hasSelectedSkills ? 'Edit Skills' : 'Choose Skills'}
                  onPress={() => openSkillsModal('additional')}
                  disabled={busy}
                  accessibilityLabel={hasSelectedSkills ? 'Edit Skills' : 'Choose Skills'}
                />
              </View> : null}

              {wizardStep === 2 ? <View style={styles.section} accessibilityLabel="Job Photos">
                <SectionHeader title="Photos (Optional)" />
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

              {wizardStep === 4 ? (
                <View style={styles.section} accessibilityLabel="Review and Post">
                  <SectionHeader title="Review & Post" />
                  <AppCard>
                    <Text style={styles.fieldLabel}>Skills</Text>
                    <Text style={styles.reviewValue}>{selectedSkills.map((skill) => skill.skill_name).join(', ')}</Text>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <Text style={styles.reviewValue}>{description.trim()}</Text>
                    <Text style={styles.fieldLabel}>Location</Text>
                    <Text style={styles.reviewValue}>{address.trim()}</Text>
                    <Text style={styles.fieldLabel}>Photos</Text>
                    <Text style={styles.reviewValue}>{jobPhotos.length} selected</Text>
                    <Text style={styles.fieldLabel}>Schedule</Text>
                    <Text style={styles.reviewValue}>{combineJobSchedule(scheduleDate, scheduleTime)?.toLocaleString() ?? 'Not selected'}</Text>
                    <Text style={styles.fieldLabel}>Budget</Text>
                    <Text style={styles.reviewValue}>{budgetText.trim() ? `₱${budgetText.trim()}` : 'Not specified'}</Text>
                    <Text style={styles.fieldLabel}>Payment</Text>
                    <Text style={styles.reviewValue}>{paymentMethod === 'cod' ? 'Cash' : paymentMethod === 'qrph' ? 'QR Ph' : 'Not selected'}</Text>
                  </AppCard>
                </View>
              ) : null}

              <View style={styles.wizardActions}>
                {wizardStep > 1 ? (
                  <AppButton variant="secondary" label="Back" onPress={goToPreviousStep} disabled={busy} />
                ) : null}
                {wizardStep < 4 ? (
                  <AppButton variant="primary" label="Next" onPress={goToNextStep} disabled={busy} />
                ) : null}
              </View>

              {wizardStep === 4 ? <View style={styles.submitBlock} accessibilityLabel="Post Job">
                {postError ? <InlineStatus variant="error" message={postError} /> : null}
                <AppButton
                  variant="primary"
                  label="+ Post Job"
                  onPress={() => {
                    void handlePost();
                  }}
                  loading={isPosting}
                  disabled={busy}
                  accessibilityLabel="Post Job"
                />
              </View> : postError ? <InlineStatus variant="error" message={postError} /> : null}
            </>
          )}
        </View>
      </ScrollView>

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
            <Text style={styles.modalTitle}>
              {skillsModalMode === 'primary' ? 'Choose Primary Skill' : 'Choose Skills'}
            </Text>
            <Text style={styles.help}>
              {skillsModalMode === 'primary'
                ? 'Required. This is the visible service identity. Matching uses every required skill.'
                : lockedModalPrimaryId === null
                  ? 'Tap a skill to set it as primary, then add any additional skills. Matching uses every selected skill.'
                  : 'Additional required skills. Matching uses every selected skill. The primary skill cannot be removed here.'}
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
                isSkillSelected={(skillId) =>
                  skillsModalMode === 'primary'
                    ? skillId === modalPrimaryId
                    : skillId === lockedModalPrimaryId || modalAdditionalIds.includes(skillId)
                }
                onToggleSkill={toggleModalSkill}
                disabled={busy}
                renderAfterSkill={(skill) =>
                  skill.id === lockedModalPrimaryId ? (
                    <Text style={styles.help}>Primary — cannot be removed.</Text>
                  ) : null
                }
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
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  titleBlock: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  greeting: {
    ...type.helper,
    color: colors.textSecondary,
  },
  displayTitle: {
    ...type.display,
    color: colors.textPrimary,
  },
  serviceArea: {
    ...type.helper,
    color: colors.textSecondary,
  },
  form: {
    paddingHorizontal: spacing.gutter,
    gap: spacing.xxl,
  },
  bookingBlock: {
    marginBottom: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  wizardProgress: {
    ...type.helper,
    color: colors.primary,
    fontWeight: '700',
  },
  wizardActions: {
    gap: spacing.sm,
  },
  reviewValue: {
    ...type.body,
    color: colors.textPrimary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  locationAddress: { ...type.body, color: colors.textPrimary },
  feePresetGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  feePreset: {
    minHeight: size.ghostButton,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  feePresetSelected: {
    backgroundColor: colors.selected,
  },
  feePresetLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  feePresetLabelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  budgetField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: size.fieldHeight,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingLeft: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
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
    paddingVertical: 0,
  },
  paymentGroup: {
    gap: spacing.sm,
  },
  paymentOption: {
    minHeight: size.ghostButton,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  paymentOptionSelected: {
    backgroundColor: colors.surface,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  paymentLabelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  primarySelected: {
    minHeight: size.ghostButton,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.selected,
  },
  primarySelectedName: {
    flex: 1,
    flexShrink: 1,
    ...type.bodyEmphasis,
    color: colors.primary,
  },
  changePrimary: {
    ...type.helper,
    fontWeight: '600',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  submitBlock: {
    gap: spacing.md,
  },
  success: {
    ...type.helper,
    color: colors.success,
    textAlign: 'center',
  },
  modalFlex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalScreen: {
    flex: 1,
    paddingHorizontal: spacing.gutter,
    gap: spacing.md,
    backgroundColor: colors.background,
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
