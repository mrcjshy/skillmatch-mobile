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
      { exports, console: { warn() {} }, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
    return exports;
  };
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const modules = { 'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@/constants/theme': theme };
  const { AppCard } = load('src/components/app-card.tsx', modules);
  const { AppChip } = load('src/components/app-chip.tsx', modules);
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
    '@/components/app-card': { AppCard },
    '@/components/app-chip': { AppChip },
    ...Object.fromEntries(['app-button', 'app-notice', 'inline-status'].map(n => ['@/components/' + n,
      { [n.split('-').map(x => x[0].toUpperCase()+x.slice(1)).join('')]: n }])),
  });
  const render = () => { cursor = 0; return NotificationList({ onNotificationPress: open ? callback : undefined }); };
  return { tree: render(), calls, state, render, AppCard, fixtureRows, notifications };
}
function all(tree: any, kind: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(x => all(x, kind));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children, kind)];
}
function card(h: ReturnType<typeof inbox>, button: any, pressed: boolean) {
  const child = typeof button.props.children === 'function' ? button.props.children({ pressed }) : button.props.children;
  return h.AppCard(child.props);
}
it('gives interactive rows 48 minima and visible composed pressed feedback without opacity', () => {
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
    expect(rest.borderColor).toBe('#737A70');
    expect(rest.borderWidth).toBeGreaterThanOrEqual(1.5);
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
      expect(s.backgroundColor).toBe('#F4F4EC');
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
it('checks real composed text and essential-boundary contrast in every state', () => {
  const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const ratio = (a: string,b: string) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  for (const opts of [{}, { marking: 'unread' }]) {
    const h = inbox(opts);
    for (const b of all(h.tree,'Pressable')) for (const pressed of [false,true]) {
      const c = card(h,b,pressed), s = flat(c.props.style);
      expect(ratio(s.borderColor,s.backgroundColor)).toBeGreaterThanOrEqual(3);
      for (const text of all(c,'Text')) {
        const color=flat(text.props.style).color;
        expect(ratio(color,s.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        console.log('Notification contrast', color,s.backgroundColor,ratio(color,s.backgroundColor));
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
  expect(timestamp[0].foreground).toBe('#5F6360');
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
    states.push(...all(h.tree,h.AppCard).map(node => ({ tree: h.AppCard(node.props), pressed: false })));
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
      if (unread) expect(texts.find(node => node.text === 'Unread')?.background).toBe('#F4F4EC');
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
