import { useEffect, useLayoutEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppSymbol } from '@/components/app-symbol';
import { InlineStatus } from '@/components/inline-status';
import { MotionView, useListReveal, usePressScale } from '@/components/motion';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import { SkillMatchTheme } from '@/constants/theme';
import { prepareAiImageInput } from '@/lib/ai-image-input';
import { canRequestJobSkillSuggestions, createJobSkillSuggestionsInvoker, createJobSkillSuggestionsRunner, displaySuggestionExplanation, type JobSkillSuggestionsState, type SuggestionOwnerToken } from '@/lib/job-skill-suggestions';
import { canAddPostJobSkill, postJobSkillRole, togglePostJobSkill } from '@/lib/post-job-skill-selection';
import type { CatalogSkill } from '@/lib/skill-catalog';
import { supabase } from '@/lib/supabase';
import type { ClientPostJobDraftContextValue } from '@/providers/client-post-job-draft-provider';
import { useSession } from '@/providers/session-provider';

export type JobSkillSuggestionsAuthority = { revision: number };
type Props = { owner: ClientPostJobDraftContextValue; skills: readonly CatalogSkill[]; focused: boolean; authority: JobSkillSuggestionsAuthority };
const { colors, type, spacing, radius } = SkillMatchTheme.ui;
function photoKey(photo: { uri: string }) { return JSON.stringify(photo); }
/** The draft owner copies the photo list on every update, so a result stays current while the photos are the same. */
function samePhotos(a: readonly { uri: string }[], b: readonly { uri: string }[]) { return a === b || (a.length === b.length && a.every((photo, index) => photoKey(photo) === photoKey(b[index]))); }

/** A reviewed suggestion changes draft skills only through the existing owner. */
export function JobSkillSuggestionsPanel(props: Props) {
  const session = useSession();
  const [ui, setUi] = useState<JobSkillSuggestionsState>({ status: 'idle' });
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [control] = useState(() => {
    const record = {
      latest: { props, session }, mounted: true, foreground: AppState.currentState === 'active', generation: 0,
      busy: false, inputRevision: 0, photoSelection: null as string | null,
      selectionOwner: null as null | { identity: object; lifetime: object | null | undefined; epoch: number },
      capture: null as null | { token: SuggestionOwnerToken; description: string; photos: readonly { uri: string }[]; catalog: string; external: number; generation: number },
    };
    const current = (token: SuggestionOwnerToken) => {
      const { props: live, session: s } = record.latest;
      const captured = record.capture;
      return record.mounted && record.foreground && live.focused && !live.owner.isPosting && live.owner.isOwnerCurrent() &&
        !!s.sessionLifetime && s.sessionLifetime.ownerId === token.ownerId && s.sessionLifetime.isCurrent() && !s.isSessionLoading && !s.sessionError && s.recoveryStatus === 'idle' &&
        (s.isSessionRevisionCurrent?.(token.sessionRevision) ?? false) && s.sessionLifetime === token.sessionLifetime &&
        live.owner.updateDraft === token.ownerIdentity && live.owner.ownerId === token.ownerId && live.owner.draftEpoch === token.draftEpoch &&
        live.owner.draft.wizardStep === 2 && record.inputRevision === token.inputRevision && live.authority.revision === token.manualRevision &&
        captured !== null && captured.generation === record.generation && captured.description === live.owner.draft.description &&
        samePhotos(captured.photos, live.owner.draft.jobPhotos) && captured.catalog === JSON.stringify(live.skills) && captured.external === live.authority.revision;
    };
    const runner = createJobSkillSuggestionsRunner({ invoke: createJobSkillSuggestionsInvoker(supabase.functions), isCurrent: current,
      // Suggestions never change the draft by themselves; the Client taps a card to add one.
      getCatalog: () => record.latest.props.skills, publish: state => { setUi(state); } });
    const invalidate = () => { record.generation++; record.inputRevision++; record.busy = false; record.capture = null; runner.reset(); setImageError(false); };
    return { record, runner, current, invalidate,
      observe(next: typeof record.latest) { record.latest = next; },
      mount(value: boolean) { record.mounted = value; },
      foreground(value: boolean) { record.foreground = value; },
      select(key: string | null) { record.photoSelection = key; record.selectionOwner = key === null ? null : { identity: record.latest.props.owner.updateDraft, lifetime: record.latest.session.sessionLifetime, epoch: record.latest.props.owner.draftEpoch }; },
      clearPhoto() { record.photoSelection = null; record.selectionOwner = null; setSelectedPhoto(null); },
      begin(capture: NonNullable<typeof record.capture>) { record.capture = capture; record.busy = true; },
      unlock(generation: number) { if (record.generation === generation) record.busy = false; },
    };
  });
  const fingerprint = JSON.stringify([props.owner.ownerId, props.owner.draftEpoch, props.owner.draft.description, props.owner.draft.jobPhotos, props.skills, props.authority.revision, props.focused, props.owner.isPosting, session.sessionRevision]);
  useLayoutEffect(() => {
    const previous = control.record.latest;
    const selection = control.record.selectionOwner;
    if (selection && (selection.identity !== props.owner.updateDraft || selection.lifetime !== session.sessionLifetime ||
      selection.epoch !== props.owner.draftEpoch || !props.owner.draft.jobPhotos.some(photo => photoKey(photo) === control.record.photoSelection))) control.clearPhoto();
    if (previous.props.owner.updateDraft !== props.owner.updateDraft || previous.session.sessionLifetime !== session.sessionLifetime ||
      control.record.capture && !control.current(control.record.capture.token)) control.invalidate();
    control.observe({ props, session });
    if (control.record.capture && !control.current(control.record.capture.token)) control.invalidate();
  }, [control, props, session, fingerprint]);
  const subscribeSessionLifecycle = session.subscribeSessionLifecycle;
  useEffect(() => {
    control.mount(true);
    const listener = AppState.addEventListener('change', status => { control.foreground(status === 'active'); if (status !== 'active') control.invalidate(); });
    const unsubscribe = subscribeSessionLifecycle?.(() => control.invalidate());
    return () => { control.mount(false); control.invalidate(); listener.remove(); unsubscribe?.(); };
  }, [control, subscribeSessionLifecycle]);

  const renderOwnerIdentity = props.owner.updateDraft;
  const renderLifetime = session.sessionLifetime;
  const renderEpoch = props.owner.draftEpoch;
  const renderRevision = props.authority.revision;
  function renderedActionCurrent() {
    const current = control.record.latest;
    return control.record.mounted && control.record.foreground && current.props.focused && current.props.owner.isOwnerCurrent() &&
      current.props.owner.updateDraft === renderOwnerIdentity && current.session.sessionLifetime === renderLifetime &&
      current.props.owner.draftEpoch === renderEpoch && current.props.authority.revision === renderRevision;
  }

  function selectPhoto(key: string | null) {
    if (!renderedActionCurrent() || control.record.latest.props.owner.isPosting) return;
    control.invalidate(); control.select(key); setSelectedPhoto(key);
  }
  async function suggest() {
    if (!renderedActionCurrent()) return;
    const { record, runner } = control;
    const { owner, skills, focused, authority } = record.latest.props;
    const s = record.latest.session;
    if (owner.updateDraft !== props.owner.updateDraft || owner.ownerId !== props.owner.ownerId || s.sessionLifetime !== session.sessionLifetime ||
      props.owner.draft.description !== owner.draft.description) return;
    if (record.busy || !record.mounted || !record.foreground || !focused || owner.isPosting || !owner.isOwnerCurrent() ||
      !s.sessionLifetime?.isCurrent() || owner.draft.wizardStep !== 2 || !canRequestJobSkillSuggestions(owner.draft.description, record.photoSelection !== null)) return;
    const token: SuggestionOwnerToken = { ownerIdentity: owner.updateDraft, ownerId: owner.ownerId, draftEpoch: owner.draftEpoch,
      sessionLifetime: s.sessionLifetime, sessionRevision: s.sessionRevision ?? 0, inputRevision: record.inputRevision, manualRevision: authority.revision, catalogRevision: 0 };
    control.begin({ token, description: owner.draft.description, photos: owner.draft.jobPhotos, catalog: JSON.stringify(skills), external: authority.revision, generation: record.generation });
    if (!control.current(token)) { control.unlock(record.generation); return; }
    setImageError(false); setUi({ status: 'loading' });
    const generation = record.generation;
    try {
      let image;
      if (record.photoSelection !== null) {
        const selected = owner.draft.jobPhotos.find(photo => photoKey(photo) === record.photoSelection) ?? null;
        const prepared = await prepareAiImageInput({ selectedPhoto: selected, draftPhotos: owner.draft.jobPhotos, isCurrent: () => control.current(token) });
        if (!control.current(token)) return;
        if (!prepared.ok) { setImageError(true); setUi({ status: 'idle' }); return; }
        image = prepared.image;
      }
      if (!control.current(token)) return;
      await runner.request(token, owner.draft.description, image);
    } finally { control.unlock(generation); }
  }
  /**
   * One tap on a card adds that suggested skill after the skills already chosen, or removes it
   * when it is already chosen. Existing skills are never replaced: when two are chosen, other
   * cards cannot be added. Revalidates the result and draft identity immediately before writing.
   */
  function toggleSuggestion(token: SuggestionOwnerToken, skillId: string) {
    if (control.record.capture?.token !== token || !control.current(token)) return;
    const live = control.record.latest.props;
    if (ui.status !== 'ready' || !ui.response.suggestions.some(item => item.skill_id === skillId) || !live.skills.some(skill => skill.id === skillId)) return;
    const { draft } = live.owner;
    const before = { primarySkillId: draft.primarySkillId, additionalSkillIds: draft.additionalSkillIds };
    if (!canAddPostJobSkill(before, skillId)) return;
    if (!live.owner.updateDraft(togglePostJobSkill(before, skillId))) control.invalidate();
  }
  const renderedCapture = control.record.capture;
  const renderCurrent = renderedCapture !== null && props.owner.updateDraft === renderedCapture.token.ownerIdentity &&
    props.owner.ownerId === renderedCapture.token.ownerId && props.owner.draftEpoch === renderedCapture.token.draftEpoch &&
    session.sessionLifetime === renderedCapture.token.sessionLifetime && props.owner.draft.description === renderedCapture.description &&
    samePhotos(props.owner.draft.jobPhotos, renderedCapture.photos) && JSON.stringify(props.skills) === renderedCapture.catalog &&
    props.authority.revision === renderedCapture.external && props.owner.draft.wizardStep === 2 && !props.owner.isPosting &&
    props.focused && control.record.foreground && props.owner.isOwnerCurrent();
  const currentUi = renderedCapture && renderCurrent && control.current(renderedCapture.token) && props.focused ? ui : { status: 'idle' as const };
  const photoCurrent = selectedPhoto !== null && control.record.selectionOwner?.identity === props.owner.updateDraft &&
    control.record.selectionOwner.lifetime === session.sessionLifetime && control.record.selectionOwner.epoch === props.owner.draftEpoch &&
    props.owner.draft.jobPhotos.some(photo => photoKey(photo) === selectedPhoto);
  const disabled = !props.focused || props.owner.isPosting || !props.owner.isOwnerCurrent() || currentUi.status === 'loading' || !canRequestJobSkillSuggestions(props.owner.draft.description, photoCurrent);
  const draftSkills = { primarySkillId: props.owner.draft.primarySkillId, additionalSkillIds: props.owner.draft.additionalSkillIds };
  const shownIds = currentUi.status === 'ready' ? currentUi.response.suggestions.map(item => item.skill_id) : [];
  // Cards rise into place one after another when a new result arrives (none under reduced motion).
  const cardEnter = useListReveal(shownIds);
  const anyBlocked = shownIds.some(id => !canAddPostJobSkill(draftSkills, id));
  const press = usePressScale();
  const loading = currentUi.status === 'loading';
  const failed = currentUi.status === 'error' || (imageError && renderCurrent);
  const askLabel = failed ? 'Try again' : 'Ask Itik for skills';
  const askHint = loading ? 'Itik is reading your job…'
    : !canRequestJobSkillSuggestions(props.owner.draft.description, photoCurrent) ? 'Describe the job above first'
    : 'Itik reads your job and picks up to two skills';
  return <View style={styles.panel} accessibilityLabel="Skill suggestions">
    <SectionHeader title="Skill suggestions" subtitle="Optional" />
    <Text style={styles.copy}>Itik reads your description, and a photo only if you pick one here. Leave out names, contact details and exact addresses.</Text>
    {props.owner.draft.jobPhotos.length === 0 ? <Text style={styles.copy}>Add a photo above to get suggestions from it.</Text> : null}
    {props.owner.draft.jobPhotos.length > 0 ? <View style={styles.photoRow}>
      {props.owner.draft.jobPhotos.map((photo, index) => {
        const chosen = photoCurrent && photoKey(photo) === selectedPhoto;
        return <Pressable key={`${photo.uri}-${index}`} accessibilityRole="radio" accessibilityLabel={`Use photo ${index + 1} for suggestions`} accessibilityState={{ selected: chosen, disabled: props.owner.isPosting }} disabled={props.owner.isPosting} onPress={() => selectPhoto(photoKey(photo))} hitSlop={spacing.xs}>
          <AppChip label={chosen ? `✓ Photo ${index + 1}` : `Photo ${index + 1}`} variant={chosen ? 'selected' : 'neutral'} />
        </Pressable>;
      })}
    </View> : null}
    {selectedPhoto !== null ? <AppButton label="Use description only" variant="secondary" onPress={() => selectPhoto(null)} disabled={props.owner.isPosting} /> : null}
    {/* The one way to ask: a cobalt card with Itik on it, so it reads as the AI action, not a form button. */}
    <MotionView style={press.style}>
      <Pressable accessibilityRole="button" accessibilityLabel={askLabel} accessibilityHint={askHint} accessibilityState={{ disabled, busy: loading }}
        disabled={disabled} onPress={() => { void suggest(); }} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
        android_ripple={{ color: colors.accentPressed }} style={[styles.ask, disabled && !loading && styles.askDisabled]}>
        <View style={styles.askAvatar}>
          <SkillMatchMascot expression={loading ? 'think' : failed ? 'oops' : 'hello'} size={44} active={!disabled || loading} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.askLabel, disabled && !loading && styles.askLabelDisabled]}>{askLabel}</Text>
          <Text style={[styles.askHint, disabled && !loading && styles.askHintDisabled]}>{askHint}</Text>
        </View>
        {loading ? null : <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={22} tintColor={disabled ? colors.textMuted : colors.onAccent} />}
      </Pressable>
    </MotionView>
    {imageError && renderCurrent ? <InlineStatus variant="error" message="Couldn't prepare this photo. Try again or choose Use description only." /> : null}
    {currentUi.status === 'error' ? <InlineStatus variant="error" message={currentUi.kind === 'rate_limited' ? "You've reached Itik's suggestion limit for now. Try again later." : currentUi.kind === 'authorization' ? 'Itik is unavailable for this session. Try again after your account is ready.' : "Itik couldn't answer right now. Try again in a moment."} /> : null}
    {currentUi.status === 'empty' ? <View style={styles.itikRow}>
      <SkillMatchMascot expression="oops" size={44} />
      <Text style={[styles.copy, styles.flex]}>Itik couldn't match a skill. Choose skills below.</Text>
    </View> : null}
    {currentUi.status === 'ready' && renderedCapture ? <View style={styles.results}>
      <View style={styles.itikRow}>
        <SkillMatchMascot expression="point" size={44} />
        <View style={styles.flex}>
          <Text style={styles.resultTitle}>Itik's picks for this job</Text>
          <Text style={styles.copy}>Tap a card to add it. Itik can be wrong, so check before posting.</Text>
        </View>
      </View>
      {currentUi.response.suggestions.map(item => {
        const label = props.skills.find(skill => skill.id === item.skill_id)?.skill_name;
        const role = postJobSkillRole(draftSkills, item.skill_id);
        const added = role !== null;
        const blocked = !canAddPostJobSkill(draftSkills, item.skill_id);
        const token = renderedCapture.token;
        return <MotionView key={item.skill_id} entering={cardEnter(item.skill_id)}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Suggestion ${label}`} accessibilityHint={added ? 'Removes this skill from the job' : 'Adds this skill to the job'}
            accessibilityState={{ checked: added, disabled: blocked }} disabled={blocked} onPress={() => toggleSuggestion(token, item.skill_id)}
            style={({ pressed }) => [styles.card, added && styles.cardAdded, blocked && styles.cardBlocked, pressed && styles.cardPressed]}>
            <View style={[styles.cardIcon, added && styles.cardIconAdded]}>
              <AppSymbol name={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} size={20} tintColor={added ? colors.onAccent : colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{label}</Text>
              <Text style={styles.copy}>{displaySuggestionExplanation(item.explanation)}</Text>
              {role ? <Text style={styles.role}>{role}</Text> : null}
            </View>
            <View style={[styles.action, added && styles.actionAdded, blocked && styles.actionBlocked]}>
              <AppSymbol name={added ? { android: 'check', ios: 'checkmark' } : { android: 'add', ios: 'plus' }} size={16} tintColor={added ? colors.onAccentTonal : blocked ? colors.textMuted : colors.onAccent} />
              <Text style={[styles.actionLabel, added && styles.actionLabelAdded, blocked && styles.actionLabelBlocked]}>{added ? 'Added' : 'Add'}</Text>
            </View>
          </Pressable>
        </MotionView>;
      })}
      {anyBlocked ? <Text style={styles.copy}>A job can have up to two skills. Remove one below to add another.</Text> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  flex: { flex: 1 },
  copy: { ...type.helper, color: colors.textSecondary },
  name: { ...type.bodyEmphasis, color: colors.textPrimary },
  role: { ...type.label, color: colors.accent, marginTop: spacing.xs },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  itikRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  results: { gap: spacing.sm },
  resultTitle: { ...type.bodyEmphasis, color: colors.accent },
  ask: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.accent, borderRadius: radius.card, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.md, overflow: 'hidden', elevation: 4, shadowColor: colors.accent, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  askDisabled: { backgroundColor: colors.surfaceContainerHighest, elevation: 0, shadowOpacity: 0 },
  askAvatar: { width: 52, height: 52, borderRadius: radius.control, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  askLabel: { ...type.bodyEmphasis, color: colors.onAccent },
  askLabelDisabled: { color: colors.textSecondary },
  askHint: { ...type.helper, color: colors.onAccent, opacity: 0.85 },
  askHintDisabled: { color: colors.textMuted, opacity: 1 },
  // A card reads as a control: a raised surface, a leading tonal icon and an explicit Add pill.
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, elevation: 2, shadowColor: colors.textPrimary, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cardAdded: { borderColor: colors.accent, borderWidth: 1.5 },
  cardBlocked: { opacity: 0.55 },
  cardPressed: { transform: [{ scale: 0.98 }] },
  cardIcon: { width: 40, height: 40, borderRadius: radius.control, backgroundColor: colors.accentTonal, alignItems: 'center', justifyContent: 'center' },
  cardIconAdded: { backgroundColor: colors.accent },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: spacing.md, minHeight: 36 },
  actionAdded: { backgroundColor: colors.accentTonal },
  actionBlocked: { backgroundColor: colors.surfaceContainerHighest },
  actionLabel: { ...type.label, color: colors.onAccent },
  actionLabelAdded: { color: colors.onAccentTonal },
  actionLabelBlocked: { color: colors.textMuted },
});
