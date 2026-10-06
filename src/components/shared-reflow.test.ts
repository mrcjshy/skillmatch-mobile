// @ts-expect-error -- Node-only source/prop harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only source/prop harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s }, Pressable: 'Pressable', Text: 'Text', View: 'View', ScrollView: 'ScrollView' };
const jsx = (type: any, props: Props) => ({ type, props });
const cache: Props = {};
function load(file: string): Props {
  if (cache[file]) return cache[file];
  const exports: Props = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => load('src/constants/theme.ts').SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (name === 'react-native') return native;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === '@/global.css') return {};
      if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
      if (name === '@/components/app-symbol') return { AppSymbol: 'SymbolView' };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === 'react') return { useState: (v: any) => [v, () => {}] };
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + (name.startsWith('@/components/') ? '.tsx' : '.ts'));
      throw Error(name);
    } });
  cache[file] = exports;
  return exports;
}
function render(tree: any): any {
  if (Array.isArray(tree)) return tree.map(render);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return render(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: render(tree.props.children) } };
}
function all(tree: any, kind: string): any[] {
  if (Array.isArray(tree)) return tree.flatMap(x => all(x, kind));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children, kind)];
}
const { colors } = load('src/constants/theme.ts').SkillMatchTheme.ui;
const longName = 'Maria Josefina dela Cruz Villanueva — pagkukumpuni ng mga kasangkapan sa barangay';
const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);

// Evaluate inspected caller JSX and styles verbatim; hooks/data fetching are outside this seam.
function callerExpression(file: string, tag: string, locals: Props): any {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (!found && ((ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === tag) || (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === tag))) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw Error('Missing actual caller ' + tag);
  const exports: Props = {};
  const stylesSource = source.includes('function createStyles') ? source.slice(source.lastIndexOf('function createStyles')) + '\nconst {styles} = createStyles(ui);' : source.slice(source.lastIndexOf('const styles = StyleSheet.create('));
  const code = stylesSource + '\nexports.tree = (' + found.getText(ast) + ');';
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, StyleSheet: native.StyleSheet, ui: load('src/constants/theme.ts').SkillMatchTheme.ui, ...load('src/constants/theme.ts').SkillMatchTheme.ui, ...locals,
      require: () => ({ jsx, jsxs: jsx, Fragment: 'Fragment' }) });
  return exports.tree;
}
function checkContrast(tree: any, pressed = false, background = colors.surface, opacity = 1): void {
  if (Array.isArray(tree)) { tree.forEach(x => checkContrast(x, pressed, background, opacity)); return; }
  if (!tree || typeof tree !== 'object') return;
  const s = flat(typeof tree.props.style === 'function' ? tree.props.style({ pressed }) : tree.props.style);
  const bg = s.backgroundColor && s.backgroundColor !== 'transparent' ? s.backgroundColor : background;
  const alpha = opacity * (s.opacity ?? 1);
  expect(alpha).toBe(1); // Includes ancestors: no fading in these actual caller compositions.
  if (tree.type === 'Text' && s.color) expect(contrast(s.color, bg)).toBeGreaterThanOrEqual(4.5);
  if (s.borderWidth && s.borderColor) {
    expect(contrast(s.borderColor, bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(s.borderColor, background)).toBeGreaterThanOrEqual(3);
  }
  checkContrast(tree.props.children, pressed, bg, alpha);
}

it('retains actual ClientPortfolio header/avatar composition with full names and static ownership', () => {
  const source = callerExpression('src/components/client-portfolio.tsx', 'SectionHeader', {
    SectionHeader: load('src/components/section-header.tsx').SectionHeader,
    InitialsAvatar: load('src/components/initials-avatar.tsx').InitialsAvatar,
    state: { workerName: longName, workerPhotoUrl: null },
  });
  const tree = render(source);
  expect(tree.props.children).toHaveLength(2);
  expect(all(tree, 'Text')[0].props.children).toBe(longName);
  expect(all(tree, 'Pressable')).toHaveLength(0);
  expect(all(tree, 'View').find(x => x.props.accessibilityRole === 'image').props.accessibilityLabel).toMatch(/^Avatar /);
  checkContrast(tree);
});

it('preserves ActiveBooking header gutter, real View-all control and separate static heading across action states', () => {
  const { SectionHeader } = load('src/components/section-header.tsx');
  const { AppButton } = load('src/components/app-button.tsx');
  let calls = 0; const onPressViewAll = () => { calls++; };
  const tree = render(callerExpression('src/components/active-booking-home-card.tsx', 'SectionHeader', { SectionHeader, AppButton, extraCount: 2, onPressViewAll }));
  expect(tree.props.children).toHaveLength(2);
  expect(flat(tree.props.style).paddingHorizontal).toBe(20);
  expect(all(tree, 'Text')[0].props.children).toBe('Active booking');
  const button = all(tree, 'Pressable')[0];
  expect(all(tree, 'Pressable')).toHaveLength(1);
  expect(button.props.accessibilityLabel).toBe('View all confirmed bookings');
  expect(button.props.onPress).toBe(onPressViewAll);
  button.props.onPress(); expect(calls).toBe(1);
  const rest = flat(button.props.style({ pressed: false }));
  expect(flat(button.props.style({ pressed: true })).backgroundColor).not.toBe(rest.backgroundColor);
  expect(flat(button.props.style({ pressed: false }))).toEqual(rest);
  checkContrast(tree); checkContrast(tree, true);
  const solitary = render(callerExpression('src/components/active-booking-home-card.tsx', 'SectionHeader', { SectionHeader, AppButton, extraCount: 0, onPressViewAll }));
  expect(all(solitary, 'Pressable')).toHaveLength(0);
  const disabled = render(SectionHeader({ title: longName, trailing: jsx(AppButton, { label: 'View all', variant: 'ghost', disabled: true, onPress: onPressViewAll }) }));
  const disabledButton = all(disabled, 'Pressable')[0];
  expect(disabledButton.props.disabled).toBe(true);
  expect(disabledButton.props.accessibilityState).toEqual({ disabled: true, busy: false });
  expect(flat(disabledButton.props.style({ pressed: true }))).toEqual(flat(disabledButton.props.style({ pressed: false })));
  // A blocked text action is a flat line: it is told apart from the live one by its label colour, not a slab.
  expect(flat(disabledButton.props.style({ pressed: false })).backgroundColor).toBe('transparent');
  expect(flat(disabledButton.props.children.props.style).color).not.toBe(flat(button.props.children.props.style).color);
  checkContrast(disabled); checkContrast(disabled, true);
});

it('retains real directory row and user-detail compositions, dates, navigation arguments and static detail rows', () => {
  const dates = load('src/lib/date-time.ts');
  const presentation = load('src/lib/admin-presentation.ts');
  const { AdminRow } = load('src/components/admin-rows.tsx');
  const { InitialsAvatar } = load('src/components/initials-avatar.tsx');
  const { AppChip } = load('src/components/app-chip.tsx');
  const { groupPosition, groupedRowStyle } = load('src/components/grouped-row.ts');
  const timestamp = '2026-09-30T07:00:00.000Z';
  const formatted = dates.formatCardDateTime(timestamp);
  expect(formatted).toMatch(/Sep.*30.*(?:AM|PM)/);
  const source = readFileSync('src/components/admin-directory.tsx', 'utf8');
  const summarySource = source.slice(source.indexOf('function summary('), source.indexOf('export function AdminDirectory'));
  const exports: Props = {};
  runInNewContext(ts.transpileModule(summarySource + '\nexports.summary = summary;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, formatCardDateTime: dates.formatCardDateTime, workerVerificationStatus: presentation.workerVerificationStatus, availabilityLabel: presentation.availabilityLabel });
  for (const kind of ['worker', 'client']) {
    const pushed: any[] = [];
    const item = { user_id: 'worker-fixture', full_name: longName, is_active: true, has_profile: true, is_verified: true, availability_status: 'available', created_at: timestamp };
    const chip = presentation.directoryRowStatus(kind, item);
    const tree = render(callerExpression('src/components/admin-directory.tsx', 'AdminRow', {
      AdminRow, InitialsAvatar, AppChip, groupPosition, groupedRowStyle, item, index: 0, items: [item], kind, chip,
      line: exports.summary(item, kind), router: { push: (value: any) => pushed.push(value) },
    }));
    expect(tree.props.accessibilityLabel).toBe('View ' + kind + ' details for ' + longName);
    const texts = all(tree, 'Text').map(x => x.props.children);
    expect(texts).toContain(longName);
    expect(texts.some(x => typeof x === 'string' && x.includes(formatted))).toBe(true);
    expect(texts).toContain(kind === 'worker' ? 'Verified' : 'Active');
    if (kind === 'worker') expect(texts.some(x => typeof x === 'string' && x.includes('Available'))).toBe(true);
    tree.props.onPress();
    expect(pushed).toEqual([{ pathname: '/admin/user-detail', params: { userId: item.user_id, kind } }]);
    checkContrast(tree); checkContrast(tree, true);
  }
  const { AdminUserDetailView } = load('src/components/admin-user-detail-view.tsx');
  const client = { full_name: longName, is_active: true, created_at: timestamp, posted_jobs_count: 9999999 };
  const tree = render(jsx(AdminUserDetailView, { detail: client }));
  const texts = all(tree, 'Text').map(x => x.props.children);
  expect(texts).toContain(longName);
  expect(texts).toContain('Client account');
  expect(texts).toContain('9999999');
  expect(texts).toContain(dates.formatDetailDateTime(timestamp));
  expect(dates.formatDetailDateTime(timestamp)).toMatch(/2026/);
  expect(all(tree, 'Pressable')).toHaveLength(0);
  checkContrast(tree);
  const worker = { full_name: longName, is_active: false, created_at: null, has_profile: true, is_verified: false, availability_status: 'busy', completed_bookings_count: 3 };
  const workerTexts = all(render(jsx(AdminUserDetailView, { detail: worker })), 'Text').map(x => x.props.children);
  expect(workerTexts).toEqual(expect.arrayContaining(['Worker account', 'Inactive', 'Unverified', 'Busy', '3', 'Not recorded']));
  expect(all(render(jsx(AdminUserDetailView, { detail: worker })), 'Pressable')).toHaveLength(0);
});

it('keeps every static chip variant bounded, growing and fully labeled with caller-last styling', () => {
  const { AppChip } = load('src/components/app-chip.tsx');
  for (const variant of ['neutral', 'selected', 'positive', 'warning', 'danger']) {
    const tree = render(AppChip({ label: longName, variant }));
    const s = flat(tree.props.style), text = all(tree, 'Text')[0];
    expect(s.minHeight).toBe(28);
    expect(s.height).toBeUndefined();
    expect(s.maxWidth).toBe('100%');
    expect(s.flexShrink).toBe(1);
    expect(s.paddingVertical).toBe(4);
    expect(flat(text.props.style).maxWidth).toBe('100%');
    expect(flat(text.props.style).flexShrink).toBe(1);
    expect(text.props.children).toBe(longName);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(all(tree, 'Pressable')).toHaveLength(0);
    expect(s.opacity).toBeUndefined();
    expect(contrast(flat(text.props.style).color, s.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  }
  const caller = { maxWidth: 160, marginTop: 12 };
  const tree = AppChip({ label: longName, style: caller });
  expect(tree.props.style.at(-1)).toBe(caller);
  expect(flat(tree.props.style).maxWidth).toBe(160);
});

it('reflows SectionHeader copy and trailing action without duplicating or grouping their semantics', () => {
  const { SectionHeader } = load('src/components/section-header.tsx');
  const { AppButton } = load('src/components/app-button.tsx');
  let calls = 0;
  const callback = () => { calls++; };
  const caller = { paddingHorizontal: 20, maxWidth: 190 };
  const tree = render(SectionHeader({ title: longName, subtitle: longName, trailing: jsx(AppButton, { label: 'Tingnan ang lahat ng kasanayan', variant: 'ghost', onPress: callback }), style: caller }));
  expect(tree.props.children).toHaveLength(2);
  const [copy, trailing] = tree.props.children;
  expect(flat(tree.props.style).flexWrap).toBe('wrap');
  expect(tree.props.style.at(-1)).toBe(caller);
  expect(flat(copy.props.style).flexBasis).toBe('auto');
  expect(flat(copy.props.style).minWidth).toBe(0);
  expect(flat(copy.props.style).flexGrow).toBe(1);
  expect(flat(copy.props.style).flexShrink).toBe(1);
  expect(flat(copy.props.style).maxWidth).toBe('100%');
  expect(flat(trailing.props.style).maxWidth).toBe('100%');
  expect(flat(trailing.props.style).flexShrink).toBe(0);
  expect(all(copy, 'Text').map(x => x.props.children)).toEqual([longName, longName]);
  const button = all(trailing, 'Pressable')[0];
  expect(all(tree, 'Pressable')).toHaveLength(1);
  expect(button.props.onPress).toBe(callback);
  button.props.onPress(); expect(calls).toBe(1);
  for (const node of [tree, copy, trailing]) {
    expect(node.props.accessible).toBeUndefined();
    expect(node.props.accessibilityRole).toBeUndefined();
    expect(flat(node.props.style).opacity).toBeUndefined();
  }
  for (const text of all(tree, 'Text')) expect(text.props.numberOfLines).toBeUndefined();
  expect(all(render(SectionHeader({ title: 'Only heading', subtitle: '', trailing: null })), 'Text').map(x => x.props.children)).toEqual(['Only heading']);
});
