// @ts-expect-error -- Node-only static composition harness (the app tsconfig carries no Node types).
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { directoryRowStatus } from '@/lib/admin-presentation';
import { formatScheduleDate, formatScheduleTime } from '@/lib/date-time';

/**
 * Iteration 06 Wave 6.5: the five accessibility repairs, rendered from source with inert framework
 * seams (the same harness as wave4-admin-ui). This proves the props React Native turns into the
 * Android/iOS accessibility tree; the TesterArmy w6 suites read that tree at runtime.
 *   A11Y-01 Admin directory rows carry their visible status as the row's value.
 *   A11Y-02 Error messages are alerts in a polite live region.
 *   A11Y-03 A field's error is part of the input's own accessible output, not read twice.
 *   A11Y-04 (Post job location row) is in client-post-job-screen.test.ts with that screen's harness.
 *   A11Y-05 Schedule rows carry the chosen date and time as their value.
 */
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const source = (path: string): string => readFileSync(path, 'utf8');
const noop = () => undefined;
const node = (type: unknown, props: Props): Element => ({ type, props });
const hosts = Object.fromEntries(['Text', 'View', 'ScrollView', 'FlatList', 'Pressable', 'ActivityIndicator', 'TextInput'].map((name) => [name, name]));
const cache: Record<string, Props> = {};

function load(path: string): Props {
  if (cache[path]) return cache[path];
  const exports: Props = {};
  cache[path] = exports;
  const theme = () => (load('src/constants/theme.ts').SkillMatchTheme as { ui: unknown }).ui;
  const seams: Record<string, Props> = {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { Component: class {}, useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, noop], useRef: (value: unknown) => ({ current: value }), useCallback: (fn: unknown) => fn, useEffect: noop, useMemo: (fn: () => unknown) => fn() },
    'react-native': { ...hosts, StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'android', select: (choices: Props) => choices.android ?? choices.default } },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    '@/global.css': {},
    'expo-symbols': { SymbolView: 'SymbolView' },
    '@/components/refinement-theme': { useUiTheme: theme, RefinementThemeProvider: ({ children }: Props) => children },
  };
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (id.startsWith('@/')) {
      const base = 'src/' + id.slice(2);
      const exists = (file: string) => { try { readFileSync(file); return true; } catch { return false; } };
      const file = [base + '.tsx', base + '.ts'].find(exists);
      if (file) return load(file);
    }
    throw new Error(`Unapproved import: ${id}`);
  };
  const output = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', output)(requireSeam, exports);
  return exports;
}
function render(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(render);
  if (!tree || typeof tree !== 'object') return tree;
  const element = tree as Element;
  if (typeof element.type === 'function') return render((element.type as (props: Props) => unknown)(element.props));
  return { ...element, props: { ...element.props, children: render(element.props.children) } };
}
function all(tree: unknown, kind?: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((item) => all(item, kind));
  if (!tree || typeof tree !== 'object') return [];
  const element = tree as Element;
  return [...(kind === undefined || String(element.type) === kind ? [element] : []), ...all(element.props.children, kind)];
}
const texts = (tree: unknown): string[] => all(tree, 'Text').map((item) => [item.props.children].flat().join(''));

describe('A11Y-01 Admin row status reaches assistive technology', () => {
  const { AdminRow } = load('src/components/admin-rows.tsx');
  const { AppChip } = load('src/components/app-chip.tsx');

  it('a pressable row keeps its name and reads the visible status as its value', () => {
    const tree = render(node(AdminRow, {
      title: 'Ana Cruz', lines: ['Available'], trailing: node(AppChip, { label: 'Verified', variant: 'positive' }),
      onPress: noop, accessibilityLabel: 'View worker details for Ana Cruz', accessibilityValue: 'Verified',
    })) as Element;
    expect(tree.type).toBe('Pressable');
    expect(tree.props.accessibilityRole).toBe('button');
    expect(tree.props.accessibilityLabel).toBe('View worker details for Ana Cruz');
    expect(tree.props.accessibilityValue).toEqual({ text: 'Verified' });
    // The visible chip is unchanged: it still renders its own words.
    expect(texts(tree)).toEqual(['Ana Cruz', 'Available', 'Verified']);
  });

  it('a row without a status has no value, and a static row passes the value too', () => {
    const plain = render(node(AdminRow, { title: 'Reports', onPress: noop })) as Element;
    expect(plain.props.accessibilityValue).toBeUndefined();
    const fixed = render(node(AdminRow, { title: 'Ana', accessibilityLabel: 'Ana', accessibilityValue: 'Inactive' })) as Element;
    expect(fixed.type).toBe('View');
    expect(fixed.props.accessible).toBe(true);
    expect(fixed.props.accessibilityValue).toEqual({ text: 'Inactive' });
  });

  it('the Worker and Client directories pass the same words their chip shows', () => {
    const text = source('src/components/admin-directory.tsx');
    expect(text).toContain('trailing={<AppChip label={chip.label} variant={chip.variant} />}');
    expect(text).toContain('accessibilityLabel={`View ${kind} details for ${item.full_name}`}');
    expect(text).toContain('accessibilityValue={chip.label}');
    const row = (extra: Props) => ({ user_id: 'u', full_name: 'Ana', is_active: true, has_profile: true, is_verified: true, ...extra });
    expect(directoryRowStatus('worker', row({}) as never).label).toBe('Verified');
    expect(directoryRowStatus('worker', row({ is_verified: false }) as never).label).toBe('Unverified');
    expect(directoryRowStatus('worker', row({ is_active: false }) as never).label).toBe('Inactive');
    expect(directoryRowStatus('client', row({}) as never).label).toBe('Active');
    expect(directoryRowStatus('client', row({ is_active: false }) as never).label).toBe('Inactive');
  });
});

describe('A11Y-02 error messages are announced alerts', () => {
  const { InlineStatus } = load('src/components/inline-status.tsx');
  const { AppNotice } = load('src/components/app-notice.tsx');
  const message = (tree: unknown, words: string) => all(tree, 'Text').find((text) => [text.props.children].flat().join('') === words)!;

  it('an InlineStatus error is an alert in a polite live region; other variants are plain text', () => {
    const error = message(render(node(InlineStatus, { variant: 'error', message: 'Please select at least one required skill.' })), 'Please select at least one required skill.');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error.props.accessibilityLiveRegion).toBe('polite');
    for (const variant of ['note', 'empty', 'loading']) {
      const plain = message(render(node(InlineStatus, { variant, message: 'Nothing yet' })), 'Nothing yet');
      expect(plain.props.accessibilityRole).toBeUndefined();
      expect(plain.props.accessibilityLiveRegion).toBeUndefined();
    }
  });

  it('a danger AppNotice is an alert in a polite live region; info, warning and success are not', () => {
    const danger = message(render(node(AppNotice, { variant: 'danger', message: 'Upload failed.' })), 'Upload failed.');
    expect(danger.props.accessibilityRole).toBe('alert');
    expect(danger.props.accessibilityLiveRegion).toBe('polite');
    for (const variant of ['info', 'warning', 'success']) {
      const quiet = message(render(node(AppNotice, { variant, message: 'Heads up' })), 'Heads up');
      expect(quiet.props.accessibilityRole).toBeUndefined();
      expect(quiet.props.accessibilityLiveRegion).toBeUndefined();
    }
  });

  it('the live region is polite (announced once per change, never interrupting), not assertive', () => {
    for (const file of ['src/components/inline-status.tsx', 'src/components/app-notice.tsx']) {
      expect(source(file)).not.toContain("'assertive'");
      expect(source(file)).not.toContain('announceForAccessibility');
    }
  });
});

describe('A11Y-03 a field error belongs to its input', () => {
  const { AppField } = load('src/components/app-field.tsx');
  const field = (props: Props) => render(node(AppField, props)) as Element;
  const input = (tree: Element) => all(tree, 'TextInput')[0];
  const visibleError = (tree: Element, words: string) => all(tree, 'Text').find((text) => [text.props.children].flat().join('') === words);

  it('valid: the input is named by its label, and no error is described', () => {
    const tree = field({ label: 'Search Workers by name', helperText: 'Type a name' });
    expect(input(tree).props.accessibilityLabel).toBe('Search Workers by name');
    expect(input(tree).props.accessibilityHint).toBeUndefined();
  });

  it('invalid: the error joins the input name once; the visible line stays but is hidden from accessibility', () => {
    const words = 'Search must be 100 characters or fewer.';
    const tree = field({ label: 'Search Workers by name', errorText: words });
    expect(input(tree).props.accessibilityLabel).toBe(`Search Workers by name, Error: ${words}`);
    const line = visibleError(tree, words)!;
    expect(line).toBeDefined();
    expect(line.props.importantForAccessibility).toBe('no');
    expect(line.props.accessibilityElementsHidden).toBe(true);
    expect(all(tree, 'Text').filter((text) => [text.props.children].flat().join('') === words)).toHaveLength(1);
  });

  it('a field named by reference keeps that reference and gets the error as its hint instead', () => {
    const tree = field({ label: 'Code', accessibilityLabelledBy: 'code-label', errorText: 'Enter the 6-digit code.' });
    expect(input(tree).props.accessibilityLabel).toBeUndefined();
    expect(input(tree).props.accessibilityLabelledBy).toBe('code-label');
    expect(input(tree).props.accessibilityHint).toBe('Error: Enter the 6-digit code.');
  });

  it('cleared: once the error is gone the name and hint return to the valid state', () => {
    const tree = field({ label: 'Search Workers by name', errorText: '' });
    expect(input(tree).props.accessibilityLabel).toBe('Search Workers by name');
    expect(input(tree).props.accessibilityHint).toBeUndefined();
    expect(visibleError(tree, '')).toBeUndefined();
  });

  it('validation logic and the value passed to callers are untouched', () => {
    let changed = '';
    const tree = field({ label: 'Name', value: 'Ana', errorText: 'Too short', onChangeText: (text: string) => { changed = text; } });
    expect(input(tree).props.value).toBe('Ana');
    (input(tree).props.onChangeText as (text: string) => void)('Anabel');
    expect(changed).toBe('Anabel');
  });
});

describe('A11Y-05 schedule rows expose the chosen date and time', () => {
  const { JobSchedulePicker } = load('src/components/job-schedule-picker.tsx');
  const rows = (props: Props) => all(render(node(JobSchedulePicker, { onChangeDate: noop, onChangeTime: noop, ...props })), 'Pressable');
  const row = (props: Props, label: string) => rows(props).find((item) => item.props.accessibilityLabel === label)!;

  it('unset rows say so and offer to choose', () => {
    expect(row({ date: null, time: null }, 'Scheduled date').props.accessibilityValue).toEqual({ text: 'Not selected' });
    expect(row({ date: null, time: null }, 'Scheduled date').props.accessibilityHint).toBe('Choose date');
    expect(row({ date: null, time: null }, 'Scheduled time').props.accessibilityValue).toEqual({ text: 'Not selected' });
    expect(row({ date: null, time: null }, 'Scheduled time').props.accessibilityHint).toBe('Choose time');
  });

  it('chosen rows read the same formatted value the row shows, and offer to change it', () => {
    const date = new Date(2026, 9, 3);
    const time = new Date(2026, 9, 3, 15, 30);
    const picked = { date, time };
    expect(row(picked, 'Scheduled date').props.accessibilityValue).toEqual({ text: formatScheduleDate(date) });
    expect(row(picked, 'Scheduled date').props.accessibilityHint).toBe('Change date');
    expect(row(picked, 'Scheduled time').props.accessibilityValue).toEqual({ text: formatScheduleTime(time) });
    expect(row(picked, 'Scheduled time').props.accessibilityHint).toBe('Change time');
    expect(texts(row(picked, 'Scheduled date'))).toContain(formatScheduleDate(date));
    expect(texts(row(picked, 'Scheduled time'))).toContain(formatScheduleTime(time));
  });
});
