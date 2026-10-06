// @ts-expect-error -- Node-only test harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only test harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { readOpenJobLocation, saveOpenJobLocation } from '@/lib/client-job-location';
import { SkillMatchTheme } from '@/constants/theme';

const service = vi.hoisted(() => ({ statuses: [] as string[], rpc: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (v: any) => v.default } }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: service.statuses.shift() ?? 'open' }, error: null }) }) }) }) }),
  rpc: (name: string, args: unknown) => service.rpc(name, args),
} }));

type Node = { type: string; props: Record<string, any> };
function harness(options: { dismissalLabel?: string; isOperationCurrent?: () => boolean; realHelpers?: boolean } = {}) {
  const slots: any[] = []; let cursor = 0;
  let focus!: () => () => void;
  let appChange!: (state: string) => void;
  let invalidate!: () => void;
  const saved = { jobId: 'job', pin: { latitude: 14.5444514, longitude: 121.07205067 }, address: 'Saved address' };
  const read = options.realHelpers ? vi.fn(readOpenJobLocation) : vi.fn().mockResolvedValue(saved);
  const save = options.realHelpers ? vi.fn(saveOpenJobLocation) : vi.fn().mockResolvedValue(undefined);
  const app = { currentState: 'active', addEventListener: (_event: string, callback: (s: string) => void) => { appChange = callback; return { remove: vi.fn() }; } };
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: unknown) => { slots[i] = value; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useCallback: (fn: unknown) => fn,
      useLayoutEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { AppState: app, Modal: 'Modal', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    'expo-router': { useFocusEffect: (fn: typeof focus) => { focus = fn; } },
    './app-button': { AppButton: 'Button' },
    './job-location-picker': { JobLocationPicker: 'Picker' },
    './job-location-map': { WorkerAssignedJobLocation: 'Location', nativeJobMapsLoaded: () => true },
    '@/lib/client-job-location': { readOpenJobLocation: read, saveOpenJobLocation: save },
    '@/lib/job-location': { classifyMapAvailability: () => 'ready', projectAssignedWorkerLocation: ({ exact }: any) => exact },
    '@/lib/realtime': { NOTIFICATION_INSERTED: 'notification_inserted', userNotificationsTopic: (id: string) => id,
      subscribeInvalidation: ({ onInvalidate }: any) => { invalidate = onInvalidate; return vi.fn(); } },
    '@/constants/theme': { SkillMatchTheme },
  };
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync('src/components/client-job-location.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => (modules['@/constants/theme'] as { SkillMatchTheme: { ui: unknown } }).SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children }; if (!(name in modules)) throw Error(name); return modules[name]; } });
  const render = () => { cursor = 0; return exports.ClientJobLocation({ jobId: 'job', clientId: 'owner', onClose: vi.fn(), ...options }); };
  render();
  const blur = focus();
  return { read, save, render, blur, saved, invalidate: () => invalidate(), change: (state: string) => { app.currentState = state; appChange(state); } };
}
function find(tree: Node, type: string, label?: string): Node | undefined {
  if (tree?.type === type && (!label || tree.props.label === label)) return tree;
  return [tree?.props?.children].flat(Infinity).filter(Boolean).map(child => find(child, type, label)).find(Boolean);
}
it('clears exact location and edit state on route blur', async () => {
  const h = harness();
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  expect(find(h.render(), 'Picker')).toBeDefined();
  h.blur();
  expect(find(h.render(), 'Location')).toBeUndefined();
  expect(find(h.render(), 'Picker')).toBeUndefined();
});
it('composes the real location helper and rejects acceptance before publication or save success', async () => {
  service.statuses = ['open', 'matched'];
  service.rpc.mockResolvedValue({ data: [{ job_id: 'job', latitude: 14.5444514, longitude: 121.07205067, address: 'Saved address' }], error: null });
  const rejected = harness({ realHelpers: true });
  for (let n = 0; n < 12; n++) await Promise.resolve();
  expect(find(rejected.render(), 'Location')).toBeUndefined(); expect(find(rejected.render(), 'Button', 'Edit location')).toBeUndefined();
  service.statuses = ['open', 'open']; const editable = harness({ realHelpers: true });
  for (let n = 0; n < 12; n++) await Promise.resolve();
  expect(find(editable.render(), 'Location')).toBeDefined();
  find(editable.render(), 'Button', 'Edit location')!.props.onPress();
  service.rpc.mockResolvedValue({ data: null, error: { code: 'SM409', message: 'private' } });
  find(editable.render(), 'Picker')!.props.onConfirm({ pin: editable.saved.pin, address: editable.saved.address });
  for (let n = 0; n < 12; n++) await Promise.resolve();
  expect(find(editable.render(), 'Location')).toBeUndefined(); expect(find(editable.render(), 'Picker')).toBeUndefined();
});
it('rejects late save responses after parent cancellation and leaves newer display inaccessible', async () => {
  let current = true; const h = harness({ isOperationCurrent: () => current });
  for (let n = 0; n < 8; n++) await Promise.resolve();
  let finish!: () => void; h.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  find(h.render(), 'Picker')!.props.onConfirm({ pin: h.saved.pin, address: h.saved.address });
  current = false; h.blur(); finish();
  for (let n = 0; n < 8; n++) await Promise.resolve();
  expect(h.read).toHaveBeenCalledTimes(1); expect(h.save).toHaveBeenCalledTimes(1);
  expect(find(h.render(), 'Location')).toBeUndefined(); expect(find(h.render(), 'Picker')).toBeUndefined();
});
it('checks contrast of composed location dismissal/loading/edit/save controls on their nested surfaces', async () => {
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  const buttonExports: Record<string, any> = {};
  const buttonSource = ts.transpileModule(readFileSync('src/components/app-button.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules: Record<string, any> = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    'react-native': { Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'Spinner', StyleSheet: { create: (s: unknown) => s } },
    '@/constants/theme': { SkillMatchTheme },
  };
  runInNewContext(buttonSource, { exports: buttonExports, require: (name: string) => name === '@/components/refinement-theme' ? { useUiTheme: () => SkillMatchTheme.ui } : modules[name] });
  const flat = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style ?? {};
  const luminance = (hex: string) => { const rgb = hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722; };
  const contrast = (a: string, c: string) => (Math.max(luminance(a), luminance(c)) + .05) / (Math.min(luminance(a), luminance(c)) + .05);
  function check(tree: Node, pressed: boolean, background = SkillMatchTheme.ui.colors.canvas) {
    if (tree.type === 'Button') { check(buttonExports.AppButton(tree.props), pressed, background); return; }
    const style = flat(typeof tree.props.style === 'function' ? tree.props.style({ pressed }) : tree.props.style);
    const bg = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : background;
    expect(style.opacity ?? 1).toBe(1);
    if (tree.type === 'Text') { expect(contrast(style.color, bg)).toBeGreaterThanOrEqual(4.5); expect(tree.props.allowFontScaling).not.toBe(false); }
    // A filled control can establish its boundary against the surrounding surface.
    if (tree.type === 'Pressable' && style.borderColor) {
      expect(Math.max(contrast(style.borderColor, bg), contrast(style.borderColor, background), contrast(bg, background))).toBeGreaterThanOrEqual(3);
    }
    if (tree.type === 'Spinner') expect(contrast(tree.props.color, bg)).toBeGreaterThanOrEqual(3);
    for (const child of [tree.props.children].flat(Infinity).filter(value => value?.props)) check(child, pressed, bg);
  }
  const h = harness({ dismissalLabel: 'Back to job details' });
  for (const pressed of [false, true]) check(h.render(), pressed);
  for (let n = 0; n < 8; n++) await Promise.resolve();
  for (const pressed of [false, true]) check(h.render(), pressed);
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  let finish!: () => void; h.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  find(h.render(), 'Picker')!.props.onConfirm({ pin: h.saved.pin, address: h.saved.address });
  expect(find(h.render(), 'Button', 'Refresh location')!.props.disabled).toBe(true);
  for (const pressed of [false, true]) check(h.render(), pressed);
  finish(); for (let n = 0; n < 8; n++) await Promise.resolve();
});
it('uses a local detail dismissal label while preserving the default', async () => {
  const detail = harness({ dismissalLabel: 'Back to job details' });
  expect(find(detail.render(), 'Button', 'Back to job details')).toBeDefined();
  expect(find(harness().render(), 'Button', 'Back to my jobs')).toBeDefined();
});
it('checks parent operation before initial location access and fails closed on throwing authority', () => {
  for (const isOperationCurrent of [() => false, () => { throw Error('private'); }]) {
    const h = harness({ isOperationCurrent }); expect(h.read).not.toHaveBeenCalled();
    expect(find(h.render(), 'Button', 'Edit location')).toBeUndefined();
  }
});
it('rejects a captured edit callback after acceptance invalidates its generation', async () => {
  const h = harness(); await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  const confirm = find(h.render(), 'Picker')!.props.onConfirm;
  h.read.mockRejectedValue(new Error('This Job is no longer open for location editing.')); h.invalidate();
  confirm({ pin: h.saved.pin, address: h.saved.address }); expect(h.save).not.toHaveBeenCalled();
});
it('does not save or publish a pending read after the parent operation is invalidated', async () => {
  let current = true; const h = harness({ isOperationCurrent: () => current });
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit location')!.props.onPress(); const confirm = find(h.render(), 'Picker')!.props.onConfirm;
  current = false; confirm({ pin: h.saved.pin, address: h.saved.address }); expect(h.save).not.toHaveBeenCalled();
  expect(find(h.render(), 'Location')).toBeUndefined(); expect(find(h.render(), 'Picker')).toBeUndefined();
});
it('reauthorizes after a save completes across background/foreground without repeating the write', async () => {
  const h = harness();
  let finish!: () => void;
  h.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  find(h.render(), 'Picker')!.props.onConfirm({ pin: h.saved.pin, address: h.saved.address });
  h.change('background'); h.change('active');
  expect(find(h.render(), 'Location')).toBeUndefined();
  finish();
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  expect(h.save).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenCalledTimes(2);
});
it('clears the editor before rechecking an acceptance notification', async () => {
  const h = harness();
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit location')!.props.onPress();
  h.read.mockRejectedValue(new Error('This Job is no longer open for location editing.'));
  h.invalidate();
  expect(find(h.render(), 'Picker')).toBeUndefined();
  expect(find(h.render(), 'Location')).toBeUndefined();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  expect(find(h.render(), 'Button', 'Edit location')).toBeUndefined();
});
