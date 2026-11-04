// @ts-expect-error -- Node-only native-component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const node = (type: unknown, props: Props) => ({ type, props });
const all = (value: any): any[] => Array.isArray(value) ? value.flatMap(all)
  : value?.props ? [value, ...all(value.props.children)] : [];

function compile(path: string, seams: Props): Props {
  const exports: Props = {};
  const require = (name: string) => {
    if (name in seams) return seams[name];
    if (name === 'react/jsx-runtime') return { jsx: node, jsxs: node };
    throw Error('Unexpected module ' + name);
  };
  new Function('require', 'exports', 'console', ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(require, exports, { warn: vi.fn() });
  return exports;
}

function harness(role: 'client' | 'worker') {
  let cursor = 0;
  const slots: any[] = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; return slots[index] ??= { current: initial }; },
  };
  const native = { View: 'View', Text: 'Text', Modal: 'Modal', ScrollView: 'ScrollView', Pressable: 'Pressable',
    StyleSheet: { create: (value: Props) => value }, Alert: { alert: vi.fn() },
    Platform: { OS: 'android', select: (value: Props) => value.android ?? value.default } };
  const theme = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} }).SkillMatchTheme.ui;
  const bookings = compile('src/lib/bookings.ts', { './date-time': { formatCardDateTime: () => '' } });
  const contract = compile('src/lib/booking-lifecycle.ts', { './bookings': bookings, './supabase': { supabase: {} } });
  const cancel = vi.fn(async (_id: string, _reason: string, _detail: string): Promise<void> => undefined);
  const complete = vi.fn(async () => undefined);
  const onChanged = vi.fn(async () => undefined);
  const module = compile('src/components/booking-lifecycle.tsx', {
    react, 'react-native': native,
    '@/components/refinement-theme': { useUiTheme: () => theme },
    '@/components/app-button': { AppButton: 'AppButton' },
    '@/components/app-chip': { AppChip: 'AppChip' },
    '@/components/app-field': { AppField: 'AppField' },
    '@/components/app-notice': { AppNotice: 'AppNotice' },
    '@/components/cancellation-sheet': { CancellationSheet: 'CancellationSheet' },
    '@/lib/booking-lifecycle': { ...contract, cancelBooking: cancel, completeClientBooking: complete },
  });
  const render = () => { cursor = 0; return module.default({ role, bookingId: 'booking-a', showCompletion: role === 'client', showCancellation: true, onChanged }); };
  const sheet = () => all(render()).find(element => element.type === 'CancellationSheet');
  const open = () => all(render()).find(element => element.type === 'AppButton' && element.props.label === contract.COPY.cancel).props.onPress();
  const choose = (label = 'Schedule conflict') => all(render()).find(element => element.props.accessibilityRole === 'radio' && element.props.accessibilityLabel === label).props.onPress();
  const detail = () => all(render()).find(element => element.type === 'AppField');
  const review = () => { expect(sheet(), 'booking cancellation must use the branded sheet').toBeDefined(); sheet().props.onConfirm(); };
  return { render, sheet, open, choose, detail, review, cancel, complete, onChanged, native, copy: contract.COPY };
}

describe.each(['client', 'worker'] as const)('%s cancellation flow', role => {
  it('requires reason and explicit in-sheet review before submitting', async () => {
    const h = harness(role);
    h.open();
    expect(h.sheet(), 'the branded sheet must replace the native cancellation dialog').toBeDefined();
    expect(h.sheet().props.confirmDisabled).toBe(true);
    h.choose(); h.review();
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.native.Alert.alert).not.toHaveBeenCalled();
    expect(h.sheet().props.confirmLabel).toBe(h.copy.cancelConfirmAction);
    await h.sheet().props.onConfirm();
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('booking-a', 'schedule_conflict', '');
    expect(h.onChanged).toHaveBeenCalledOnce();
    expect(h.complete).not.toHaveBeenCalled();
  });

  it('Keep booking dismisses without a mutation and resets the draft', () => {
    const h = harness(role); h.open();
    expect(h.sheet()).toBeDefined();
    h.choose(); h.sheet().props.onClose();
    expect(h.sheet().props.visible).toBe(false);
    h.open();
    expect(h.sheet().props.confirmDisabled).toBe(true);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('keeps Other invalid until a nonblank detail is supplied', () => {
    const h = harness(role); h.open();
    expect(h.sheet()).toBeDefined();
    h.choose('Other'); h.detail().props.onChangeText('   ');
    expect(h.sheet().props.confirmDisabled).toBe(true);
    h.review();
    expect(h.cancel).not.toHaveBeenCalled();
    h.detail().props.onChangeText('A scheduling emergency');
    expect(h.sheet().props.confirmDisabled).toBe(false);
  });

  it('retains the reason and detail when cancellation fails', async () => {
    const h = harness(role); h.cancel.mockRejectedValueOnce(new Error('offline'));
    h.open(); expect(h.sheet()).toBeDefined();
    h.choose('Other'); h.detail().props.onChangeText('A scheduling emergency'); h.review();
    await h.sheet().props.onConfirm();
    expect(h.sheet().props.visible).toBe(true);
    expect(h.sheet().props.error).toBe(h.copy.cancelGeneric);
    h.sheet().props.onBack();
    expect(h.detail().props.value).toBe('A scheduling emergency');
    expect(h.onChanged).not.toHaveBeenCalled();
  });

  it('blocks double submission and dismissal while the request is pending', async () => {
    let finish!: () => void;
    const h = harness(role);
    h.cancel.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    h.open(); expect(h.sheet()).toBeDefined(); h.choose(); h.review();
    const confirm = h.sheet().props.onConfirm;
    const first = confirm(); const second = confirm();
    expect(h.sheet().props.busy).toBe(true);
    h.sheet().props.onClose();
    expect(h.sheet().props.visible).toBe(true);
    expect(h.cancel).toHaveBeenCalledOnce();
    finish(); await Promise.all([first, second]);
  });

  it('closes after a committed cancellation even when the follow-up read fails', async () => {
    const h = harness(role); h.onChanged.mockRejectedValueOnce(new Error('read failed'));
    h.open(); expect(h.sheet()).toBeDefined(); h.choose(); h.review();
    await h.sheet().props.onConfirm();
    expect(h.sheet().props.visible).toBe(false);
    expect(all(h.render()).some(element => element.type === 'AppNotice' && element.props.message === h.copy.refreshFailed)).toBe(true);
    expect(h.cancel).toHaveBeenCalledOnce();
  });
});
