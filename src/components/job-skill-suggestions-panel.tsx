import { useEffect, useLayoutEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { prepareAiImageInput } from '@/lib/ai-image-input';
import { buildJobSkillSuggestionsRequest, createJobSkillSuggestionsInvoker, createJobSkillSuggestionsRunner, type JobSkillSuggestionsState, type SuggestionOwnerToken } from '@/lib/job-skill-suggestions';
import type { CatalogSkill } from '@/lib/skill-catalog';
import { supabase } from '@/lib/supabase';
import type { ClientPostJobDraftContextValue } from '@/providers/client-post-job-draft-provider';
import { useSession } from '@/providers/session-provider';

export type JobSkillSuggestionsAuthority = { revision: number };
type Props = { owner: ClientPostJobDraftContextValue; skills: readonly CatalogSkill[]; focused: boolean; authority: JobSkillSuggestionsAuthority };
const { colors, type, spacing } = SkillMatchTheme.ui;
function photoKey(photo: { uri: string }) { return JSON.stringify(photo); }

/** A reviewed suggestion changes draft skills only through the existing owner. */
export function JobSkillSuggestionsPanel(props: Props) {
  const session = useSession();
  const [ui, setUi] = useState<JobSkillSuggestionsState>({ status: 'idle' });
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
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
        live.owner.draft.wizardStep === 1 && record.inputRevision === token.inputRevision && live.authority.revision === token.manualRevision &&
        captured !== null && captured.generation === record.generation && captured.description === live.owner.draft.description &&
        captured.photos === live.owner.draft.jobPhotos && captured.catalog === JSON.stringify(live.skills) && captured.external === live.authority.revision;
    };
    const runner = createJobSkillSuggestionsRunner({ invoke: createJobSkillSuggestionsInvoker(supabase.functions), isCurrent: current,
      getCatalog: () => record.latest.props.skills, publish: state => { setUi(state); if (state.status === 'ready') setReviewedIds(state.response.suggestions.map(item => item.skill_id)); } });
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
      !s.sessionLifetime?.isCurrent() || owner.draft.wizardStep !== 1 || buildJobSkillSuggestionsRequest(owner.draft.description) === null) return;
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
  function apply() {
    const token = renderedCapture?.token;
    if (!token || control.record.capture?.token !== token || !control.current(token)) return;
    const ids = control.runner.apply(token, reviewedIds);
    if (!ids || !control.current(token)) return;
    if (!control.record.latest.props.owner.updateDraft({ primarySkillId: ids[0], additionalSkillIds: ids.slice(1) })) control.invalidate();
  }
  const renderedCapture = control.record.capture;
  const renderCurrent = renderedCapture !== null && props.owner.updateDraft === renderedCapture.token.ownerIdentity &&
    props.owner.ownerId === renderedCapture.token.ownerId && props.owner.draftEpoch === renderedCapture.token.draftEpoch &&
    session.sessionLifetime === renderedCapture.token.sessionLifetime && props.owner.draft.description === renderedCapture.description &&
    props.owner.draft.jobPhotos === renderedCapture.photos && JSON.stringify(props.skills) === renderedCapture.catalog &&
    props.authority.revision === renderedCapture.external && props.owner.draft.wizardStep === 1 && !props.owner.isPosting &&
    props.focused && control.record.foreground && props.owner.isOwnerCurrent();
  const currentUi = renderedCapture && renderCurrent && control.current(renderedCapture.token) && props.focused ? ui : { status: 'idle' as const };
  const disabled = !props.focused || props.owner.isPosting || !props.owner.isOwnerCurrent() || currentUi.status === 'loading' || buildJobSkillSuggestionsRequest(props.owner.draft.description) === null;
  const photoCurrent = selectedPhoto !== null && control.record.selectionOwner?.identity === props.owner.updateDraft &&
    control.record.selectionOwner.lifetime === session.sessionLifetime && control.record.selectionOwner.epoch === props.owner.draftEpoch &&
    props.owner.draft.jobPhotos.some(photo => photoKey(photo) === selectedPhoto);
  return <View style={styles.panel} accessibilityLabel="Skill suggestions">
    <SectionHeader title="Skill suggestions" subtitle="Optional. Review suggestions before choosing your skills." />
    <Text style={styles.copy}>Suggest skills sends your description and only a photo you select here to the AI service. Leave out names, contact details and exact addresses.</Text>
    {props.owner.draft.jobPhotos.map((photo, index) => <Pressable key={`${photo.uri}-${index}`} accessibilityRole="radio" accessibilityLabel={`Use photo ${index + 1} for suggestions`} accessibilityState={{ selected: photoCurrent && photoKey(photo) === selectedPhoto, disabled: props.owner.isPosting }} disabled={props.owner.isPosting} onPress={() => selectPhoto(photoKey(photo))}><Text style={styles.copy}>{photoKey(photo) === selectedPhoto && photoCurrent ? 'Selected: ' : ''}Photo {index + 1}</Text></Pressable>)}
    {selectedPhoto !== null ? <AppButton label="Use description only" variant="secondary" onPress={() => selectPhoto(null)} disabled={props.owner.isPosting} /> : null}
    <AppButton label="Suggest skills" variant="secondary" onPress={() => { void suggest(); }} disabled={disabled} loading={currentUi.status === 'loading'} />
    {currentUi.status === 'loading' ? <InlineStatus variant="loading" message="Suggesting skills…" /> : null}
    {imageError && renderCurrent ? <InlineStatus variant="error" message="Couldn't prepare this photo. Try again or choose Use description only." /> : null}
    {currentUi.status === 'error' ? <InlineStatus variant="error" message={currentUi.kind === 'rate_limited' ? 'Skill suggestion limit reached. Try again later.' : currentUi.kind === 'authorization' ? 'Skill suggestions are unavailable for this session. Try again after your account is ready.' : "Couldn't suggest skills. Please try again."} /> : null}
    {currentUi.status === 'error' || imageError && renderCurrent ? <AppButton label="Retry" variant="secondary" onPress={() => { void suggest(); }} disabled={disabled} /> : null}
    {currentUi.status === 'empty' ? <Text style={styles.copy}>No skills suggested. Choose your skills manually.</Text> : null}
    {currentUi.status === 'ready' ? <View style={styles.panel}>
      {currentUi.response.suggestions.map(item => {
        const label = props.skills.find(skill => skill.id === item.skill_id)?.skill_name;
        const selectedIndex = reviewedIds.indexOf(item.skill_id);
        const selected = selectedIndex !== -1;
        return <Pressable key={item.skill_id} accessibilityRole="checkbox" accessibilityLabel={`Suggestion ${label}`} accessibilityState={{ checked: selected }} onPress={() => {
          if (!renderedCapture || control.record.capture?.token !== renderedCapture.token || !control.current(renderedCapture.token)) return;
          setReviewedIds(previous => previous.includes(item.skill_id) ? previous.filter(id => id !== item.skill_id) : currentUi.response.suggestions.filter(suggestion => suggestion.skill_id === item.skill_id || previous.includes(suggestion.skill_id)).map(suggestion => suggestion.skill_id));
        }}>
          <Text style={styles.name}>{label}</Text>
          <Text style={selected ? styles.selected : styles.copy}>{selected ? `Selected · ${selectedIndex === 0 ? 'Primary' : 'Secondary'}` : 'Not selected'}</Text>
          <Text style={styles.copy}>{item.explanation}</Text>
        </Pressable>;
      })}
      <AppButton label="Apply selected skills" onPress={apply} disabled={reviewedIds.length < 1 || reviewedIds.length > 2 || disabled} />
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: spacing.md }, copy: { ...type.helper, color: colors.textSecondary }, name: { ...type.bodyEmphasis, color: colors.textPrimary }, selected: { ...type.label, color: colors.accent } });
