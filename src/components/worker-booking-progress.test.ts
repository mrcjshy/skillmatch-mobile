import { act, createElement, Fragment } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkerBookingProgress from './worker-booking-progress';
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), swipe: null as any, refresh: null as any, text: [] as string[], frames: [] as any[] }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock('react-native', () => ({ View: ({ children, style }: any) => { boundary.frames.push(style); return createElement(Fragment, null, children); }, Text: ({ children }: any) => { if (typeof children === 'string') boundary.text.push(children); return null; }, StyleSheet: { create: (style: any) => style } }));
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => ({ colors: {}, type: {}, spacing: {} }) }));
vi.mock('@/components/swipe-confirmation', () => ({ SwipeConfirmation: (props: any) => { boundary.swipe = props; return null; } }));
vi.mock('@/components/app-button', () => ({ AppButton: (props: any) => { boundary.refresh = props.onPress; return null; } }));
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const progress = { bookingId: id, arrivedAt: null, serviceCompletedAt: null };
let root: { render(node: unknown): void; unmount(): void };
function deferred() { let resolve!: (value: any) => void, reject!: (error: Error) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { boundary.rpc.mockReset(); boundary.swipe = null; boundary.refresh = null; boundary.text = []; boundary.frames = []; });
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function mount(isCurrent = () => true, onChanged = vi.fn(async () => {}), extra: Record<string, unknown> = {}) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  await act(async () => root.render(createElement(WorkerBookingProgress, { bookingId: id, progress, paymentStatus: 'pending', isCurrent, onChanged, ...extra })));
  return onChanged;
}
it('a retired session callback cannot dispatch a milestone', async () => {
  const changed = await mount(() => false);
  await act(async () => boundary.swipe.onConfirm());
  expect(boundary.rpc).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
});
it('routine worker progress omits repeated instructions while preserving explicit arrival confirmation', async () => {
  await mount();
  expect(boundary.text.join(' ')).not.toContain('Confirm only when you have physically arrived');
  expect(boundary.swipe.confirmationMessage).toContain('physically arrived');
  expect(boundary.swipe.label).toBe('Swipe to Confirm Arrival');
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it('leaves the milestone to the sheet header: an open step shows only its swipe, never the status again', async () => {
  await mount();
  expect(boundary.text).not.toContain('Accepted');
  expect(boundary.swipe.label).toBe('Swipe to Confirm Arrival');
});
it('renders nothing while the swipe is hidden, so no empty dock sticks under the collapsed sheet', async () => {
  await mount(undefined, undefined, { actionVisible: false, frameStyle: 'dock' });
  expect(boundary.swipe).toBeNull(); expect(boundary.text).toEqual([]);
  expect(JSON.stringify(boundary.frames)).not.toContain('dock');
});
it('still draws the dock frame around a visible swipe', async () => {
  await mount(undefined, undefined, { frameStyle: 'dock' });
  expect(JSON.stringify(boundary.frames)).toContain('dock');
});
it('two input callbacks cause one RPC, then require authoritative refresh without optimistic progress', async () => {
  const pending = deferred(); boundary.rpc.mockReturnValue(pending.promise);
  const changed = await mount();
  await act(async () => { boundary.swipe.onConfirm(); boundary.swipe.onConfirm(); });
  expect(boundary.rpc).toHaveBeenCalledTimes(1);
  expect(boundary.swipe.disabled).toBe(true);
  await act(async () => pending.resolve({ data: [{ booking_id: id, arrived_at: '2026-10-30T01:00:00Z', service_completed_at: null }], error: null }));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(boundary.swipe.label).toBe('Swipe to Confirm Arrival'); // unchanged read props, never locally advanced
  expect(boundary.swipe.disabled).toBe(true);
});
it('a failed/ambiguous write refreshes once and offers a read-only refresh, never automatic write retry', async () => {
  boundary.rpc.mockRejectedValue(Error('private transport detail'));
  const changed = await mount();
  await act(async () => boundary.swipe.onConfirm());
  expect(boundary.rpc).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledTimes(1);
  expect(boundary.text.join(' ')).toContain('Confirmation was not verified');
  expect(boundary.text.join(' ')).not.toContain('private transport detail');
  expect(boundary.swipe.disabled).toBe(true);
  await act(async () => boundary.refresh());
  expect(changed).toHaveBeenCalledTimes(2); expect(boundary.rpc).toHaveBeenCalledTimes(1);
});
it('navigation/unmount during an outstanding command cannot refresh a different screen', async () => {
  const pending = deferred(); boundary.rpc.mockReturnValue(pending.promise);
  const changed = await mount();
  await act(async () => boundary.swipe.onConfirm());
  await act(async () => root.unmount());
  await act(async () => pending.resolve({ data: [{ booking_id: id, arrived_at: '2026-10-30T01:00:00Z', service_completed_at: null }], error: null }));
  expect(changed).not.toHaveBeenCalled();
});
it('session retirement during the command blocks its follow-up read', async () => {
  const pending = deferred(); boundary.rpc.mockReturnValue(pending.promise); let current = true;
  const changed = await mount(() => current);
  await act(async () => boundary.swipe.onConfirm()); current = false;
  await act(async () => pending.resolve({ data: [{ booking_id: id, arrived_at: '2026-10-30T01:00:00Z', service_completed_at: null }], error: null }));
  expect(changed).not.toHaveBeenCalled();
});
