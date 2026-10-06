// @ts-expect-error -- Node-only source harness; application excludes Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only source harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '../providers/client-post-job-draft-provider';
import * as dateTime from '../lib/date-time';
import * as location from '../lib/job-location';
import * as payment from '../lib/job-payment';
import * as schedule from '../lib/job-posting-schedule';
import * as wizard from '../lib/post-job-wizard';
import * as skillSelection from '../lib/post-job-skill-selection';
import * as submission from '../lib/client-post-job-submission';
import * as canonicalLocation from '../lib/canonical-job-location';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN } from '../lib/santa-ana-service-area';
import { supabase } from '../lib/supabase';
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn(), storage: { from: vi.fn() } } }));
type Props = Record<string, any>;
function all(tree: any, predicate: (node: any) => boolean): any[] {
  if (Array.isArray(tree)) return tree.flatMap(node => all(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...all(tree.props?.children, predicate)];
}
function harness(existing?: ReturnType<typeof createClientPostJobDraftOwner>) {
  const owner = existing ?? createClientPostJobDraftOwner('11111111-1111-4111-8111-111111111111');
  const state: any[] = []; let cursor = 0, focused = true, cleanup: (() => void) | undefined;
  let prevention: { enabled: boolean; callback: (value: any) => void };
  const jobs = { isLoading: false, loadError: null as string | null,
    skills: [{ id: 'primary', skill_name: 'Plumbing' }, { id: 'extra', skill_name: 'Electrical' }], refresh: vi.fn(async () => {}) };
  const navigation = { dispatch: vi.fn() }, recent = vi.fn(async (..._args: any[]) => {});
  const session = { sessionLifetime: { ownerId: owner.ownerId, isCurrent: () => true }, sessionRevision: 0, isSessionRevisionCurrent: () => true };
  const native: Props = { AppState: { currentState: 'active' }, StyleSheet: { create: (value: any) => value }, Platform: { OS: 'android', select: (value: Props) => value.android ?? value.default } };
  for (const name of ['KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']) native[name] = name;
  const jsx = (type: any, props: Props) => ({ type, props });
  function load(file: string, modules: Props) {
    const exports: Props = {};
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, console, Date, require: (name: string) => { if (name === '@/components/refinement-theme') return { useUiTheme: () => modules['@/constants/theme'].SkillMatchTheme.ui };  if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; } });
    return exports;
  }
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const modules: Props = {
    react: { useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; }, useCallback: (fn: any) => fn, useLayoutEffect: (fn: any) => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native,
    'expo-router': { useNavigation: () => navigation, useFocusEffect: (fn: any) => { if (!cleanup) cleanup = fn(); } },
    'expo-router/react-navigation': { useHeaderHeight: () => 80, useIsFocused: () => focused, usePreventRemove: (enabled: boolean, callback: any) => { prevention = { enabled, callback }; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    '@/constants/theme': theme, '@/lib/date-time': dateTime, '@/lib/job-location': location, '@/lib/job-payment': payment,
    '@/lib/job-posting-schedule': schedule, '@/lib/post-job-wizard': wizard, '@/lib/post-job-skill-selection': skillSelection,
    '@/lib/client-post-job-submission': submission, '@/lib/recent-locations': { saveRecentLocation: recent },
    '@/lib/canonical-job-location': canonicalLocation,
    '@/providers/session-provider': { useSession: () => session },
    '@/components/job-skill-suggestions-panel': { JobSkillSuggestionsPanel: 'JobSkillSuggestionsPanel' },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => owner },
    '@/providers/client-jobs-provider': { useClientJobs: () => jobs },
  };
  for (const [file, name] of Object.entries({ 'app-button': 'AppButton', 'app-card': 'AppCard', 'app-field': 'AppField',
    'inline-status': 'InlineStatus', 'job-photo-picker': 'JobPhotoPicker', 'job-location-picker': 'JobLocationPicker',
    'job-schedule-picker': 'JobSchedulePicker', 'section-header': 'SectionHeader', 'skill-catalog-picker': 'SkillCatalogPicker', 'app-chip': 'AppChip',
    'app-symbol': 'AppSymbol', 'fact-row': 'FactRow', 'radio-row': 'RadioRow', 'surface-group': 'SurfaceGroup', 'skillmatch-mascot': 'SkillMatchMascot' })) modules['@/components/' + file] = { [name]: name };
  const screen = load('src/components/client-post-job-screen.tsx', modules).ClientPostJobScreen;
  const render = () => { cursor = 0; return screen(); };
  const find = (label: string) => all(render(), node => typeof node.props?.onPress === 'function' && (node.props.accessibilityLabel === label || node.props.label === label))[0];
  const control = (type: string) => all(render(), node => node.type === type)[0];
  const press = (label: string) => { const node = find(label); expect(node, label).toBeDefined(); return node.props.onPress(); };
  return { owner, jobs, render, find, control, press, recent, navigation, theme, session,
    back: (type = 'GO_BACK') => { render(); const action = { type, payload: { count: 1 } }; if (prevention.enabled) prevention.callback({ data: { action } }); return { action, prevented: prevention.enabled }; },
    blur: () => { focused = false; cleanup?.(); render(); }, focus: () => { focused = true; render(); }, unmount: () => cleanup?.(),
    load, modules };
}
const valid = { description: 'Detailed plumbing repair', address: 'Confirmed address', pin: SANTA_ANA_PATEROS_INTERIOR_TEST_PIN,
  scheduleDate: new Date(2099, 0, 2), scheduleTime: new Date(2099, 0, 2, 12, 15), budgetText: '1500', feePreset: 1500 as const,
  paymentMethod: 'cod' as const, primarySkillId: 'primary', additionalSkillIds: ['extra'],
  jobPhotos: [{ uri: 'file:///one', assetId: 'asset', fileName: 'photo.png', fileSize: 20, pickerMimeType: 'image/png' }] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(supabase.rpc).mockResolvedValue({ data: '22222222-2222-4222-8222-222222222222', error: null } as never);
  vi.mocked(supabase.storage.from).mockReturnValue({ list: vi.fn(async () => ({ data: [], error: null })), upload: vi.fn(async () => ({ data: {}, error: null })) } as never);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('accounts for the navigation header when placing the form above the keyboard', () => {
  const h = harness();
  expect(h.render().props.keyboardVerticalOffset).toBe(80);
  h.modules['expo-router/react-navigation'].useHeaderHeight = () => 112;
  expect(h.render().props.keyboardVerticalOffset).toBe(112);
  expect(h.owner.draft.wizardStep).toBe(1);
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('has no redundant content Back on Step 1 and keeps Previous step and native Back on later steps', () => {
  const h = harness();
  expect(h.find('Back')).toBeUndefined(); expect(h.find('Previous step')).toBeUndefined();
  expect(h.back().prevented).toBe(false);
  for (const step of [2, 3, 4] as const) {
    h.owner.updateDraft({ ...valid, wizardStep: step });
    expect(h.find('Back')).toBeUndefined();
    h.press('Previous step'); expect(h.owner.draft.wizardStep).toBe(step - 1);
    h.owner.updateDraft({ wizardStep: step });
    expect(h.back().prevented).toBe(true); expect(h.owner.draft.wizardStep).toBe(step - 1);
  }
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('preserves the four real steps, validation, invalid Next and Previous without mutations', () => {
  const h = harness(); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(1);
  expect(h.owner.draft.postError).toBe('Please select at least one required skill.');
  h.owner.updateDraft({ primarySkillId: 'primary' }); h.press('Next'); expect(h.owner.draft.postError).toBe('Please describe the work needed.');
  h.owner.updateDraft({ description: valid.description }); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(2);
  h.press('Next'); expect(h.owner.draft.wizardStep).toBe(2); h.owner.updateDraft({ address: valid.address, pin: valid.pin });
  h.press('Next'); expect(h.owner.draft.wizardStep).toBe(3); h.press('Next'); expect(h.owner.draft.postError).toBe('Please choose a date.');
  h.owner.updateDraft(valid); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(4);
  h.press('Previous step'); expect(h.owner.draft.wizardStep).toBe(3); expect(h.owner.draft.description).toBe(valid.description);
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('retains all values, dates, ordered photos and picker transactions through step changes and exit/reopen', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, photoError: 'Example photo error', modalQuery: 'plumb', modalPrimaryId: 'primary', modalAdditionalIds: ['extra'] });
  for (const wizardStep of [2, 3, 4, 3, 2, 1] as const) { h.owner.updateDraft({ wizardStep }); h.render(); }
  h.unmount(); const reopened = harness(h.owner); reopened.owner.updateDraft({ wizardStep: 2 });
  expect(reopened.control('JobPhotoPicker').props).toMatchObject({ photos: valid.jobPhotos, error: 'Example photo error', ownerKey: h.owner.ownerId, resetEpoch: 0 });
  expect(h.owner.draft).toMatchObject({ ...valid, modalQuery: 'plumb', modalAdditionalIds: ['extra'] });
  h.owner.updateDraft({ wizardStep: 3 }); const picker = reopened.control('JobSchedulePicker');
  expect(picker.props.date.getTime()).toBe(valid.scheduleDate.getTime()); expect(picker.props.time.getTime()).toBe(valid.scheduleTime.getTime());
  picker.props.onChangeDate(new Date(2099, 2, 3)); expect(h.owner.draft.scheduleDate?.getMonth()).toBe(2);
});
it('has one skill picker where the first choice is primary and the second secondary, tentative until Done', () => {
  const h = harness(); const picker = () => h.control('SkillCatalogPicker').props;
  const committed = () => [h.owner.draft.primarySkillId, h.owner.draft.additionalSkillIds];
  // One catalog and one entry point; no separate primary/secondary pickers.
  expect(all(h.render(), node => node.type === 'SkillCatalogPicker')).toHaveLength(1);
  expect(h.find('Choose primary skill')).toBeUndefined(); expect(h.find('Change primary skill')).toBeUndefined();
  h.press('Choose skills'); picker().onToggleSkill('primary');
  expect(picker().badgeForSkill({ id: 'primary' })).toBe('Primary'); expect(picker().isSkillSelected('extra')).toBe(false);
  picker().onToggleSkill('extra'); expect(picker().badgeForSkill({ id: 'extra' })).toBe('Secondary');
  expect(committed()).toEqual([null, []]); h.press('Cancel'); expect(committed()).toEqual([null, []]);
  h.press('Choose skills'); expect(picker().isSkillSelected('primary')).toBe(false);
  picker().onToggleSkill('primary'); picker().onToggleSkill('extra'); h.press('Done');
  expect(committed()).toEqual(['primary', ['extra']]);
  const rows = all(h.render(), node => node.type === 'AppChip').map(node => node.props.label);
  expect(rows).toEqual(['Primary', 'Secondary']);
  // Removing the secondary leaves the primary in place.
  h.press('Edit skills'); picker().onToggleSkill('extra'); h.press('Done'); expect(committed()).toEqual(['primary', []]);
  // The primary can be removed by tapping it again when it is the only skill.
  h.press('Edit skills'); picker().onToggleSkill('primary'); expect(picker().isSkillSelected('primary')).toBe(false);
  h.press('Done'); expect(committed()).toEqual([null, []]);
  // Removing the primary while a secondary exists promotes the secondary.
  h.owner.updateDraft({ primarySkillId: 'primary', additionalSkillIds: ['extra'] });
  h.press('Edit skills'); picker().onToggleSkill('primary'); expect(picker().badgeForSkill({ id: 'extra' })).toBe('Primary');
  h.press('Done'); expect(committed()).toEqual(['extra', []]);
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('commits confirmed address and pin together and keeps old pair on picker Cancel or stale confirmation', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 2 }); h.press('Change location');
  const stale = h.control('JobLocationPicker'); expect(stale.props.onInvalidate).toBeUndefined();
  stale.props.onCancel(); expect(h.owner.draft.pin).toEqual(valid.pin); expect(h.owner.draft.address).toBe(valid.address);
  h.press('Change location'); const locationPicker = h.control('JobLocationPicker');
  const next = { address: 'New confirmed address', pin: { latitude: 14.5445, longitude: 121.0721 } };
  locationPicker.props.onConfirm(next); expect(h.owner.draft).toMatchObject(next); expect(h.recent).toHaveBeenCalledWith(expect.objectContaining({userId: h.owner.ownerId, isCurrent: expect.any(Function)}), next);
  h.owner.dispose(); locationPicker.props.onConfirm(valid); expect(h.recent).toHaveBeenCalledTimes(1);
});
it('native Back decrements steps, busy consumes it, step one exits and non-Back preserves supplied action', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 4 }); h.back(); expect(h.owner.draft.wizardStep).toBe(3);
  h.back('POP'); expect(h.owner.draft.wizardStep).toBe(2);
  const removal = h.back('RESET'); expect(h.navigation.dispatch).toHaveBeenCalledWith(removal.action);
  h.owner.updateDraft({ wizardStep: 4 }); const op = h.owner.beginPost()!; h.back(); expect(h.owner.draft.wizardStep).toBe(4);
  h.owner.finishPost(op); h.owner.updateDraft({ wizardStep: 1 }); expect(h.back().prevented).toBe(false);
  h.owner.dispose(); expect(h.back().prevented).toBe(false);
});
it('picker presentations own Back, dismiss on blur, and do not clear committed draft', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 2 }); h.press('Change location'); expect(h.back().prevented).toBe(false);
  h.blur(); expect(all(h.render(), node => node.type === 'Modal').every(node => !node.props.visible)).toBe(true);
  expect(h.owner.draft.address).toBe(valid.address); expect(h.back().prevented).toBe(false);
  h.focus(); expect(h.back().prevented).toBe(true);
});
it('connects photo/error callbacks to controlled draft and invalidates selection ownership on blur', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 2 }); const photos = h.control('JobPhotoPicker');
  photos.props.onPhotosChange([]); photos.props.onErrorChange('Gallery unavailable');
  expect(h.owner.draft.jobPhotos).toEqual([]); expect(h.owner.draft.photoError).toBe('Gallery unavailable');
  h.blur(); expect(h.control('JobPhotoPicker').props.isOwnerCurrent()).toBe(false);
});
it('preserves fee presets and custom value matching, payment options, populated review and long content', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 3, description: 'Very long work description '.repeat(20), budgetText: '123456.78', feePreset: 'custom' });
  h.control('TextInput').props.onChangeText('500'); expect(h.owner.draft).toMatchObject({ budgetText: '500', feePreset: 500 });
  h.press('Custom'); expect(h.owner.draft.budgetText).toBe('500'); h.press('QR Ph'); expect(h.owner.draft.paymentMethod).toBe('qrph');
  h.press('Next'); const review = h.render(); const text = [...all(review, node => node.type === 'Text').map(node => node.props.children).flat(), ...all(review, node => node.type === 'FactRow').map(node => node.props.value)].join(' ');
  expect(text).toContain('Plumbing, Electrical'); expect(text).toContain('Very long work description'); expect(text).toContain('Confirmed address');
  expect(text).toContain('QR Ph'); expect(text).toContain('500');
});
it('renders loading/error state without a posting action and disables form while posting', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 4 }); h.jobs.isLoading = true;
  expect(h.control('InlineStatus').props.variant).toBe('loading'); expect(h.find('Post job')).toBeUndefined();
  h.jobs.isLoading = false; h.jobs.loadError = 'Could not load'; expect(h.control('InlineStatus').props.message).toBe('Could not load');
  h.jobs.loadError = null; h.owner.beginPost(); expect(h.find('Post job').props.disabled).toBe(true);
  expect(h.find('Previous step').props.disabled).toBe(true);
});
it('final Post uses real orchestration and remains here with step-one success after settlement', async () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 4 });
  h.find('Post job').props.onPress(); h.find('Post job').props.onPress();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(supabase.rpc).toHaveBeenCalledTimes(1); expect(h.owner.draft.wizardStep).toBe(1);
  expect(all(h.render(), node => node.type === 'Text').map(node => node.props.children)).toContain('Job posted. 1 of 1 photos uploaded. Waiting for a worker to accept.');
  expect(h.navigation.dispatch).not.toHaveBeenCalled(); expect(h.owner.takePendingCreatedJob()).toBe('22222222-2222-4222-8222-222222222222');
});
it('keeps the posted confirmation until a fresh description starts the next draft, then removes both words and mascot through Step 2', async () => {
  const h = harness(); h.owner.updateDraft({ ...valid, jobPhotos: [], wizardStep: 4 });
  h.press('Post job');
  for (let i = 0; i < 30; i++) await Promise.resolve();
  const success = () => all(h.render(), node => node.type === 'Text' && node.props.children === 'Job posted. Waiting for a worker to accept.');
  const mascot = () => all(h.render(), node => node.type === 'SkillMatchMascot');
  expect(success()).toHaveLength(1); expect(mascot().map(node => node.props.pose)).toEqual(['success']);
  expect(h.owner.draft).toMatchObject({ description: '', primarySkillId: null, additionalSkillIds: [], wizardStep: 1 });
  h.blur(); h.focus(); h.press('Choose skills'); h.press('Cancel');
  h.control('AppField').props.onChangeText('');
  expect(success()).toHaveLength(1); expect(mascot()).toHaveLength(1);
  h.control('AppField').props.onChangeText('Fix the next kitchen sink pipe.');
  expect(success()).toHaveLength(0); expect(mascot()).toHaveLength(0);
  expect(h.owner.draft.description).toBe('Fix the next kitchen sink pipe.');
  h.press('Choose skills');
  h.control('SkillCatalogPicker').props.onToggleSkill('primary');
  h.control('SkillCatalogPicker').props.onToggleSkill('extra');
  h.press('Done');
  expect(h.owner.draft).toMatchObject({ primarySkillId: 'primary', additionalSkillIds: ['extra'] });
  h.press('Next'); expect(h.owner.draft.wizardStep).toBe(2);
  expect(success()).toHaveLength(0); expect(mascot()).toHaveLength(0);
  h.press('Previous step');
  expect(h.control('AppField').props.value).toBe('Fix the next kitchen sink pipe.');
  expect(success()).toHaveLength(0); expect(mascot()).toHaveLength(0);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it('starting the next draft with a skill choice clears confirmation before Done while preserving manual choice, Cancel and promotion rules', async () => {
  const h = harness(); h.owner.updateDraft({ ...valid, jobPhotos: [], wizardStep: 4 });
  h.press('Post job'); for (let i = 0; i < 30; i++) await Promise.resolve();
  h.press('Choose skills');
  expect(all(h.render(), node => node.type === 'SkillMatchMascot')).toHaveLength(1);
  h.control('SkillCatalogPicker').props.onToggleSkill('primary');
  expect(h.owner.draft.postSuccess).toBeNull();
  expect(all(h.render(), node => node.type === 'SkillMatchMascot')).toHaveLength(0);
  expect(h.owner.draft.primarySkillId).toBeNull(); h.press('Cancel');
  expect(h.owner.draft.primarySkillId).toBeNull(); expect(h.owner.draft.postSuccess).toBeNull();
  h.press('Choose skills');
  h.control('SkillCatalogPicker').props.onToggleSkill('primary');
  h.control('SkillCatalogPicker').props.onToggleSkill('extra');
  expect(h.control('SkillCatalogPicker').props.isSkillUnavailable('third')).toBe(true);
  h.control('SkillCatalogPicker').props.onToggleSkill('primary');
  expect(h.control('SkillCatalogPicker').props.badgeForSkill({ id: 'extra' })).toBe('Primary');
  h.press('Done'); expect(h.owner.draft).toMatchObject({ primarySkillId: 'extra', additionalSkillIds: [] });
  expect(h.owner.draft.postSuccess).toBeNull(); expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it('a rejected next post shows its error with no stale success message or mascot and keeps the draft available', async () => {
  const h = harness(); h.owner.updateDraft({ ...valid, jobPhotos: [], wizardStep: 4 });
  h.press('Post job'); for (let i = 0; i < 30; i++) await Promise.resolve();
  h.control('AppField').props.onChangeText('Next job that fails');
  h.owner.updateDraft({ ...valid, jobPhotos: [], wizardStep: 4 });
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { code: '22023' } } as never);
  h.press('Post job'); for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(h.owner.draft).toMatchObject({ postSuccess: null, description: valid.description, wizardStep: 4 });
  expect(h.owner.draft.postError).toContain('No job was created.');
  expect(all(h.render(), node => node.type === 'Text' && /Job posted/.test(String(node.props.children)))).toHaveLength(0);
  expect(all(h.render(), node => node.type === 'SkillMatchMascot')).toHaveLength(0);
  expect(all(h.render(), node => node.type === 'InlineStatus' && node.props.variant === 'error').map(node => node.props.message)).toEqual([h.owner.draft.postError]);
  expect(h.find('Post job').props.disabled).toBe(false);
});
it('thin route exposes only the native Post Job title and screen, with no custom Back or private params', () => {
  const h = harness(); const jsx = (type: any, props: any) => ({ type, props });
  const route = h.load('src/app/(client)/client/post-job.tsx', { 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' } }, '@/components/client-post-job-screen': { ClientPostJobScreen: 'Screen' } });
  const tree = route.default(); expect(all(tree, node => node.type === 'Stack.Screen')[0].props.options).toEqual({ title: 'Post job' });
  expect(all(tree, node => node.type === 'Screen')).toHaveLength(1);
});
// Wave 6.5 accessibility (A11Y-02, A11Y-04). InlineStatus's own alert/live semantics are covered in
// wave65-accessibility.test.ts; here the screen's wiring: when the error appears, and when it clears.
it('A11Y-02: a refused Next shows one InlineStatus error; a valid Next clears it (no stale error)', () => {
  const h = harness(); h.owner.updateDraft({ description: valid.description, wizardStep: 1 });
  const errors = () => all(h.render(), node => node.type === 'InlineStatus' && node.props.variant === 'error');
  expect(errors()).toHaveLength(0);
  h.press('Next');
  expect(errors().map(node => node.props.message)).toEqual(['Please select at least one required skill.']);
  h.press('Next');
  expect(errors()).toHaveLength(1);
  h.owner.updateDraft({ primarySkillId: 'primary' }); h.press('Next');
  expect(h.owner.draft.wizardStep).toBe(2);
  expect(errors()).toHaveLength(0);
});
it('A11Y-04: the location row names its action and carries the confirmed address as its value', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, address: '', pin: null, wizardStep: 2 });
  let row = h.find('Choose location');
  expect(row.props.accessibilityRole).toBe('button');
  expect(row.props.accessibilityValue).toEqual({ text: 'No location selected' });
  h.owner.updateDraft({ address: valid.address, pin: valid.pin });
  row = h.find('Change location');
  expect(row.props.accessibilityValue).toEqual({ text: 'Confirmed address: Confirmed address' });
  // The address Text no longer carries its own (ignored) label; the row speaks for it.
  expect(all(row, node => node.props?.accessibilityLabel === 'Confirmed job address')).toHaveLength(0);
});
it('places explicit suggestions between description and manual skills only on Step 1', () => { const h=harness(); const tree=all(h.render(),node => ['AppField','JobSkillSuggestionsPanel','SkillCatalogPicker'].includes(node.type)); expect(tree.map(node=>node.type)).toEqual(['AppField','JobSkillSuggestionsPanel','SkillCatalogPicker']); expect(h.control('JobSkillSuggestionsPanel').props.owner.updateDraft).toBe(h.owner.updateDraft); h.owner.updateDraft({...valid,wizardStep:2}); expect(h.control('JobSkillSuggestionsPanel')).toBeUndefined(); });
it('invalidates suggestion authority synchronously before description ABA and manual picker open/toggle/Done', () => { const h=harness(); h.owner.updateDraft(valid); h.owner.updateDraft({wizardStep:1}); const authority=h.control('JobSkillSuggestionsPanel').props.authority; const description=h.control('AppField').props.onChangeText; let previous=authority.revision; description('Other work'); description(valid.description); expect(authority.revision).toBeGreaterThan(previous); previous=authority.revision; h.press('Edit skills'); expect(authority.revision).toBeGreaterThan(previous); previous=authority.revision; h.control('SkillCatalogPicker').props.onToggleSkill('extra'); expect(authority.revision).toBeGreaterThan(previous); previous=authority.revision; h.press('Done'); expect(authority.revision).toBeGreaterThan(previous); expect(supabase.rpc).not.toHaveBeenCalled(); });
it('invalidates suggestion authority synchronously before leaving Step 1 and on blur', () => { const h=harness(); h.owner.updateDraft(valid); const authority=h.control('JobSkillSuggestionsPanel').props.authority; let previous=authority.revision; h.press('Next'); expect(authority.revision).toBeGreaterThan(previous); previous=authority.revision; h.blur(); expect(authority.revision).toBeGreaterThan(previous); });
it('scopes confirmed recents to captured lifetime and refuses an old scope after blur or session replacement', () => { const h=harness(); h.owner.updateDraft({...valid,wizardStep:2}); h.press('Change location'); h.control('JobLocationPicker').props.onConfirm({pin:valid.pin,address:canonicalLocation.JOB_LOCATION_DISPLAY_FALLBACK}); const scope=h.recent.mock.calls[0][0] as any; expect(scope.userId).toBe(h.owner.ownerId); expect(scope.isCurrent()).toBe(true); h.blur(); expect(scope.isCurrent()).toBe(false); h.focus(); expect(scope.isCurrent()).toBe(false); });
it('discloses current eligible Worker access and labels fallback as general area rather than confirmed street', () => { const h=harness(); h.owner.updateDraft({...valid,wizardStep:2,address:canonicalLocation.JOB_LOCATION_DISPLAY_FALLBACK}); const subtitles=all(h.render(),node=>node.type==='SectionHeader').map(node=>node.props.subtitle).join(' '); expect(subtitles).toContain('currently qualify'); expect(subtitles).toContain('removed'); expect(h.find('Change location').props.accessibilityValue.text).toContain('General area'); });
it('does not let retained confirmation write after focus ABA or foreground loss', () => { const h=harness(); h.owner.updateDraft({...valid,wizardStep:2}); h.press('Change location'); const old=h.control('JobLocationPicker').props.onConfirm; h.blur(); h.focus(); old({pin:valid.pin,address:'Stale replacement'}); expect(h.owner.draft.address).toBe(valid.address); expect(h.recent).not.toHaveBeenCalled(); h.press('Change location'); const current=h.control('JobLocationPicker').props.onConfirm; h.modules['react-native'].AppState.currentState='background'; current({pin:valid.pin,address:'Background replacement'}); expect(h.owner.draft.address).toBe(valid.address); expect(h.recent).not.toHaveBeenCalled(); });
