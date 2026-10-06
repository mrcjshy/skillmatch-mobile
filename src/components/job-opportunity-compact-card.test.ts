// @ts-expect-error -- Node-only source/prop harness, not native layout evidence.
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import path from 'node:path';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s, hairlineWidth: 1 }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
const jsx = (type: any, props: Props) => typeof type === 'function' ? type(props) : ({ type, props });
const cache: Props = {};
function load(file: string): Props {
  file = path.resolve(file);
  if (cache[file]) return cache[file];
  const exports: Props = {}; cache[file] = exports;
  const require = (name: string): any => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => load('src/constants/theme.ts').SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
    if (name === 'react-native') return native;
    if (name === 'expo-symbols') return { SymbolView: 'SymbolView' };
      if (name === '@/components/app-symbol') return { AppSymbol: 'SymbolView' };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/global.css') return {};
    if (name.endsWith('/supabase')) return { supabase: new Proxy({}, { get() { throw Error('No provider/database access permitted'); } }) };
    const stem = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
    const target = [stem + '.ts', stem + '.tsx'].find(existsSync);
    if (!target) throw Error('Unexpected boundary: ' + name);
    return load(target);
  };
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, Intl, Date, console });
  return exports;
}
const theme = load('src/constants/theme.ts');
const colors = theme.SkillMatchTheme.ui.colors;
function all(tree: any, kind: string): any[] {
  if (Array.isArray(tree)) return tree.flatMap(x => all(x, kind));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children, kind)];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props.children) : String(tree);
}
function callerSurface(role: string): string {
  const source = readFileSync('src/app/(' + role + ')/(tabs)/' + role + '/index.tsx', 'utf8');
  const exports: Props = {};
  runInNewContext(ts.transpileModule((source.includes('function createStyles') ? source.slice(source.lastIndexOf('function createStyles')) + '\nconst result = createStyles(ui); const styles = result.styles ?? result;' : source.slice(source.lastIndexOf('const styles = StyleSheet.create('))) + '\nexports.styles = styles;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, StyleSheet: native.StyleSheet, ui: theme.SkillMatchTheme.ui, ...theme.SkillMatchTheme.ui });
  return flat(exports.styles.scroll).backgroundColor;
}

function contrast(tree: any, pressed: boolean, parent: string, opacity = 1): void {
  if (Array.isArray(tree)) { tree.forEach(x => contrast(x, pressed, parent, opacity)); return; }
  if (!tree || typeof tree !== 'object') return;
  const style = flat(typeof tree.props.style === 'function' ? tree.props.style({ pressed }) : tree.props.style);
  const alpha = opacity * (style.opacity ?? 1), background = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : parent;
  expect(alpha).toBe(1); // Card and nested chip ancestry must never fade their text.
  if (tree.type === 'Text') {
    const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((a,x,i) => a+x*[.2126,.7152,.0722][i],0);
    const a=lum(style.color), b=lum(background), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    if (style.fontSize === 12) expect(ratio).toBeGreaterThanOrEqual(3); // Essential status/skill indicator.
    console.log('Composed contrast', text(tree), style.color, background, ratio, 'ancestor opacity', alpha);
  }
  contrast(tree.props.children, pressed, background, alpha);
}
const timestamp = '2026-09-30T07:00:00.000Z';

const { JobOpportunityCompactCard } = load('src/components/job-opportunity-compact-card.tsx');
const { compactOpportunityFields, previewOpportunityDescription, parseJobOpportunityRows } = load('src/lib/job-opportunities.ts');
const title = 'Pagkukumpuni ng bubong at paglalagay ng ligtas na kable para sa tahanan nina Maria Ysabel dela Cruz';
const description = '  Kailangan ng masusing serbisyo sa pagkukumpuni ng malaking tahanan, paglilinis ng bubong at pagsusuri ng mga linya ng kuryente para sa kaligtasan ng buong pamilya. '.repeat(3);
const skill = 'Pagkukumpuni ng bubong at masusing elektrikal na serbisyo';
const opportunity = { job_id:'job-opportunity-1', title, description, barangay:'Barangay San Isidro Labrador na may mahabang pangalan', city:'Santa Ana Pampanga', budget:987654321.75, scheduled_at:timestamp, skill_points:50, location_points:30, rating_points:12.5, total_points:92.5, payment_method:'cod' };
it('preserves full formatter output and callback in a wrapping row that reads title, skill, area, schedule, budget, match', () => {
  let calls=0; const onPress=()=>{calls++;};
  const tree=JobOpportunityCompactCard({ opportunity, primarySkillName:skill, onPress });
  expect(tree.type).toBe('Pressable');
  expect(tree.props.onPress).toBe(onPress); tree.props.onPress(); expect(calls).toBe(1); expect(tree.props.accessibilityRole).toBe('button');
  expect(tree.props.accessibilityLabel).toBe(title + ', Match Score: 92.5/100. View job opportunity details');
  const fields=compactOpportunityFields(opportunity,skill);
  expect(fields.schedule).toBeTruthy(); expect(fields.descriptionPreview).toBe(previewOpportunityDescription(description));
  for (const value of [title, skill, description.trim(), fields.schedule, 'Barangay San Isidro Labrador na may mahabang pangalan, Santa Ana Pampanga', '₱987,654,321.75', 'Match Score: 92.5/100']) expect(text(tree)).toContain(value);
  const copy = text(tree);
  const order = [title, skill, 'Barangay San Isidro', fields.schedule, '₱987,654,321.75', 'Match Score: 92.5/100'].map((value: string) => copy.indexOf(value));
  expect(order).toEqual([...order].sort((a, b) => a - b)); expect(order.every((i: number) => i >= 0)).toBe(true);
  for(const label of all(tree,'Text')) { expect(label.props.numberOfLines).toBeUndefined(); expect(label.props.ellipsizeMode).toBeUndefined(); expect(flat(label.props.style).height).toBeUndefined(); }
  const row = flat(tree.props.style({ pressed: false }));
  expect(row).toMatchObject({ flexDirection: 'row', maxWidth: '100%' }); expect(row.minHeight).toBeGreaterThanOrEqual(56);
  expect(all(tree,'View').some(x => flat(x.props.style).flex === 1 && flat(x.props.style).minWidth === 0)).toBe(true);
  for(const label of all(tree,'Text').filter((x:any)=>text(x)===title||text(x)===fields.area||text(x)===fields.descriptionPreview)) { expect(flat(label.props.style).maxWidth).toBe('100%'); expect(flat(label.props.style).flexShrink).toBe(1); }
  expect(all(tree,'Pressable')).toHaveLength(1);
});

it('has no coloured side border; contrasting resting/pressed/released surfaces and one skill line, never a pill', () => {
  for(const primarySkillName of [skill,null,undefined]) {
    const tree=JobOpportunityCompactCard({ opportunity,primarySkillName,onPress(){} });
    const rest=flat(tree.props.style({pressed:false})),pressed=flat(tree.props.style({pressed:true}));
    expect(rest.backgroundColor).toBe(colors.surface); expect(pressed.backgroundColor).toBe(colors.surfaceSunken); expect(pressed.opacity).toBeUndefined(); expect(flat(tree.props.style({pressed:false}))).toEqual(rest);
    // Banned pattern: a coloured left border above 1px. The group edge is a hairline.
    expect(rest.borderLeftWidth).toBe(1); expect(rest.borderLeftColor ?? rest.borderColor).toBe(colors.hairline);
    expect(all(tree,'View').filter((x:any)=>flat(x.props.style).minHeight===28)).toHaveLength(0);
    const skillText = all(tree,'Text').find((x:any)=>text(x)===skill);
    expect(Boolean(skillText)).toBe(Boolean(primarySkillName));
    if (skillText) expect(flat(skillText.props.style).color).toBe(colors.accent);
    contrast(tree,false,callerSurface('worker')); contrast(tree,true,callerSurface('worker'));
  }
});
it('preserves server order and separate missing optional-data cases without inventing fields or modes', () => {
  const rows=parseJobOpportunityRows([opportunity,{...opportunity,job_id:'second',total_points:1}]); expect(rows.map((x:Props)=>x.job_id)).toEqual(['job-opportunity-1','second']);
  for(const primarySkillName of [null,undefined,'   ']) {
    const tree=JobOpportunityCompactCard({opportunity:{...opportunity,description:null,barangay:null,city:null,budget:null,scheduled_at:null},primarySkillName,onPress(){}});
    expect(text(tree)).toBe(title+'Match Score: 92.5/100'); expect(tree.props.disabled).toBeUndefined(); expect(tree.props.accessibilityState).toBeUndefined();
  }
  const blank=JobOpportunityCompactCard({opportunity:{...opportunity,description:'   '},primarySkillName:'   ',onPress(){}}); expect(text(blank)).not.toContain(description.trim());
});

it('lists every Home opportunity as a compact row on Home itself, with no overlay and no truncated preview', () => {
    const source = readFileSync('src/app/(worker)/(tabs)/worker/index.tsx', 'utf8');
    expect(source).not.toContain('FindWorkOverlay');
    expect(source).not.toMatch(/<Modal|AppSheet/);
    expect(source).not.toContain('opportunities.slice');
    expect(source).toMatch(/<JobOpportunityCompactCard\s+compact/);
  });
