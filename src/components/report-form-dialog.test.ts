import { act, createElement, Fragment } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { COPY, submitAppIssue, submitBookingReport } from '@/lib/reports';
import ReportForm from './report-form';

/**
 * The report form's submitted notice is the app's own AppDialog, never the native Android alert
 * (owner 2026-11-06). Real component and state under react-dom; native and child views are seams.
 */
const native = vi.hoisted(() => ({ buttons: [] as any[], fields: [] as any[], radios: [] as any[], dialogs: [] as any[], alerts: [] as any[], back: vi.fn() }));
vi.mock('react-native', () => {
  const host = (props: any) => createElement(Fragment, null, props.children);
  return {
    View: host, ScrollView: host, Text: () => null, StyleSheet: { create: (styles: any) => styles },
    Alert: { alert: (...args: any[]) => native.alerts.push(args) },
    Platform: { OS: 'android', select: (value: any) => value.android ?? value.default },
  };
});
vi.mock('expo-router', () => ({ useRouter: () => ({ back: native.back }) }));
vi.mock('@/components/app-button', () => ({ AppButton: (props: any) => { native.buttons.push(props); return null; } }));
vi.mock('@/components/app-dialog', () => ({ AppDialog: (props: any) => { native.dialogs.push(props); return props.visible ? props.actions : null; } }));
vi.mock('@/components/app-field', () => ({ AppField: (props: any) => { native.fields.push(props); return null; } }));
vi.mock('@/components/radio-row', () => ({ RadioRow: (props: any) => { native.radios.push(props); return null; } }));
vi.mock('@/components/skeleton', () => ({ KeyboardSpacer: () => null }));
vi.mock('@/components/form-message', () => ({ FormMessage: () => null }));
vi.mock('@/components/inline-status', () => ({ InlineStatus: () => null }));
vi.mock('@/components/section-header', () => ({ SectionHeader: () => null }));
vi.mock('@/constants/theme', () => ({ SkillMatchTheme: { ui: { colors: {}, type: {}, spacing: {} } } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/reports')>()),
  submitAppIssue: vi.fn(async () => undefined),
  submitBookingReport: vi.fn(async () => undefined),
}));

let root: { render(node: unknown): void; unmount(): void } | null = null;
async function mount(props: Record<string, unknown>) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  await act(async () => root!.render(createElement(ReportForm as any, props)));
}
const button = (label: string) => native.buttons.findLast(props => props.label === label);

beforeEach(() => {
  native.buttons = []; native.fields = []; native.radios = []; native.dialogs = []; native.alerts = [];
  native.back.mockClear(); vi.mocked(submitAppIssue).mockClear(); vi.mocked(submitBookingReport).mockClear();
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; vi.unstubAllGlobals(); });

it('an app issue confirms in the app dialog, never the native alert, and OK leaves the form exactly once', async () => {
  await mount({ variant: 'app_issue' });
  expect(native.dialogs.at(-1).visible).toBe(false);
  await act(async () => native.fields.at(-1).onChangeText('The map does not load.'));
  await act(async () => button(COPY.submitAppIssue).onPress());
  expect(submitAppIssue).toHaveBeenCalledWith('The map does not load.');
  expect(native.alerts).toHaveLength(0);
  expect(native.dialogs.at(-1)).toMatchObject({ visible: true, title: COPY.appIssueSubmittedTitle, message: COPY.appIssueSubmitted });
  const ok = button('OK');
  await act(async () => { ok.onPress(); ok.onPress(); });
  expect(native.back).toHaveBeenCalledTimes(1);
});

it('a booking report confirms in the app dialog, and Android Back on it leaves the form', async () => {
  const bookingId = '6f0e4d02-3573-4360-88df-5feee5d4945e';
  await mount({ variant: 'booking', bookingId });
  await act(async () => native.radios[0].onPress());
  await act(async () => native.fields.at(-1).onChangeText('The Worker was rude.'));
  await act(async () => button(COPY.submitBooking).onPress());
  expect(submitBookingReport).toHaveBeenCalledWith(bookingId, expect.any(String), 'The Worker was rude.');
  expect(native.alerts).toHaveLength(0);
  expect(native.dialogs.at(-1)).toMatchObject({ visible: true, title: COPY.bookingSubmittedTitle, message: COPY.bookingSubmitted });
  await act(async () => native.dialogs.at(-1).onRequestClose());
  expect(native.back).toHaveBeenCalledTimes(1);
});
