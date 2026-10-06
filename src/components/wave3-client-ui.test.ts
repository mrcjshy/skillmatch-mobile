// @ts-expect-error -- Node-only static composition harness; not native runtime evidence.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(file, 'utf8');
const code = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const before = (source: string, a: string, b: string) => {
  const first = source.indexOf(a), second = source.indexOf(b);
  expect(first, a).toBeGreaterThanOrEqual(0);
  expect(second, b).toBeGreaterThanOrEqual(0);
  expect(first, `${a} before ${b}`).toBeLessThan(second);
};

const HOME = 'src/app/(client)/(tabs)/client/index.tsx';
const POST = 'src/components/client-post-job-screen.tsx';

describe('Client Home hierarchy', () => {
  const source = code(HOME);

  it('reads sticky name, current booking, then the jobs awaiting workers, with no hero block or metric tiles', () => {
    // Wave 7: Post a job left Home for the bottom bar's central action.
    expect(source).not.toContain('label="Post a job"');
    before(source, '<HomeStickyHeader', '<ActiveBookingHomeCard');
    before(source, '</HomeStickyHeader>', '<ScrollView');
    before(source, '<ActiveBookingHomeCard', 'title="Awaiting workers"');
    expect(source).not.toContain('masthead');
    expect(source).not.toContain('variant="inverse"');
    expect(source).not.toContain('AppCard');
  });

  it('keeps completed history off Home, which has no filled primary action of its own (Wave 7)', () => {
    expect(source).not.toMatch(/status === 'completed'/);
    expect((source.match(/variant="primary"/g) ?? []).length).toBe(0);
    // The waiting jobs are rows on Home itself, not a count that has to be opened.
    expect(source).toContain("job.status === 'open'");
    expect(source).toContain('groupedRowStyle(ui, groupPosition(index, openJobs.length))');
    expect(source).not.toContain('AppListRow');
    expect(source).not.toMatch(/<Modal|AppSheet|AppDialog/);
  });
});

describe('Post Job structure', () => {
  const source = code(POST);

  it('keeps the four real steps, gives each a plain title, and keeps text input out of the docked review step', () => {
    for (const title of ['What needs to be done', 'Where', 'When, budget and payment', 'Review your job']) expect(source).toContain(title);
    expect(source).toContain('wizardStep === 4 && !isLoading && !loadError');
    expect(source).toMatch(/wizardStep < 4 \? \(\s*<AppButton[^>]*label="Next"/);
    expect((source.match(/validatePostJobWizardStep\(/g) ?? []).length).toBe(1);
  });

  it('docks the budget summary beside one Post job action and keeps the keyboard offset', () => {
    const dock = source.slice(source.indexOf('{showDock ? ('));
    before(dock, 'styles.dockSummary', '<AppButton');
    expect((dock.slice(0, dock.indexOf('<Modal')).match(/<AppButton/g) ?? []).length).toBe(1);
    expect(source).toContain('keyboardVerticalOffset={headerHeight}');
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('keeps manual skill choice authoritative and ships no AI control, copy or request', () => {
    expect(source).not.toMatch(/\bAI\b|classif|suggest(ed)? skill|coming soon/i);
    expect(source).not.toMatch(/functions\.invoke|supabase\.storage|fetch\(/);
    // One picker and one catalog; the order of manual choices decides primary and secondary.
    expect((source.match(/<SkillCatalogPicker/g) ?? []).length).toBe(1);
    expect(source).toContain('togglePostJobSkill(');
    expect(source).not.toMatch(/openSkillsModal\('(primary|additional)'\)|skillsModalMode/);
  });

  it('uses rows for choices, payment radios with a sentence, and no glyph checkmarks', () => {
    expect(source).toContain('<RadioRow');
    expect(source).toContain('<SurfaceGroup>');
    expect(source).toContain('<FactRow');
    expect(source).not.toMatch(/[✓→←]/);
    expect(source).not.toContain('<AppCard');
  });
});

describe('Chat keeps its composer above a docked keyboard', () => {
  const source = code('src/components/booking-chat.tsx');
  it('pads on every platform and subtracts the native header', () => {
    expect(source).toContain('const headerHeight = useHeaderHeight();');
    expect(source).toMatch(/<KeyboardAvoidingView[^>]*behavior="padding"[^>]*keyboardVerticalOffset=\{headerHeight\}/);
  });
});

describe('Draft provider stays out of React Compiler', () => {
  it('opts the memory provider out so draft changes always reach consumers', () => {
    const source = read('src/providers/client-post-job-draft-provider.tsx');
    const body = source.slice(source.indexOf('export function ClientPostJobDraftMemoryProvider'));
    expect(body.slice(0, body.indexOf('const [memory]'))).toContain("'use no memo';");
  });
});

describe('Client surfaces keep out of banned patterns and the old palette', () => {
  const files = [
    HOME, 'src/app/(client)/(tabs)/client/jobs.tsx', 'src/app/(client)/(tabs)/client/profile.tsx', POST,
    'src/components/client-job-details.tsx', 'src/components/client-portfolio.tsx', 'src/components/job-schedule-picker.tsx',
    'src/components/skill-catalog-picker.tsx', 'src/components/selected-skill-chips.tsx', 'src/components/job-location-picker.tsx',
  ];

  it.each(files)('%s has no coloured side border, uppercase transform or glyph icon', (file) => {
    const source = code(file);
    expect(source, 'coloured side border').not.toMatch(/border(Left|Right)Width: [2-9]/);
    expect(source, 'uppercase').not.toMatch(/textTransform|letterSpacing: 0\.[5-9]/);
    expect(source, 'glyph icon').not.toMatch(/['"`>]\s*[✓→←◎]/);
    expect(source, 'legacy palette').not.toMatch(/brandIvory|brandSage|brandMoss|brandDeep|botanical|textOnBrandSecondary|featureSurface|featurePressed|primaryContainer|secondaryContainer|surfaceContainerHigh/);
  });

  it.each(files.filter((file) => !file.includes('portfolio')))('%s uses no AppCard for structure', (file) => {
    expect(code(file)).not.toContain('<AppCard');
  });

  it('never prints a Title Case label on touched Client surfaces', () => {
    const labels = ['Post Job', 'My Jobs', 'Edit Skills', 'Choose Skills', 'Sign Out', 'View/Edit Location', 'Retry / Refresh Job', 'Choose This Location', 'Use Current Location', 'Booking Details" variant'];
    for (const file of files) for (const label of labels) expect(code(file), `${file}: ${label}`).not.toContain(`"${label}"`);
  });
});

describe('My jobs presents status without changing it', () => {
  const source = code('src/app/(client)/(tabs)/client/jobs.tsx');
  it('shows a chip per job and keeps Details as the row action', () => {
    expect(source).toContain('<AppChip label={jobStatusLabel(job.status)} variant={jobStatusVariant(job.status)} />');
    expect(source).toContain('label="Details"');
    expect(source).toContain('groupedRowStyle(ui, groupPosition(index ?? 0, jobs.length))');
  });
});
