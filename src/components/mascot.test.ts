// @ts-expect-error -- Node-only static composition harness.
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * M6 mascot guard. The mascot is static, decorative artwork on exactly two approved surfaces:
 * Worker Home's empty result and Client Post Job success (M6B removed it from Worker Job Accepted;
 * it must not return there). This proves
 * the assets, the component contract and the placement allowlist. It does not prove native
 * rendering; TesterArmy covers runtime.
 */
type Props = Record<string, any>;
type Element = { type: unknown; props: Props };
const source = (path: string): string => readFileSync(path, 'utf8');
const node = (type: unknown, props: Props): Element => ({ type, props });
const RN = { StyleSheet: { create: (x: Props) => x }, View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator' };
const theme = compile('src/constants/theme.ts', { 'react-native': { Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } } }).SkillMatchTheme.ui;

function compile(path: string, seams: Record<string, Props>): Props {
  const exports: Props = {};
  const requireSeam = (id: string): Props => {
    if (id in seams) return seams[id];
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node, Fragment: 'Fragment' };
    if (id === '@/global.css') return {};
    if (id.startsWith('@/assets/images/mascot/')) return { asset: id };
    throw new Error('Unapproved import: ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(requireSeam, exports);
  return exports;
}
function all(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(all);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return [value as Element, ...all((value as Element).props.children)];
}
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory(): boolean }) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const ASSET_DIR = 'assets/images/mascot';
const RETIRED_NAMES = /lapat|dugtong|tagpo/i;
const APPROVED_PLACEMENTS = [
  'src/app/(worker)/(tabs)/worker/index.tsx',
  'src/components/client-post-job-screen.tsx',
];

describe('M6 mascot assets', () => {
  const files = readdirSync(ASSET_DIR).sort();

  it('are exactly the approved static poses, with neutral names', () => {
    expect(files).toEqual(['mascot-empty.svg', 'mascot-success.svg']);
  });

  it('keep the M5 construction geometry unchanged and use Iteration 06 colour tokens only', () => {
    const allowed = new Set([theme.colors.accent, theme.colors.accentSubtle, theme.colors.textPrimary, theme.colors.surface, theme.colors.controlBorder]
      .map((hex: string) => hex.toUpperCase()));
    for (const file of files) {
      const svg = source(`${ASSET_DIR}/${file}`);
      const colours = [...svg.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
      expect(colours.length, file).toBeGreaterThan(0);
      for (const colour of colours) expect(allowed, `${file} ${colour}`).toContain(colour);
      expect(svg, file).not.toMatch(/gradient|filter|<image|<style|<script|<animate|<set\b/i);
      const m5 = source(`src/components/__fixtures__/mascot/${file.replace('mascot-', '')}`);
      const body = (svg: string) => svg.replace(/<!--.*?-->/gs, '').replace(/^<svg[^>]*>/, '').trim();
      expect(body(svg), file).toBe(body(m5));
    }
  });

  it('carry no mascot name, label or title', () => {
    for (const file of files) {
      const svg = source(`${ASSET_DIR}/${file}`);
      expect(svg, file).not.toMatch(RETIRED_NAMES);
      expect(svg, file).not.toMatch(/aria-|role=|<title|<desc|<text/i);
    }
  });
});

describe('M6 mascot component', () => {
  const module = compile('src/components/skillmatch-mascot.tsx', {
    'react-native': RN,
    'expo-image': { Image: 'Image' },
  });

  it('draws the full figure at the approved 64 dp minimum, in the 260 x 200 artboard proportion', () => {
    expect(module.MASCOT_HEIGHT).toBeGreaterThanOrEqual(64);
    for (const pose of ['empty', 'success']) {
      const tree = module.SkillMatchMascot({ pose });
      const image = all(tree).find((n) => n.type === 'Image')!;
      expect(image.props.source).toEqual({ asset: `@/assets/images/mascot/mascot-${pose}.svg` });
      expect(image.props.contentFit).toBe('contain');
      const style = Object.assign({}, ...[image.props.style].flat());
      expect(style.height).toBe(module.MASCOT_HEIGHT);
      expect(style.width / style.height).toBeCloseTo(260 / 200, 5);
    }
  });

  it('stays out of the accessibility tree and never names itself', () => {
    const tree = module.SkillMatchMascot({ pose: 'success' });
    expect(tree.props.accessible).toBe(false);
    expect(tree.props.accessibilityElementsHidden).toBe(true);
    expect(tree.props.importantForAccessibility).toBe('no-hide-descendants');
    for (const element of all(tree)) {
      expect(element.props.accessibilityLabel).toBeUndefined();
      expect(element.props.accessibilityRole).toBeUndefined();
    }
    expect(source('src/components/skillmatch-mascot.tsx')).not.toMatch(RETIRED_NAMES);
  });

  it('is static: no motion primitive, Reanimated, timer or entrance animation', () => {
    const file = source('src/components/skillmatch-mascot.tsx');
    expect(file).not.toMatch(/@\/components\/motion|react-native-reanimated|Animated|entering|exiting|transition|setInterval|setTimeout|requestAnimationFrame/);
  });
});

describe('M6 mascot placements', () => {
  it('only the two approved surfaces import the mascot', () => {
    const importers = sourceFiles('src').filter((file) => /@\/components\/skillmatch-mascot/.test(source(file)));
    expect(importers.sort()).toEqual([...APPROVED_PLACEMENTS].sort());
  });

  it('no user-facing mascot name anywhere in the app source', () => {
    for (const file of sourceFiles('src')) expect(source(file), file).not.toMatch(RETIRED_NAMES);
  });

  it('Worker Home: the Empty pose is the empty result only; busy, loading and error stay as they were', () => {
    const home = source(APPROVED_PLACEMENTS[0]);
    expect(home.match(/<SkillMatchMascot/g)).toHaveLength(1);
    expect(home).toContain('<InlineStatus variant="empty" message="No matching jobs right now." illustration={<SkillMatchMascot pose="empty" />} />');
    for (const line of home.split('\n').filter((l) => /variant="(note|loading|error)"/.test(l))) expect(line).not.toContain('illustration');
  });

  it('InlineStatus: an empty-state illustration takes the glyph tile\'s place; every other use is unchanged', () => {
    const { InlineStatus } = compile('src/components/inline-status.tsx', {
      'react-native': RN,
      'expo-symbols': {},
      '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
      '@/components/refinement-theme': { useUiTheme: () => theme },
    });
    const art = node('Mascot', {});
    const withArt = all(InlineStatus({ variant: 'empty', message: 'No matching jobs right now.', illustration: art }));
    expect(withArt).toContain(art);
    expect(withArt.some((n) => n.type === 'AppSymbol')).toBe(false);
    const message = withArt.find((n) => n.type === 'Text')!;
    expect(message.props.children).toBe('No matching jobs right now.');
    expect(message.props.accessibilityRole).toBeUndefined();
    const plain = all(InlineStatus({ variant: 'empty', message: 'Nothing here.' }));
    expect(plain.some((n) => n.type === 'AppSymbol')).toBe(true);
    for (const variant of ['note', 'loading', 'error']) {
      expect(all(InlineStatus({ variant, message: 'x', illustration: art }))).not.toContain(art);
    }
  });

  it('Job accepted (M6B rollback): no mascot; the existing check reveal, words and action exactly as before M6', () => {
    const details = source('src/components/job-opportunity-details.tsx');
    expect(details).not.toMatch(/skillmatch-mascot|SkillMatchMascot|successArt/);
    const accepted = details.slice(details.indexOf('if (accepted) {'), details.indexOf('if (isLoading) {'));
    expect(accepted).toMatch(/<View style=\{styles\.center\}>\s+<MotionView entering=\{motion\.successEnter\} style=\{styles\.successMark\}/);
    expect(accepted).toContain('<InlineStatus variant="note" headline={notice?.headline ?? ACCEPT_JOB_COPY.accepted}');
    expect(accepted).toContain('message={notice?.detail ?? ACCEPT_JOB_COPY.accepted} />');
    expect(accepted).toMatch(/<AppButton label="View bookings" variant="secondary"\s+onPress=\{\(\) => router\.replace\('\/worker\/bookings' as Href\)\} \/>/);
  });

  it('Client Post Job: the unchanged success words come first, the Success pose follows; never beside a post error', () => {
    const screen = source(APPROVED_PLACEMENTS[1]);
    expect(screen.match(/<SkillMatchMascot/g)).toHaveLength(1);
    const success = screen.slice(screen.indexOf('{postSuccess ?'), screen.indexOf('{isLoading ? ('));
    expect(success.indexOf('{postSuccess}</Text>')).toBeGreaterThan(-1);
    expect(success.indexOf('{postSuccess}</Text>')).toBeLessThan(success.indexOf('<SkillMatchMascot pose="success" />'));
    expect(success).toContain('{postError ? null : <SkillMatchMascot pose="success" />}');
  });
});
