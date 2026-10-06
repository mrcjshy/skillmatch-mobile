// @ts-expect-error -- Node-only source harness; application excludes Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only source harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '../providers/client-post-job-draft-provider';
import * as location from '../lib/job-location';
import * as payment from '../lib/job-payment';
import * as schedule from '../lib/job-posting-schedule';
import * as wizard from '../lib/post-job-wizard';
import * as submission from '../lib/client-post-job-submission';
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
  const navigation = { dispatch: vi.fn() }, recent = vi.fn(async () => {});
  const native: Props = { StyleSheet: { create: (value: any) => value }, Platform: { OS: 'android', select: (value: Props) => value.android ?? value.default } };
  for (const name of ['KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']) native[name] = name;
  const jsx = (type: any, props: Props) => ({ type, props });
  function load(file: string, modules: Props) {
    const exports: Props = {};
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, console, Date, require: (name: string) => { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; } });
    return exports;
  }
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const modules: Props = {
    react: { useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial;
      return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; }, useCallback: (fn: any) => fn },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native,
    'expo-router': { useNavigation: () => navigation, useFocusEffect: (fn: any) => { if (!cleanup) cleanup = fn(); } },
    'expo-router/react-navigation': { useIsFocused: () => focused, usePreventRemove: (enabled: boolean, callback: any) => { prevention = { enabled, callback }; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    '@/constants/theme': theme, '@/lib/job-location': location, '@/lib/job-payment': payment,
    '@/lib/job-posting-schedule': schedule, '@/lib/post-job-wizard': wizard,
    '@/lib/client-post-job-submission': submission, '@/lib/recent-locations': { saveRecentLocation: recent },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => owner },
    '@/providers/client-jobs-provider': { useClientJobs: () => jobs },
  };
  for (const [file, name] of Object.entries({ 'app-button': 'AppButton', 'app-card': 'AppCard', 'app-field': 'AppField',
    'inline-status': 'InlineStatus', 'job-photo-picker': 'JobPhotoPicker', 'job-location-picker': 'JobLocationPicker',
    'job-schedule-picker': 'JobSchedulePicker', 'section-header': 'SectionHeader', 'skill-catalog-picker': 'SkillCatalogPicker', 'skill-list-summary': 'SkillListSummary' })) modules['@/components/' + file] = { [name]: name };
  const screen = load('src/components/client-post-job-screen.tsx', modules).ClientPostJobScreen;
  const render = () => { cursor = 0; return screen(); };
  const find = (label: string) => all(render(), node => typeof node.props?.onPress === 'function' && (node.props.accessibilityLabel === label || node.props.label === label))[0];
  const control = (type: string) => all(render(), node => node.type === type)[0];
  const press = (label: string) => { const node = find(label); expect(node, label).toBeDefined(); return node.props.onPress(); };
  return { owner, jobs, render, find, control, press, recent, navigation, theme,
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
it('preserves the four real steps, validation, invalid Next and Previous without mutations', () => {
  const h = harness(); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(1);
  expect(h.owner.draft.postError).toBe('Please select at least one required skill.');
  h.owner.updateDraft({ primarySkillId: 'primary' }); h.press('Next'); expect(h.owner.draft.postError).toBe('Please describe the work needed.');
  h.owner.updateDraft({ description: valid.description }); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(2);
  h.press('Next'); expect(h.owner.draft.wizardStep).toBe(2); h.owner.updateDraft({ address: valid.address, pin: valid.pin });
  h.press('Next'); expect(h.owner.draft.wizardStep).toBe(3); h.press('Next'); expect(h.owner.draft.postError).toBe('Please choose a date.');
  h.owner.updateDraft(valid); h.press('Next'); expect(h.owner.draft.wizardStep).toBe(4);
  h.press('Back'); expect(h.owner.draft.wizardStep).toBe(3); expect(h.owner.draft.description).toBe(valid.description);
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
it('keeps skill modal changes tentative until Done and preserves primary-first deduplication', () => {
  const h = harness(); h.owner.updateDraft(valid); h.press('Change primary skill');
  h.control('SkillCatalogPicker').props.onToggleSkill('extra'); h.press('Cancel');
  expect(h.owner.draft.primarySkillId).toBe('primary'); expect(h.owner.draft.additionalSkillIds).toEqual(['extra']);
  h.press('Change primary skill'); h.control('SkillCatalogPicker').props.onToggleSkill('extra'); h.press('Done');
  expect(h.owner.draft.primarySkillId).toBe('extra'); expect(h.owner.draft.additionalSkillIds).toEqual([]);
});
it('commits confirmed address and pin together and keeps old pair on picker Cancel or stale confirmation', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 2 }); h.press('Change Location');
  const stale = h.control('JobLocationPicker'); expect(stale.props.onInvalidate).toBeUndefined();
  stale.props.onCancel(); expect(h.owner.draft.pin).toEqual(valid.pin); expect(h.owner.draft.address).toBe(valid.address);
  h.press('Change Location'); const locationPicker = h.control('JobLocationPicker');
  const next = { address: 'New confirmed address', pin: { latitude: 14.5445, longitude: 121.0721 } };
  locationPicker.props.onConfirm(next); expect(h.owner.draft).toMatchObject(next); expect(h.recent).toHaveBeenCalledWith(next);
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
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 2 }); h.press('Change Location'); expect(h.back().prevented).toBe(false);
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
  h.press('Next'); const text = all(h.render(), node => node.type === 'Text').map(node => node.props.children).flat().join(' ');
  expect(text).toContain('Plumbing, Electrical'); expect(text).toContain('Very long work description'); expect(text).toContain('Confirmed address');
  expect(text).toContain('QR Ph'); expect(text).toContain('500');
});
it('renders loading/error state without a posting action and disables form while posting', () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 4 }); h.jobs.isLoading = true;
  expect(h.control('InlineStatus').props.variant).toBe('loading'); expect(h.find('Post Job')).toBeUndefined();
  h.jobs.isLoading = false; h.jobs.loadError = 'Could not load'; expect(h.control('InlineStatus').props.message).toBe('Could not load');
  h.jobs.loadError = null; h.owner.beginPost(); expect(h.find('Post Job').props.disabled).toBe(true);
  expect(h.find('Back').props.disabled).toBe(true);
});
it('final Post uses real orchestration and remains here with step-one success after settlement', async () => {
  const h = harness(); h.owner.updateDraft({ ...valid, wizardStep: 4 });
  h.find('Post Job').props.onPress(); h.find('Post Job').props.onPress();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(supabase.rpc).toHaveBeenCalledTimes(1); expect(h.owner.draft.wizardStep).toBe(1);
  expect(all(h.render(), node => node.type === 'Text').map(node => node.props.children)).toContain('Job posted. 1 of 1 photos uploaded. Waiting for a worker to accept.');
  expect(h.navigation.dispatch).not.toHaveBeenCalled(); expect(h.owner.takePendingCreatedJob()).toBe('22222222-2222-4222-8222-222222222222');
});
it('thin route exposes only the native Post Job title and screen, with no custom Back or private params', () => {
  const h = harness(); const jsx = (type: any, props: any) => ({ type, props });
  const route = h.load('src/app/(client)/client/post-job.tsx', { 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' } }, '@/components/client-post-job-screen': { ClientPostJobScreen: 'Screen' } });
  const tree = route.default(); expect(all(tree, node => node.type === 'Stack.Screen')[0].props.options).toEqual({ title: 'Post Job' });
  expect(all(tree, node => node.type === 'Screen')).toHaveLength(1);
});
