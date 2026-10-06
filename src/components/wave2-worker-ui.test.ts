// @ts-expect-error -- Node-only static composition harness; not native runtime evidence.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type Props = Record<string, any>;
const flat = (style: any): Props => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style || {});
const nodes = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const ofType = (tree: any, type: string) => nodes(tree).filter((node) => node.type === type);
const read = (file: string): string => readFileSync(file, 'utf8');
const code = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const jsx = (type: any, props: Props) => (typeof type === 'function' ? type(props) : { type, props });
const native = {
  Platform: { OS: 'android', select: (v: Props) => v.android ?? v.default },
  StyleSheet: { create: (v: Props) => v, hairlineWidth: 1 },
  View: 'View', Text: 'Text',
};
function compile(file: string, modules: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected import: ' + name); return modules[name]; }, exports);
  return exports;
}
const ui = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} }).SkillMatchTheme.ui;
const base = {
  'react-native': native,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/components/refinement-theme': { useUiTheme: () => ui },
  '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
  '@/components/app-divider': { AppDivider: 'AppDivider' },
  'expo-symbols': {},
  react: {},
};

describe('grouped rows: a list that reads as one surface', () => {
  const { groupPosition, groupedRowStyle } = compile('src/components/grouped-row.ts', { 'react-native': native });

  it('places each row by its index and count', () => {
    expect(groupPosition(0, 1)).toBe('only');
    expect([0, 1, 2, 3].map((index) => groupPosition(index, 4))).toEqual(['first', 'middle', 'middle', 'last']);
    expect(groupPosition(0, 0)).toBe('only');
  });

  it('draws the group edge as a hairline, rounds only the outer corners and never uses a coloured side border', () => {
    const middle = groupedRowStyle(ui, 'middle');
    expect(middle).toMatchObject({ backgroundColor: ui.colors.surface, borderColor: ui.colors.hairline, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderBottomWidth: 0 });
    for (const position of ['only', 'first', 'middle', 'last']) {
      const style = groupedRowStyle(ui, position);
      expect(style.borderLeftWidth).toBe(1); expect(style.borderRightWidth).toBe(1); expect(style.borderTopWidth).toBe(1);
      expect(style.borderColor).toBe(ui.colors.hairline);
      expect(style.borderLeftColor).toBeUndefined();
    }
  });
});

describe('SurfaceGroup', () => {
  const { SurfaceGroup } = compile('src/components/surface-group.tsx', base);

  it('puts one hairline divider between rows, drops empty slots and flattens nested lists', () => {
    const tree = SurfaceGroup({ children: ['a', null, false, [{ type: 'Row', props: { id: 1 } }, undefined, { type: 'Row', props: { id: 2 } }]] });
    expect(tree.type).toBe('View');
    expect(flat(tree.props.style)).toMatchObject({ backgroundColor: ui.colors.surface, borderRadius: 16, overflow: 'hidden', borderColor: ui.colors.hairline });
    const rows = tree.props.children;
    expect(rows).toHaveLength(3);
    expect(ofType(rows[0], 'AppDivider')).toHaveLength(0);
    expect(ofType(rows[1], 'AppDivider')).toHaveLength(1);
    expect(ofType(rows[2], 'AppDivider')).toHaveLength(1);
  });

  it('renders nothing when there is nothing to group', () => {
    expect(SurfaceGroup({ children: [null, false] })).toBeNull();
  });
});

describe('FactRow', () => {
  const { FactRow } = compile('src/components/fact-row.tsx', base);

  it('returns nothing for a missing value so no empty labelled row ever appears', () => {
    expect(FactRow({ label: 'Schedule', value: null })).toBeNull();
    expect(FactRow({ label: 'Schedule', value: '' })).toBeNull();
  });

  it('shows a quiet label over a wrapping value and speaks both together', () => {
    const row = FactRow({ icon: { android: 'schedule' }, label: 'Schedule', value: 'October 21 at 3:00 PM', strong: true, selectable: true });
    expect(row.props.accessibilityLabel).toBe('Schedule: October 21 at 3:00 PM');
    expect(row.props.accessible).toBe(true);
    const [label, value] = ofType(row, 'Text');
    expect(flat(label.props.style).color).toBe(ui.colors.textSecondary);
    expect(flat(value.props.style)).toMatchObject({ color: ui.colors.textPrimary, fontWeight: '600' });
    expect(value.props.selectable).toBe(true);
    expect(value.props.numberOfLines).toBeUndefined();
    expect(ofType(row, 'AppSymbol')).toHaveLength(1);
  });
});

describe('FactRow inline (amount rows)', () => {
  const { FactRow } = compile('src/components/fact-row.tsx', base);

  it('puts a short value on the label row and lets it wrap below instead of truncating', () => {
    const row = FactRow({ label: 'Job budget', value: '₱500', strong: true, inline: true });
    const copy = nodes(row).find((node) => node.type === 'View' && flat(node.props.style).flexWrap === 'wrap');
    expect(flat(copy.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' });
    const [, value] = ofType(row, 'Text');
    expect(flat(value.props.style)).toMatchObject({ textAlign: 'right', flexShrink: 1 });
    expect(value.props.numberOfLines).toBeUndefined();
    expect(row.props.accessibilityLabel).toBe('Job budget: ₱500');
  });

  it('stays stacked by default so long text keeps its own line', () => {
    const row = FactRow({ label: 'Area', value: 'Santa Ana, Pateros' });
    expect(nodes(row).some((node) => node.type === 'View' && flat(node.props.style).flexWrap === 'wrap')).toBe(false);
  });
});

describe('Job Opportunity action dock', () => {
  const source = code('src/components/job-opportunity-details.tsx');

  it('shows the budget summary beside the single Accept action, outside the scroll area', () => {
    const dock = source.slice(source.indexOf('<View style={[styles.actionDock'));
    expect(dock.indexOf('styles.dockSummary')).toBeGreaterThan(0);
    expect(dock.indexOf('styles.dockSummary')).toBeLessThan(dock.indexOf('<AppButton'));
    expect((dock.match(/<AppButton/g) ?? []).length).toBe(1);
    expect(source.indexOf('</ScrollView>')).toBeLessThan(source.indexOf('<View style={[styles.actionDock'));
    expect(source).toMatch(/actionDock: \{[^}]*flexWrap: 'wrap'/);
  });
});

describe('Worker Home hierarchy', () => {
  const source = code('src/app/(worker)/(tabs)/worker/index.tsx');

  it('reads sticky name, status, active work and the available-jobs heading, then the notice and job rows, with no card and no stat tiles', () => {
    const order = ['<HomeStickyHeader', '<AvailabilityControl', '<ActiveBookingHomeCard', 'title="Available jobs"', '</HomeStickyHeader>', 'identityNotice !== ', '<JobOpportunityCompactCard'].map((marker) => source.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(source).not.toContain('AppCard');
    expect(source).not.toContain('discoveryEntry');
  });

  it('needs no button to reach work: the jobs are the content, with no browse entry point', () => {
    expect(source).not.toContain('<AppButton');
    expect(source).not.toMatch(/Browse opportunities|Find work/);
    expect(source).not.toMatch(/variant="(secondary|ghost)"/);
  });
});

describe('Work Status uses the shared bottom sheet, not a bespoke centred modal', () => {
  const source = code('src/components/availability-control.tsx');

  it('is built on AppSheet and RadioRow with no Modal of its own', () => {
    expect(source).toContain('<AppSheet');
    expect(source).toContain('<RadioRow');
    expect(source).not.toMatch(/\bModal\b/);
    expect(source).not.toContain('animationType');
    expect(source).toContain('title="Work status"');
  });
});

describe('Worker surfaces keep out of the banned patterns and the old palette', () => {
  const files = [
    'src/app/(worker)/(tabs)/worker/index.tsx', 'src/app/(worker)/(tabs)/worker/profile.tsx',
    'src/components/availability-control.tsx', 'src/components/active-booking-home-card.tsx', 'src/components/booking-compact-card.tsx',
    'src/components/booking-details.tsx', 'src/components/my-bookings-list.tsx', 'src/components/job-opportunity-compact-card.tsx',
    'src/components/job-opportunity-details.tsx', 'src/components/resume-builder.tsx',
    'src/components/skill-gap.tsx', 'src/components/my-reports-list.tsx', 'src/components/my-report-details.tsx',
    'src/components/report-form.tsx', 'src/components/worker-portfolio.tsx', 'src/components/date-landmark.tsx', 'src/components/service-mark.tsx',
  ];

  it.each(files)('%s has no coloured side border, uppercase transform, glyph icons or legacy green/ivory aliases', (file) => {
    const source = code(file);
    expect(source, 'coloured side border').not.toMatch(/border(Left|Right)Width: [2-9]/);
    expect(source, 'uppercase').not.toMatch(/textTransform|letterSpacing: 0\.[5-9]/);
    expect(source, 'glyph icon').not.toMatch(/['"`>]\s*[✓→−]/);
    expect(source, 'legacy palette').not.toMatch(/brandIvory|brandSage|brandMoss|brandDeep|botanical|textOnBrandSecondary|featureSurface|featurePressed|primaryContainer|secondaryContainer|surfaceContainerHigh|accentSoft/);
  });

  it.each(files.filter((file) => !file.includes('portfolio')))('%s uses no AppCard for structure', (file) => {
    expect(code(file)).not.toContain('<AppCard');
  });

  it('never prints a Title Case or ALL CAPS label in the Worker booking and opportunity copy', () => {
    for (const label of ['Cancel Booking', 'Mark as Completed', 'Confirm Cash Received', 'Open Chat', 'View Portfolio', 'Generate & Share PDF', 'REQUIRED JOB SKILLS', 'No Show']) {
      for (const file of files) expect(code(file), `${file}: ${label}`).not.toContain(label);
    }
  });
});
