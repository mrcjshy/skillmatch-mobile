// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
const rows = [
  { id: 'unread', type: 'booking_request', message: 'First message', is_read: false, created_at: null },
  { id: 'read', type: 'booking_confirmed', message: 'Second message', is_read: true, created_at: null },
];
function inbox({ open = true, marking = null as string | null, refreshing = false, loadError = null as string | null, rpcError = null as Props | null, rereadError = null as Props | null, dated = false } = {}) {
  const fixtureRows = dated ? rows.map(row => ({ ...row, created_at: '2026-09-30T07:00:00.000Z' })) : rows;
  const calls: any[] = [];
  const state: any[] = [false, refreshing, loadError, fixtureRows, marking, null];
  let cursor = 0;
  const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s },
    Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'ActivityIndicator' };
  const jsx = (type: any, props: Props, key?: string) => ({ type, props, key });
  const load = (file: string, modules: Props = {}) => {
    const exports: Props = {};
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, console: { warn() {} }, require: (name: string) => { if (name === '@/components/refinement-theme') return { useUiTheme: () => modules['@/constants/theme'].SkillMatchTheme.ui };  if (!(name in modules)) throw Error(name); return modules[name]; } });
    return exports;
  };
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const modules = { 'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@/constants/theme': theme };
  const notifications = load('src/lib/notifications.ts', { './date-time': load('src/lib/date-time.ts') });
  const callback = (n: Props) => calls.push(['open', n]);
  const { default: NotificationList } = load('src/components/notification-list.tsx', { ...modules,
    react: { useCallback: (f: any) => f, useEffect() {}, useState: () => { const i = cursor++; return [state[i], (v: any) => { state[i] = v; }]; } },
    '@/lib/notifications': notifications,
    '@/lib/realtime': { NOTIFICATION_INSERTED: 'inserted', subscribeInvalidation() {}, userNotificationsTopic() {} },
    '@/providers/account-provider': { useAccount: () => ({ account: { id: 'caller' } }) },
    '@/lib/supabase': { supabase: {
      rpc: async (name: string, args: Props) => { calls.push(['rpc', name, args]); return { error: rpcError }; },
      from: (table: string) => ({ select: (columns: string) => ({ order: async (column: string, options: Props) => {
        calls.push(['read', table, columns, column, options]); return { data: fixtureRows, error: rereadError };
      } }) }),
    } },
    '@/components/app-divider': { AppDivider: 'AppDivider' },
    ...Object.fromEntries(['app-button', 'app-notice', 'inline-status'].map(n => ['@/components/' + n,
      { [n.split('-').map(x => x[0].toUpperCase()+x.slice(1)).join('')]: n }])),
  });
  const render = () => { cursor = 0; return NotificationList({ onNotificationPress: open ? callback : undefined }); };
  return { tree: render(), calls, state, render, fixtureRows, notifications };
}
function all(tree: any, kind: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(x => all(x, kind));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children, kind)];
}
/** The row a Pressable presents in a given pressed state: its resolved style plus its content. */
function card(_h: ReturnType<typeof inbox>, button: any, pressed: boolean) {
  const style = typeof button.props.style === 'function' ? button.props.style({ pressed }) : button.props.style;
  return { type: 'View', props: { style, children: button.props.children } };
}
/** Static (non-pressable) rows share the row style; identify them by its geometry. */
const isStaticRow = (node: any) => node.type === 'View' && flat(node.props.style).minHeight === 56 && flat(node.props.style).paddingHorizontal === 16;
it('gives interactive rows 56/48 minima and visible composed pressed feedback without opacity', () => {
  const h = inbox();
  const buttons = all(h.tree, 'Pressable');
  expect(buttons).toHaveLength(2);
  for (const b of buttons) {
    const target = flat(typeof b.props.style === 'function' ? b.props.style({ pressed: false }) : b.props.style);
    expect(target.minHeight).toBeGreaterThanOrEqual(48);
    expect(target.minWidth).toBeGreaterThanOrEqual(48);
    const rest = flat(card(h,b,false).props.style), pressed = flat(card(h,b,true).props.style);
    expect(pressed.backgroundColor).not.toBe(rest.backgroundColor);
    expect(pressed.opacity).toBeUndefined();
    expect(flat(card(h,b,false).props.style)).toEqual(rest);
  }
});
it('preserves label/order/eligibility and static read rows without an activation callback', () => {
  const h = inbox({ open: false });
  const buttons = all(h.tree,'Pressable');
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.accessibilityLabel).toBe('Booking request, unread. First message');
  expect(buttons[0].props.accessibilityRole).toBe('button');
  const active = inbox();
  expect(all(active.tree,'Pressable').map(x => x.props.accessibilityLabel)).toEqual(['Booking request, unread. First message', 'Booking confirmed. Second message']);
});
for (const opts of [{ marking: 'unread' }, { refreshing: true }]) it(`keeps busy suppression and neutral readable composed states ${JSON.stringify(opts)}`, async () => {
  const h = inbox(opts);
  for (const b of all(h.tree,'Pressable')) {
    expect(b.props.disabled).toBe(true);
    expect(b.props.accessibilityState.disabled).toBe(true);
    await b.props.onPress();
    for (const pressed of [false,true]) {
      const s = flat(card(h,b,pressed).props.style);
      expect(s.backgroundColor).toBe('#EFEEEA');
      expect(s.opacity).toBeUndefined();
    }
  }
  expect(h.calls).toEqual([]);
});
it('keeps unread RPC then authoritative reread then exact callback; read opens without writes', async () => {
  const h = inbox();
  const buttons = all(h.tree,'Pressable');
  await buttons[0].props.onPress();
  await new Promise(resolve => setTimeout(resolve,0));
  expect(h.calls).toEqual([
    ['rpc','mark_my_notification_read',{ p_notification_id: 'unread' }],
    ['read','notifications','id, type, message, is_read, created_at','created_at',{ ascending: false, nullsFirst: false }],
    ['open',rows[0]],
  ]);
  expect(h.state[4]).toBeNull();
  h.calls.length=0;
  await buttons[1].props.onPress();
  expect(h.calls).toEqual([['open',rows[1]]]);
});
for (const opts of [{ rpcError: { code: '42501', message: 'Forbidden' } }, { rereadError: { code: 'unknown', message: 'Failed' } }]) it(`preserves failure notices and caller activation sequencing ${JSON.stringify(opts)}`, async () => {
  const h = inbox(opts);
  all(h.tree,'Pressable')[0].props.onPress();
  await new Promise(resolve => setTimeout(resolve,0));
  expect(h.calls[0][0]).toBe('rpc');
  expect(h.calls.at(-1)).toEqual(['open',rows[0]]);
  expect(h.state[5].tone).toBe('warning');
  expect(h.state[4]).toBeNull();
});
it('checks real composed text contrast in every state', () => {
  const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const ratio = (a: string,b: string) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  for (const opts of [{}, { marking: 'unread' }]) {
    const h = inbox(opts);
    for (const b of all(h.tree,'Pressable')) for (const pressed of [false,true]) {
      const c = card(h,b,pressed), s = flat(c.props.style), background = s.backgroundColor ?? '#FFFFFF';
      for (const text of all(c,'Text')) {
        const color=flat(text.props.style).color;
        expect(ratio(color,background)).toBeGreaterThanOrEqual(4.5);
        console.log('Notification contrast', color,background,ratio(color,background));
      }
    }
  }
});


// Inspect the rendered ancestry: nested AppChip surfaces override the AppCard fill.
function observedText(tree: any, background = '#FFFFFF', opacity = 1): Props[] {
  if (Array.isArray(tree)) return tree.flatMap(node => observedText(node, background, opacity));
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return observedText(tree.type(tree.props), background, opacity);
  const style = flat(tree.props.style);
  const surface = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : background;
  const effectiveOpacity = opacity * (style.opacity ?? 1);
  if (tree.type === 'Text') return [{ text: tree.props.children, foreground: style.color, background: surface, opacity: effectiveOpacity }];
  return observedText(tree.props.children, surface, effectiveOpacity);
}
const luminance = (color: string) => color.slice(1).match(/../g)!.map(value => parseInt(value,16)/255)
  .map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4)
  .reduce((sum,value,index) => sum + value*[.2126,.7152,.0722][index],0);
const contrast = (a: string,b: string) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

it('renders a real dated timestamp with readable unread pressed contrast and restores resting feedback', () => {
  const h = inbox({ dated: true });
  const buttons = all(h.tree, 'Pressable');
  expect(buttons.map(button => button.props.accessibilityLabel)).toEqual([
    'Booking request, unread. First message', 'Booking confirmed. Second message',
  ]);
  expect(buttons.map(button => button.props.disabled)).toEqual([false,false]);
  const expected = h.notifications.formatTimestamp(h.fixtureRows[0].created_at);
  expect(typeof expected).toBe('string');
  expect(expected.length).toBeGreaterThan(0);
  const resting = card(h,buttons[0],false), pressed = card(h,buttons[0],true);
  expect(flat(pressed.props.style).backgroundColor).not.toBe(flat(resting.props.style).backgroundColor);
  expect(flat(card(h,buttons[0],false).props.style)).toEqual(flat(resting.props.style));
  const timestamp = observedText(pressed).filter(node => node.text === expected);
  expect(timestamp).toHaveLength(1);
  expect(timestamp[0].foreground).toBe('#59606B');
  expect(timestamp[0].opacity).toBe(1);
  const ratio = contrast(timestamp[0].foreground,timestamp[0].background);
  console.log('Dated timestamp composed contrast', JSON.stringify({ ...timestamp[0], ratio }));
  expect(ratio, 'enabled unread pressed timestamp requires 4.5:1').toBeGreaterThanOrEqual(4.5);
});

it('keeps all dated and missing-date row text readable across interactive, static, disabled and marking states', () => {
  for (const dated of [true,false]) for (const opts of [{}, { open: false }, { refreshing: true }, { marking: 'unread' }]) {
    const h = inbox({ ...opts, dated });
    const buttons = all(h.tree,'Pressable');
    const states = buttons.flatMap(button => [false,true].map(pressed => ({ tree: card(h,button,pressed), pressed })));
    states.push(...all(h.tree,'View').filter(isStaticRow).map(node => ({ tree: node, pressed: false })));
    expect(states).toHaveLength(opts.open === false ? 3 : 4);
    for (const { tree, pressed } of states) {
      const texts = observedText(tree);
      const unread = texts.some(node => node.text === 'Unread');
      const row = h.fixtureRows[unread ? 0 : 1];
      expect(texts.some(node => node.text === h.notifications.formatNotificationLabel(row.type))).toBe(true);
      expect(texts.some(node => node.text === row.message)).toBe(true);
      const formatted = h.notifications.formatTimestamp(row.created_at);
      if (dated) {
        expect(formatted?.length).toBeGreaterThan(0);
        expect(texts.filter(node => node.text === formatted)).toHaveLength(1);
      } else {
        expect(formatted).toBeNull();
        expect(texts).toHaveLength(unread ? 4 : opts.open === false ? 2 : 3);
      }
      const marking = opts.marking === row.id;
      const hint = marking ? 'Marking as read…' : unread ? opts.open === false ? 'Tap to mark as read' : 'Tap to mark as read and open' : opts.open === false ? null : 'Tap to open';
      if (hint) expect(texts.some(node => node.text === hint)).toBe(true);
      if (unread) expect(texts.find(node => node.text === 'Unread')?.background).toBe(texts.find(node => node.text === h.notifications.formatNotificationLabel(row.type))?.background);
      for (const text of texts) {
        expect(text.opacity).toBe(1);
        expect(text.foreground).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(text.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
        const ratio = contrast(text.foreground,text.background);
        console.log('Row state composed contrast', JSON.stringify({ dated, ...opts, pressed, ...text, ratio }));
        expect(ratio, String(text.text)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

it('groups rows into one hairline surface with a divider between rows, never nested cards', () => {
  const h = inbox();
  const group = all(h.tree, 'View').find(node => flat(node.props.style).overflow === 'hidden')!;
  const style = flat(group.props.style);
  expect(style).toMatchObject({ backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' });
  expect(all(group, 'AppDivider')).toHaveLength(1);
  expect(all(group, 'Pressable')).toHaveLength(2);
});

it('marks unread rows with an accent fill, a dot and the word, never colour alone', () => {
  const h = inbox();
  const [unread, read] = all(h.tree, 'Pressable');
  expect(flat(card(h, unread, false).props.style).backgroundColor).toBe('#E9EEFC');
  expect(flat(card(h, unread, true).props.style).backgroundColor).toBe('#DCE4FA');
  expect(flat(card(h, read, false).props.style).backgroundColor).toBeUndefined();
  expect(all(unread, 'Text').some(node => node.props.children === 'Unread')).toBe(true);
  expect(all(read, 'Text').some(node => node.props.children === 'Unread')).toBe(false);
  expect(all(unread, 'View').some(node => flat(node.props.style).width === 8 && flat(node.props.style).height === 8)).toBe(true);
});
