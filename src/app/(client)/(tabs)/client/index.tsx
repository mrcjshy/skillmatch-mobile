import { useCallback, useRef, useState } from 'react';
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
import { useFocusEffect, type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveBookingHomeCard } from '@/components/active-booking-home-card';
import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { HomeHeader } from '@/components/home-header';
import { InlineStatus } from '@/components/inline-status';
import { JobLocationPicker } from '@/components/job-location-picker';
import { JobSchedulePicker } from '@/components/job-schedule-picker';
import { SectionHeader } from '@/components/section-header';
import { SkillCatalogPicker } from '@/components/skill-catalog-picker';
import { SkillListSummary } from '@/components/skill-list-summary';
import { SkillMatchTheme } from '@/constants/theme';
import { loadClientBookings, type ClientBooking } from '@/lib/booking-records';
import { createClientHomeBookingFocus, type ClientHomeBookingFocus } from '@/lib/client-home-booking-focus';
import { homeGreeting } from '@/lib/home-greeting';
import { firstNameFromFullName } from '@/lib/initials';
import {
  COPY as JOB_LOCATION_COPY,
  JobLocationError,
  createJobLocationErrorCopy,
  createMyJobWithLocation,
  initialJobPin,
  postingDescriptionError,
  postingLocationError,
  type JobPin,
} from '@/lib/job-location';
import {
  type JobPaymentMethod,
  postingPaymentError,
} from '@/lib/job-payment';
import { combineJobSchedule, postingScheduleError } from '@/lib/job-posting-schedule';
import { type CatalogSkill } from '@/lib/skill-catalog';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';

/**
 * Client dashboard = "Post a Job" (defense-minimum slice).
 *
 * Caller identity is `auth.uid()` inside `create_my_job_with_location`.
 * Location is the fixed deployment constant Santa Ana, Pateros, written by
 * the server. `status` is never sent: the database default ('open') owns it.
 * Required skills come only from the loaded public.skills master list.
 * Visible service identity is the primary required skill; the RPC derives
 * the stored title from the first skill id in `p_skill_ids`.
 *
 * Save is one atomic RPC: Job + required skills + private pin. Exact
 * coordinates never land on public.job_postings and are not used for matching.
 */

const DEPLOYMENT_BARANGAY = 'Santa Ana';
const DEPLOYMENT_CITY = 'Pateros';

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

type FeePreset = (typeof FEE_PRESETS)[number]['value'] | 'custom';

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

export default function ClientHome() {
  const { account } = useAccount();
  const clientId = account?.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, loadError, skills, refresh } = useClientJobs();

  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<JobPin | null>(initialJobPin);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [mapGesture, setMapGesture] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [scheduleTime, setScheduleTime] = useState<Date | null>(null);
  const [budgetText, setBudgetText] = useState('');
  const [feePreset, setFeePreset] = useState<FeePreset | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<JobPaymentMethod | null>(null);
  const [primarySkillId, setPrimarySkillId] = useState<string | null>(null);
  const [additionalSkillIds, setAdditionalSkillIds] = useState<string[]>([]);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [skillsModalMode, setSkillsModalMode] = useState<'primary' | 'additional'>('additional');
  const [modalQuery, setModalQuery] = useState('');
  const [modalPrimaryId, setModalPrimaryId] = useState<string | null>(null);
  const [modalAdditionalIds, setModalAdditionalIds] = useState<string[]>([]);

  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const bookingFocusRef = useRef<ClientHomeBookingFocus | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!clientId) return;
      const focus = createClientHomeBookingFocus({
        clientId,
        loadBookings: loadClientBookings,
        onBookings: setBookings,
        onNavigate: (bookingId) => router.replace({
          pathname: '/client/booking-details',
          params: { bookingId },
        } as unknown as Href),
      });
      bookingFocusRef.current = focus;
      focus.refresh();
      return () => {
        // Tabs remain mounted on blur. Revoke this run, including pending reads.
        focus.cancel();
        if (bookingFocusRef.current === focus) bookingFocusRef.current = null;
      };
    }, [clientId, router])
  );

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

  async function handlePost() {
    // Capture before the mutation: a late Post must not arm a newer focus run.
    const postingFocus = bookingFocusRef.current;
    if (isPosting || !clientId || !postingFocus) return;
    setPostError(null);
    setPostSuccess(null);

    const descriptionError = postingDescriptionError(description);
    if (descriptionError !== null) {
      setPostError(descriptionError);
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
    if (primarySkillId === null || !knownSkillIds.has(primarySkillId)) {
      setPostError('Please select a primary skill.');
      return;
    }
    const additionalUniqueIds = uniqueSkillIds(additionalSkillIds, knownSkillIds, primarySkillId);
    const skillIds = [primarySkillId, ...additionalUniqueIds];
    const primarySkillName = primarySkill?.skill_name ?? '';

    setIsPosting(true);
    let created = false;
    try {
      const createdJobId = await createMyJobWithLocation({
        title: primarySkillName,
        description: description.trim(),
        address: trimmedAddress,
        scheduledAt: schedule.toISOString(),
        budget,
        paymentMethod,
        skillIds,
        latitude: pin.latitude,
        longitude: pin.longitude,
      });
      created = true;
      postingFocus.waitForJob(createdJobId);
      await refresh(clientId);
      setPostSuccess('Job posted. Waiting for a worker to accept.');
      setDescription('');
      setAddress('');
      setPin(initialJobPin());
      setLocationNote(null);
      setScheduleDate(null);
      setScheduleTime(null);
      setBudgetText('');
      setFeePreset(null);
      setPaymentMethod(null);
      setPrimarySkillId(null);
      setAdditionalSkillIds([]);
      setModalQuery('');
      setModalPrimaryId(null);
      setModalAdditionalIds([]);
      setSkillsModalVisible(false);
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
  const fullName = account?.full_name ?? '—';
  const firstName = firstNameFromFullName(account?.full_name ?? '');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        scrollEnabled={!mapGesture}
      >
        <HomeHeader fullName={fullName} role="client" variant="chrome" />

        <View style={styles.titleBlock}>
          <Text style={styles.greeting}>{homeGreeting()}</Text>
          <Text
            style={styles.displayTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
            accessibilityRole="header"
          >
            {firstName}
          </Text>
          <Text style={styles.serviceArea}>
            {DEPLOYMENT_BARANGAY}, {DEPLOYMENT_CITY} · SkillMatch service area
          </Text>
        </View>

        <View style={styles.bookingBlock}>
          <ActiveBookingHomeCard
            role="client"
            bookings={bookings}
            onPressPrimary={(booking) =>
              router.push({
                pathname: '/client/booking-details',
                params: { bookingId: booking.booking_id },
              } as unknown as Href)
            }
            onPressViewAll={() => router.push('/client/bookings' as Href)}
          />
        </View>

        <View style={styles.form}>
          {isLoading ? (
            <InlineStatus variant="loading" message="Loading…" />
          ) : loadError ? (
            <InlineStatus variant="error" message={loadError} />
          ) : (
            <>
              <View style={styles.section} accessibilityLabel="Job Details">
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
              </View>

              <View style={styles.section} accessibilityLabel="Where">
                <SectionHeader title="Where" />
                <AppField
                  label="Address"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House / street / landmark"
                  disabled={busy}
                  accessibilityLabel="Address"
                  helperText="Required. Write the house, street, or landmark. The pin does not replace this address."
                />
                <Text style={styles.mapLabel}>Map</Text>
                <JobLocationPicker
                  pin={pin}
                  onChangePin={setPin}
                  note={locationNote}
                  onNote={setLocationNote}
                  disabled={busy}
                  onMapGesture={setMapGesture}
                  onAutofillAddress={setAddress}
                />
              </View>

              <View style={styles.section} accessibilityLabel="Schedule">
                <SectionHeader title="Schedule" />
                <JobSchedulePicker
                  date={scheduleDate}
                  time={scheduleTime}
                  onChangeDate={setScheduleDate}
                  onChangeTime={setScheduleTime}
                  disabled={busy}
                />
              </View>

              <View style={styles.section} accessibilityLabel="Budget and Payment">
                <SectionHeader title="Budget & Payment" />
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
              </View>

              <View style={styles.section} accessibilityLabel="Required Skills">
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
              </View>

              <View style={styles.submitBlock} accessibilityLabel="Post Job">
                {postError ? <InlineStatus variant="error" message={postError} /> : null}
                {postSuccess ? <Text style={styles.success}>{postSuccess}</Text> : null}
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
              </View>
            </>
          )}
        </View>
      </ScrollView>

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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  mapLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
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
