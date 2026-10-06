// @ts-expect-error -- Node-only static harness (the app tsconfig carries no Node types).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Iteration 06 Wave 5 (consistency and cleanup). Static evidence only: source scans plus real TSX
 * executed with inert framework seams. It proves structure, wiring and copy, not native layout; the
 * TesterArmy suites cover runtime.
 */
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };

const code = (path: string): string => readFileSync(path, 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sources = files('src').filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

let fontScale = 1;
const node = (type: unknown, props: Props): Element => ({ type, props });
const cache: Record<string, Props> = {};
function load(path: string): Props {
  if (cache[path]) return cache[path];
  const exports: Props = {};
  cache[path] = exports;
  const theme = () => (load('src/constants/theme.ts').SkillMatchTheme as { ui: unknown }).ui;
  const seams: Record<string, Props> = {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': {
      ...Object.fromEntries(['Text', 'View', 'Pressable'].map((name) => [name, name])),
      useWindowDimensions: () => ({ fontScale }), StyleSheet: { create: (value: unknown) => value },
      Platform: { OS: 'android', select: (choices: Props) => choices.android ?? choices.default },
    },
    '@/global.css': {},
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/components/refinement-theme': { useUiTheme: theme },
  };
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (id.startsWith('@/')) {
      const file = ['.tsx', '.ts'].map((ext) => 'src/' + id.slice(2) + ext).find((candidate) => existsSync(candidate));
      if (file) return load(file);
    }
    throw new Error(`Unapproved import: ${id}`);
  };
  const output = ts.transpileModule(code(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
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
function all(tree: unknown, type?: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => all(child, type));
  if (!tree || typeof tree !== 'object') return [];
  const element = tree as Element;
  return [...(!type || element.type === type ? [element] : []), ...all(element.props.children, type)];
}
const flat = (style: unknown): Props => Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : (style as Props) ?? {};
const ui = () => (load('src/constants/theme.ts').SkillMatchTheme as { ui: { type: Record<string, { lineHeight: number }> } }).ui;

describe('one token system: no compatibility aliases are consumed', () => {
  const aliasUse = /\bcolors\.(background|brandIvory|surfaceSubtle|elevatedSurface|primary|primaryPressed|primaryContainer|onPrimaryContainer|secondaryContainer|onSecondaryContainer|surfaceContainerHigh|accentSoft|textOnAccent|textInverse|textOnBrandSecondary|textDisabled|brandSage|brandDeep|brandMoss|botanical|navigationSurface|featureSurface|featurePressed|textOnFeatureSecondary|border|selected|overlay|danger|dangerTint|accentWorker|accentClient|accentAdmin)\b|\bradius\.(md|lg|xl|action|hero)\b|\btype\.(cardTitle|bodySmall)\b|\bspacing\.(xxxl|legacyLarge)\b|SkillMatchTheme\.(brand|surface|border|text|feedback|status|spacing|radius|size)\b|\bgradients\b/;
  it('every source file (and the Tamagui config) uses canonical token names only', () => {
    const scanned = [...sources, 'tamagui.config.ts'];
    expect(scanned.length).toBeGreaterThan(200);
    expect(scanned.filter((file) => aliasUse.test(code(file)))).toEqual([]);
  });
  it('theme.ts exports only the canonical SkillMatchTheme (no Expo template exports)', () => {
    const theme = code('src/constants/theme.ts');
    expect(theme).not.toMatch(/export const (Colors|Fonts|Spacing|BottomTabInset|MaxContentWidth)|export type ThemeColor/);
    expect(theme).toContain('export const SkillMatchTheme = { ui } as const;');
  });
  it('keeps Tamagui\'s core background on the canvas after the alias spread went away', () => {
    expect(code('tamagui.config.ts')).toContain('background: colors.canvas,');
  });
});

describe('dead UI code is gone and nothing points at it', () => {
  const removed = [
    'src/app/(worker)/(tabs)/worker/opportunities.tsx', 'src/components/find-work-overlay.tsx', 'src/components/service-card-skeleton.tsx',
    'src/components/app-list-row.tsx', 'src/components/skill-list-summary.tsx', 'src/components/animated-icon.tsx', 'src/components/app-tabs.tsx',
    'src/components/web-badge.tsx', 'src/components/hint-row.tsx', 'src/components/external-link.tsx', 'src/components/themed-text.tsx',
    'src/components/themed-view.tsx', 'src/components/icon-circle.tsx', 'src/hooks/use-theme.ts', 'src/hooks/use-color-scheme.ts',
  ];
  it.each(removed)('%s no longer exists', (file) => { expect(existsSync(file)).toBe(false); });
  it('no source imports or navigates to a removed module or the Find work route', () => {
    const names = /find-work-overlay|FindWorkOverlay|worker\/opportunities|service-card-skeleton|app-list-row|AppListRow|skill-list-summary|SkillListSummary|animated-icon|themed-text|themed-view|web-badge|hint-row|external-link|icon-circle|use-color-scheme|hooks\/use-theme/;
    expect(sources.filter((file) => names.test(code(file)))).toEqual([]);
  });
  it('the Worker bar has exactly Home, Bookings and Profile and no hidden route', () => {
    const tabs = code('src/app/(worker)/(tabs)/_layout.tsx');
    expect([...tabs.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((match) => match[1])).toEqual(['worker/index', 'worker/bookings', 'worker/profile']);
    expect(tabs).not.toMatch(/href: null/);
    expect([...tabs.matchAll(/<TabLabel[^>]*>([^<]+)<\/TabLabel>/g)].map((match) => match[1])).toEqual(['Home', 'Bookings', 'Profile']);
  });
});

describe('one status vocabulary across roles', () => {
  it('maps the same stored state to the same chip tone everywhere', () => {
    const { bookingStatusVariant, reportStatusVariant, jobStatusVariant, jobStatusLabel } = load('src/lib/status-presentation.ts') as Record<string, (status: string) => string>;
    expect(['confirmed', 'completed', 'pending', 'cancelled', 'no_show', 'unknown'].map(bookingStatusVariant)).toEqual(['info', 'positive', 'warning', 'danger', 'danger', 'neutral']);
    expect(['submitted', 'under_review', 'resolved', 'dismissed'].map(reportStatusVariant)).toEqual(['warning', 'info', 'positive', 'neutral']);
    expect(['open', 'matched', 'completed', 'cancelled', 'unset'].map(jobStatusVariant)).toEqual(['info', 'positive', 'positive', 'danger', 'neutral']);
    expect(['open', 'matched'].map(jobStatusLabel)).toEqual(['Open', 'Matched']);
  });
  it('no screen keeps its own copy of a status-to-chip mapping', () => {
    expect(sources.filter((file) => /function \w*(Chip|Status)Variant\(/.test(code(file)) && file !== 'src/lib/status-presentation.ts')).toEqual([]);
    for (const file of ['src/components/booking-chat.tsx', 'src/components/booking-details.tsx', 'src/components/booking-compact-card.tsx',
      'src/components/my-reports-list.tsx', 'src/components/my-report-details.tsx', 'src/app/(admin)/(tabs)/admin/reports.tsx',
      'src/app/(admin)/admin/report-details.tsx', 'src/app/(client)/(tabs)/client/jobs.tsx', 'src/components/client-job-details.tsx']) {
      expect(code(file), file).toContain("from '@/lib/status-presentation'");
    }
  });
  it('Job details shows the cased status in the shared tone, not the raw stored value', () => {
    const details = code('src/components/client-job-details.tsx');
    expect(details).toContain('<AppChip label={jobStatusLabel(job.status)} variant={jobStatusVariant(job.status)} />');
    expect(details).not.toContain('Status: ${job.status}');
  });
});

describe('leading glyphs sit on the title line (Reports row fix, shared by every row primitive)', () => {
  for (const scale of [1, 1.3]) {
    it(`AdminRow at ${scale * 100}%: glyph box is one title line tall, top of the copy column; avatar and chevron stay row-centred`, () => {
      fontScale = scale;
      const { AdminRow } = load('src/components/admin-rows.tsx') as { AdminRow: (props: Props) => Element };
      const tree = render(node(AdminRow, {
        icon: { android: 'flag', ios: 'flag' }, title: 'Reports', lines: ['3 reports need attention'],
        trailing: node('AppChip', { label: '3 open' }), onPress: () => undefined,
      })) as Element;
      const row = flat((tree.props.style as (state: Props) => unknown)({ pressed: false }));
      expect(row.alignItems).toBe('center');
      const parts = ((tree.props.children as Element).props.children as unknown[]).filter((part) => part && typeof part === 'object') as Element[];
      const [main, chevron] = parts;
      expect(flat(main.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start', flex: 1 });
      const glyph = (main.props.children as Element[])[0];
      expect(flat(glyph.props.style).minHeight).toBeCloseTo(ui().type.bodyEmphasis.lineHeight * scale);
      expect(flat(glyph.props.style)).toMatchObject({ justifyContent: 'center', alignItems: 'center' });
      expect(glyph.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(all(chevron, 'AppSymbol')[0].props.name).toEqual({ android: 'chevron_right', ios: 'chevron.right' });
      fontScale = 1;
    });
  }
  it('the shared NavRow follows the same rule with its body-weight title', () => {
    fontScale = 1.3;
    const { NavRow } = load('src/components/nav-row.tsx') as { NavRow: (props: Props) => Element };
    const tree = render(node(NavRow, { label: 'Help and FAQ', hint: 'Common questions', icon: { android: 'help_outline', ios: 'questionmark.circle' }, onPress: () => undefined })) as Element;
    expect(tree.props.accessibilityLabel).toBe('Help and FAQ');
    const main = (tree.props.children as Element[])[0];
    expect(flat(main.props.style).alignItems).toBe('flex-start');
    expect(flat((main.props.children as Element[])[0].props.style).minHeight).toBeCloseTo(ui().type.body.lineHeight * 1.3);
    expect(all(tree, 'Text').map((text) => text.props.children)).toEqual(['Help and FAQ', 'Common questions']);
    fontScale = 1;
  });
  it('Worker and Client profiles use the one shared NavRow, with the same divider inset', () => {
    for (const file of ['src/app/(worker)/(tabs)/worker/profile.tsx', 'src/app/(client)/(tabs)/client/profile.tsx']) {
      const source = code(file);
      expect(source, file).toContain("import { NavRow } from '@/components/nav-row';");
      expect(source, file).not.toMatch(/function NavRow\b/);
      expect(source, file).not.toMatch(/<SurfaceGroup>\s*<NavRow/);
    }
  });
});

describe('one header grammar for every role', () => {
  it('every role Stack uses the shared options; tab bars spread the same header', () => {
    for (const role of ['worker', 'client', 'admin']) {
      const layout = code(`src/app/(${role})/_layout.tsx`);
      expect(layout, role).toContain('screenOptions={APP_STACK_SCREEN_OPTIONS}');
      expect(code(`src/app/(${role})/(tabs)/_layout.tsx`), role).toContain('useAppTabScreenOptions()');
    }
    const { APP_HEADER_OPTIONS, APP_STACK_SCREEN_OPTIONS } = load('src/components/app-header-options.ts') as Record<string, Props>;
    expect(APP_HEADER_OPTIONS.headerTitleAlign).toBe('center');
    expect(APP_HEADER_OPTIONS.headerShadowVisible).toBe(false);
    expect(APP_HEADER_OPTIONS.headerTitleStyle).toEqual({ fontFamily: 'sans-serif', fontSize: 18, fontWeight: '700' });
    expect(APP_STACK_SCREEN_OPTIONS).toMatchObject({ ...APP_HEADER_OPTIONS, statusBarStyle: 'dark' });
  });
  it('the notification bell renders only from the Home header, and no tab layout adds a header action', () => {
    expect(sources.filter((file) => /<NotificationBell\b/.test(code(file)))).toEqual(['src/components/home-header.tsx']);
    for (const role of ['worker', 'client', 'admin']) expect(code(`src/app/(${role})/(tabs)/_layout.tsx`)).not.toMatch(/headerRight|headerLeft/);
  });
  it('no authenticated screen repeats the SkillMatch logo or name in its header', () => {
    expect(sources.filter((file) => /skillmatch-logo\.png/.test(code(file)))).toEqual(['src/components/auth-screen.tsx']);
  });
});

describe('sentence case, 48dp targets and system notification sound', () => {
  it('every navigator title is sentence case (acronyms and the product name excepted)', () => {
    const titles = sources.filter((file) => file.startsWith('src/app/')).flatMap((file) => [...code(file).matchAll(/title: '([^']+)'/g)].map((match) => match[1]));
    expect(titles.length).toBeGreaterThan(15);
    const words = (title: string) => title.replace(/\b(ID|FAQ|QR Ph|SkillMatch)\b/g, '').split(/\s+/).slice(1);
    for (const title of titles) expect(words(title).filter((word) => /^[A-Z]/.test(word)), title).toEqual([]);
  });
  it('no control keeps a sub-48dp target', () => {
    expect(sources.filter((file) => /(minHeight|height|width): 44\b/.test(code(file)))).toEqual([]);
  });
  it('keeps the system-default notification sound (no sound key)', () => {
    expect(sources.filter((file) => /sound:\s*'default'/.test(code(file)))).toEqual([]);
  });
  it('notices are one family: the ID review info notice uses AppNotice, and AppCard has no variants', () => {
    expect(code('src/components/app-notice.tsx')).toContain("export type AppNoticeVariant = 'info' | 'warning' | 'danger' | 'success';");
    expect(code('src/app/(admin)/admin/verification-details.tsx')).not.toContain('AppCard');
    expect(code('src/components/app-card.tsx')).not.toMatch(/variant|tone|botanical/);
  });
});
