// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const jsx = (type: any, props: Props) => ({ type, props });
const load = (file: string, modules: Props) => {
  const exports: Props = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, Intl, Date, Number, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
  return exports;
};
const dateTime = load('src/lib/date-time.ts', {});
const copy = load('src/lib/schedule-conflict.ts', { './date-time': dateTime });
const { ScheduleConflictDialog } = load('src/components/schedule-conflict-dialog.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/components/app-button': { AppButton: 'AppButton' },
  '@/components/app-dialog': { AppDialog: 'AppDialog' },
  '@/components/skillmatch-mascot': { SkillMatchMascot: 'SkillMatchMascot' },
  '@/lib/schedule-conflict': copy,
});
const all = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(all) : tree?.props ? [tree, ...all(tree.props.children)] : [];

it('SCH-01: Itik explains the clash, names the booking in the way, and offers OK and the bookings', () => {
  const booking = { job_title: 'Aircon cleaning', job_scheduled_at: '2026-11-07T05:00:00.000Z' };
  const onClose = vi.fn();
  const onViewBookings = vi.fn();
  const dialog = ScheduleConflictDialog({ visible: true, booking, onClose, onViewBookings });
  expect(dialog.type).toBe('AppDialog');
  expect(dialog.props).toMatchObject({
    visible: true,
    onRequestClose: onClose,
    title: 'You already have a booking at this time',
    message: copy.scheduleConflictMessage(booking),
  });
  expect(dialog.props.message).toContain('Aircon cleaning');
  expect(dialog.props.hero).toMatchObject({ type: 'SkillMatchMascot', props: { expression: 'oops', active: true } });
  const buttons = all(dialog.props.actions).filter((node) => node.type === 'AppButton');
  expect(buttons.map((button) => [button.props.label, button.props.variant])).toEqual([['OK', undefined], ['View my bookings', 'ghost']]);
  buttons[0].props.onPress();
  buttons[1].props.onPress();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onViewBookings).toHaveBeenCalledTimes(1);
});

it('SCH-01: says it in general words until the booking in the way is known, and Itik rests while closed', () => {
  const dialog = ScheduleConflictDialog({ visible: false, booking: null, onClose: () => undefined, onViewBookings: () => undefined });
  expect(dialog.props.message).toBe(copy.SCHEDULE_CONFLICT_COPY.general);
  expect(dialog.props.visible).toBe(false);
  expect(dialog.props.hero.props.active).toBe(false);
});
