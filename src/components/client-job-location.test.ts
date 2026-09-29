// @ts-expect-error -- Node-only test harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only test harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

type Node = { type: string; props: Record<string, any> };
function harness() {
  const slots: any[] = []; let cursor = 0;
  let focus!: () => () => void;
  let appChange!: (state: string) => void;
  let invalidate!: () => void;
  const saved = { jobId: 'job', pin: { latitude: 14.5444514, longitude: 121.07205067 }, address: 'Saved address' };
  const read = vi.fn().mockResolvedValue(saved);
  const save = vi.fn().mockResolvedValue(undefined);
  const app = { currentState: 'active', addEventListener: (_event: string, callback: (s: string) => void) => { appChange = callback; return { remove: vi.fn() }; } };
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: unknown) => { slots[i] = value; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useCallback: (fn: unknown) => fn,
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
  };
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync('src/components/client-job-location.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
  const render = () => { cursor = 0; return exports.ClientJobLocation({ jobId: 'job', clientId: 'owner', onClose: vi.fn() }); };
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
  find(h.render(), 'Button', 'Edit Location')!.props.onPress();
  expect(find(h.render(), 'Picker')).toBeDefined();
  h.blur();
  expect(find(h.render(), 'Location')).toBeUndefined();
  expect(find(h.render(), 'Picker')).toBeUndefined();
});
it('reauthorizes after a save completes across background/foreground without repeating the write', async () => {
  const h = harness();
  let finish!: () => void;
  h.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await vi.waitFor(() => expect(find(h.render(), 'Location')).toBeDefined());
  find(h.render(), 'Button', 'Edit Location')!.props.onPress();
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
  find(h.render(), 'Button', 'Edit Location')!.props.onPress();
  h.read.mockRejectedValue(new Error('This Job is no longer open for location editing.'));
  h.invalidate();
  expect(find(h.render(), 'Picker')).toBeUndefined();
  expect(find(h.render(), 'Location')).toBeUndefined();
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2));
  expect(find(h.render(), 'Button', 'Edit Location')).toBeUndefined();
});
