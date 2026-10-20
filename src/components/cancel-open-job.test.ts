// @ts-expect-error -- Node-only native-component harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only native-component harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function harness(result: { data: { id: string }[] | null; error: unknown }, current = true) {
  let cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [], filters: unknown[] = [];
  let confirmation: any[] = [];
  const selected = vi.fn(async () => result);
  const query: any = { delete: () => query, eq: (key: string, value: string) => { filters.push([key, value]); return query; }, select: selected };
  const onCancelled = vi.fn(), onStatusChanged = vi.fn();
  const exports: any = {};
  const jsx = (type: any, props: any) => ({ type, props });
  const require = (name: string) => {
    if (name === 'react') return {
      useRef: (initial: unknown) => { const i = cursor++; return slots[i] ??= { current: initial }; },
      useState: (initial: unknown) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: unknown) => { slots[i] = value; }]; },
      useEffect: (effect: () => void) => effects.push(effect),
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Alert: { alert: (_title: string, _message: string, buttons: any[]) => { confirmation = buttons; } } };
    if (name === '@/components/app-button') return { AppButton: 'AppButton' };
    if (name === '@/components/inline-status') return { InlineStatus: 'InlineStatus' };
    if (name === '@/lib/supabase') return { supabase: { from: (table: string) => { expect(table).toBe('job_postings'); return query; } } };
    throw Error('Unexpected module ' + name);
  };
  const compiled = ts.transpileModule(readFileSync('src/components/cancel-open-job.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, { exports, require });
  const render = () => {
    cursor = 0;
    return exports.CancelOpenJob({ jobId: 'job-a', clientId: 'client-a', isCurrent: () => current, onCancelled, onStatusChanged });
  };
  let tree = render(); effects.splice(0).forEach(effect => effect());
  const cancelButton = tree.props.children.find((child: any) => child?.type === 'AppButton');
  return { filters, selected, onCancelled, onStatusChanged, render, async confirm() {
    cancelButton.props.onPress();
    confirmation.find(button => button.text === 'Cancel')?.onPress();
    for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  } };
}
describe('open-job withdrawal result', () => {
  it('rechecks current job/booking state when acceptance won the delete race', async () => {
    const h = harness({ data: [], error: null });
    await h.confirm();
    expect(h.filters).toEqual([['id', 'job-a'], ['client_id', 'client-a'], ['status', 'open']]);
    expect(h.onCancelled).not.toHaveBeenCalled();
    expect(h.onStatusChanged).toHaveBeenCalledExactlyOnceWith();
  });
  it('navigates away only for deletion of the exact authorized job', async () => {
    const h = harness({ data: [{ id: 'job-a' }], error: null }); await h.confirm();
    expect(h.onCancelled).toHaveBeenCalledOnce(); expect(h.onStatusChanged).not.toHaveBeenCalled();
  });
  it('does not delete or recheck using an expired view lifetime', async () => {
    const h = harness({ data: [], error: null }, false); await h.confirm();
    expect(h.selected).not.toHaveBeenCalled(); expect(h.onStatusChanged).not.toHaveBeenCalled();
  });
  it('does not report success for an error result', async () => {
    const h = harness({ data: null, error: { code: '42501' } }); await h.confirm();
    expect(h.onCancelled).not.toHaveBeenCalled(); expect(h.onStatusChanged).not.toHaveBeenCalled();
  });
});
