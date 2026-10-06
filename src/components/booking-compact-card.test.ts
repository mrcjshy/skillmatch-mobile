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
function callerStyles(file: string): Props {
  const source=readFileSync(file,'utf8'), exports:Props={};
  runInNewContext(ts.transpileModule((source.includes('function createStyles') ? source.slice(source.lastIndexOf('function createStyles')) + '\nconst result = createStyles(ui); const styles = result.styles ?? result;' : source.slice(source.lastIndexOf('const styles = StyleSheet.create(')))+'\nexports.styles = styles;', {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports,StyleSheet:native.StyleSheet,ui: theme.SkillMatchTheme.ui, ...theme.SkillMatchTheme.ui});
  return exports.styles;
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

const { BookingCompactCard } = load('src/components/booking-compact-card.tsx');
const { formatTimestamp } = load('src/lib/bookings.ts');
const longName = 'Maria Ysabel dela Cruz Villanueva de los Santos';
const title = 'Pagkukumpuni at masusing paglilinis ng malaking bahay nina Mang Juan at Aling Maria';
const area = 'Barangay San Isidro Labrador na may mahabang pangalan, Santa Ana Pampanga';
function fixture(role: string, status = 'confirmed', changes: Props = {}): Props {
  return { booking_id: 'booking-1', job_id: 'job-1', booking_status: status, payment_status: 'unpaid', booked_at: timestamp, completed_at: null,
    job_title: title, job_description: 'Masusing pagkukumpuni ng bubong at paglilinis ng tahanan para sa malaking pamilya.', job_scheduled_at: timestamp,
    job_address: '123 Eksaktong Kalye na Dapat Hindi Makita', job_barangay: area.split(', ')[0], job_city: 'Santa Ana Pampanga', job_budget: 987654321.75,
    ...(role === 'worker' ? { client_user_id: 'client-1', client_full_name: longName, client_phone: 'private-phone' } : { worker_user_id: 'worker-1', worker_full_name: longName, worker_phone: 'private-phone', worker_barangay: 'private-area', worker_skills: ['Plumbing'], worker_is_verified: true, worker_rating_avg: 4.9, worker_rating_count: 20 }), ...changes };
}
it('retains full supplied summary text, real dates and callback in a wrapping row', () => {
  for (const role of ['worker', 'client']) {
    let calls = 0; const onPress = () => { calls++; };
    const tree = BookingCompactCard({ role, booking: fixture(role), onPress });
    expect(tree.type).toBe('Pressable');
    expect(tree.props.onPress).toBe(onPress); tree.props.onPress(); expect(calls).toBe(1);
    expect(tree.props.accessibilityRole).toBe('button');
    expect(tree.props.accessibilityLabel).toBe(title + ', Confirmed. View booking details');
    for (const value of [title, area, longName, '₱987,654,321.75', formatTimestamp(timestamp)]) { expect(value).toBeTruthy(); expect(text(tree)).toContain(value); }
    for (const label of all(tree, 'Text')) { expect(label.props.numberOfLines).toBeUndefined(); expect(label.props.ellipsizeMode).toBeUndefined(); expect(flat(label.props.style).height).toBeUndefined(); }
    const row = flat(tree.props.style({ pressed: false }));
    expect(row).toMatchObject({ flexDirection: 'row', maxWidth: '100%' }); expect(row.minHeight).toBeGreaterThanOrEqual(56);
    expect(all(tree, 'View').some(x => flat(x.props.style).flex === 1 && flat(x.props.style).minWidth === 0)).toBe(true);
    for (const label of all(tree, 'Text').filter((x: any) => text(x) === title || text(x) === area || text(x).includes(longName))) { expect(flat(label.props.style).maxWidth).toBe('100%'); expect(flat(label.props.style).flexShrink).toBe(1); }
    expect(all(tree, 'Pressable')).toHaveLength(1);
    // The date landmark is decorative: the full localized date stays in text.
    expect(all(tree, 'View').some(x => x.props.importantForAccessibility === 'no-hide-descendants')).toBe(true);
  }
});

it('shows every status as words on its semantic tint in one grouped surface, with contrasting press and release', () => {
  const cases = [['pending', 'Pending', colors.warning, colors.warningTint], ['confirmed', 'Confirmed', colors.info, colors.infoTint], ['completed', 'Completed', colors.success, colors.successTint], ['cancelled', 'Cancelled', colors.error, colors.errorTint], ['no_show', 'No show', colors.error, colors.errorTint]];
  for (const role of ['worker', 'client']) for (const [status, label, ink, tint] of cases) {
    const tree = BookingCompactCard({ role, booking: fixture(role, String(status)), onPress() {} });
    const statusText = all(tree, 'Text').find((x: any) => text(x) === label);
    expect(flat(statusText.props.style).color).toBe(ink);
    const chip = all(tree, 'View').find((x: any) => x.props.children === statusText); expect(flat(chip.props.style).backgroundColor).toBe(tint);
    expect(statusText.props.onPress).toBeUndefined(); expect(all(tree, 'Pressable')).toHaveLength(1);
    const rest = flat(tree.props.style({ pressed: false })), pressed = flat(tree.props.style({ pressed: true }));
    expect(rest.backgroundColor).toBe(colors.surface); expect(pressed.backgroundColor).toBe(colors.surfaceSunken);
    expect(pressed.opacity).toBeUndefined(); expect(flat(tree.props.style({ pressed: false }))).toEqual(rest);
    contrast(tree, false, callerSurface(role)); contrast(tree, true, callerSurface(role));
  }
});
it('places rows in a group: only rows round all corners, first/last round the outer pair, every row draws its own divider', () => {
  const row = (position: string) => flat(BookingCompactCard({ role: 'worker', booking: fixture('worker'), position, onPress() {} }).props.style({ pressed: false }));
  const only = row('only'), first = row('first'), middle = row('middle'), last = row('last');
  expect([only.borderTopLeftRadius, only.borderBottomLeftRadius]).toEqual([16, 16]);
  expect([first.borderTopLeftRadius, first.borderBottomLeftRadius]).toEqual([16, 0]);
  expect([middle.borderTopLeftRadius, middle.borderBottomLeftRadius]).toEqual([0, 0]);
  expect([last.borderTopLeftRadius, last.borderBottomLeftRadius]).toEqual([0, 16]);
  for (const r of [only, first, middle, last]) { expect(r.borderTopWidth).toBe(1); expect(r.borderColor).toBe(colors.hairline); }
  expect([first.borderBottomWidth, middle.borderBottomWidth, last.borderBottomWidth, only.borderBottomWidth]).toEqual([0, 0, 1, 1]);
});
it('releases only confirmed counterparty names for both roles and omits exact addresses and private extras', () => {
  for (const role of ['worker', 'client']) for (const status of ['pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'unexpected']) {
    const tree = BookingCompactCard({ role, booking: fixture(role, status), onPress() {} });
    expect(text(tree).includes(longName)).toBe(status === 'confirmed');
    expect(text(tree)).not.toContain('123 Eksaktong'); expect(text(tree)).not.toContain('private-phone'); expect(text(tree)).not.toContain('private-area');
    expect(text(tree)).toContain(status === 'unexpected' ? 'unexpected' : '');
  }
});
it('prefers completed dates, falls back to schedules, and keeps missing/null optional facts absent', () => {
  const completed = '2026-10-01T08:00:00.000Z';
  const dated = BookingCompactCard({ role: 'worker', booking: fixture('worker','completed',{ completed_at: completed }), onPress() {} });
  expect(formatTimestamp(completed)).toBeTruthy(); expect(text(dated)).toContain(formatTimestamp(completed)); expect(text(dated)).not.toContain(formatTimestamp(timestamp));
  const fallback = BookingCompactCard({ role: 'worker', booking: fixture('worker','completed'), onPress() {} }); expect(text(fallback)).toContain(formatTimestamp(timestamp));
  for (const role of ['worker','client']) {
    const absent = BookingCompactCard({ role, booking: fixture(role,'confirmed',{ completed_at:null, job_scheduled_at:null, job_budget:null, job_barangay:null, job_city:null, client_full_name:null, worker_full_name:null }), onPress() {} });
    expect(text(absent)).toBe(title + 'Confirmed');
  }
});

it('composes the actual active booking caller, trailing View all and immutable selection/order/callback arguments', () => {
  const { ActiveBookingHomeCard, pickPrimaryHomeBooking, homeConfirmedBookings }=load('src/components/active-booking-home-card.tsx');
  const { bookingsForSegment }=load('src/lib/booking-records.ts');
  for(const role of ['worker','client']) {
    const future=fixture(role,'confirmed',{booking_id:'future',job_scheduled_at:'2026-10-01T07:00:00.000Z'});
    const undated=fixture(role,'confirmed',{booking_id:'undated',job_scheduled_at:null});
    const winner=fixture(role,'confirmed',{booking_id:'winner'});
    const pending=fixture(role,'pending',{booking_id:'pending'});
    const completed=fixture(role,'completed',{booking_id:'completed'});
    const rows=[future,pending,undated,winner,completed], original=[...rows];
    expect(homeConfirmedBookings(rows)).toEqual([future,undated,winner]); expect(pickPrimaryHomeBooking(rows)).toBe(winner);
    expect(bookingsForSegment(rows,'active')).toEqual([future,pending,undated,winner]); expect(bookingsForSegment(rows,'history')).toEqual([completed]);
    const calls:any[]=[];let allCalls=0;
    const tree=ActiveBookingHomeCard({role,bookings:rows,onPressPrimary:(row:any)=>calls.push(row),onPressViewAll:()=>allCalls++});
    const buttons=all(tree,'Pressable'); expect(buttons).toHaveLength(2);
    const details=buttons.find((x:any)=>x.props.accessibilityLabel.includes('View booking details')); details.props.onPress(); expect(calls).toEqual([winner]); expect(calls[0]).toBe(winner);
    const viewAll=buttons.find((x:any)=>x.props.accessibilityLabel==='View all confirmed bookings'); viewAll.props.onPress();expect(allCalls).toBe(1);
    expect(text(tree)).toContain('+2 more'); expect(rows).toEqual(original);
    const screenStyles=callerStyles('src/app/('+role+')/(tabs)/'+role+'/index.tsx');
    const composed=jsx('View',{style:[screenStyles.scroll,{width:220}],children:tree});
    expect(flat(composed.props.style).width).toBe(220);
    const pad=all(tree,'View').find((x:any)=>x.props.children===details); expect(flat(pad.props.style).paddingHorizontal).toBe(20);
    contrast(composed,false,colors.canvas); contrast(composed,true,colors.canvas);
    const listStyles=callerStyles('src/components/my-bookings-list.tsx');expect(flat(listStyles.content).padding).toBe(20);
    const list=jsx('View',{style:[listStyles.scroll,{width:220}],children:jsx('View',{style:listStyles.content,children:details})});
    contrast(list,false,colors.canvas);contrast(list,true,colors.canvas);
  }
  const base=fixture('worker');
  const old={...base,booking_id:'z',booked_at:'2026-09-29T07:00:00.000Z'}, newer={...base,booking_id:'a'};
  expect(pickPrimaryHomeBooking([old,newer])).toBe(newer);
  const a={...base,booking_id:'a'},z={...base,booking_id:'z'};expect(pickPrimaryHomeBooking([a,z])).toBe(z);
  expect(ActiveBookingHomeCard({role:'worker',bookings:[fixture('worker','completed')],onPressPrimary(){}})).toBeNull();
});

it('uses one chip for every status so Home, lists and details agree, and the chip never takes presses', () => {
  const { AppChip } = load('src/components/app-chip.tsx'); const caller = { backgroundColor: colors.surface, marginTop: 7 };
  const chip = AppChip({ label: 'Confirmed', variant: 'info', style: caller }); expect(flat(chip.props.style).backgroundColor).toBe(colors.surface); expect(flat(chip.props.style).marginTop).toBe(7);
  contrast(chip, false, colors.canvas);
  // Wave 5: the mapping lives in one shared module used by the card, Booking details and Booking chat.
  const { bookingStatusVariant } = load('src/lib/status-presentation.ts');
  expect(['confirmed', 'completed', 'pending', 'cancelled', 'no_show', 'other'].map(bookingStatusVariant)).toEqual(['info', 'positive', 'warning', 'danger', 'danger', 'neutral']);
});

it('featured Home treatment retains private-data boundaries, callback and contrast in both press states', () => {
  for (const role of ['worker', 'client']) {
    for (const status of ['confirmed', 'cancelled', 'no_show']) {
      let calls = 0;
      const tree = BookingCompactCard({role, booking: fixture(role, status), featured: true, onPress: () => calls++});
      tree.props.onPress(); expect(calls).toBe(1);
      expect(text(tree)).toContain(title);
      expect(text(tree)).not.toContain('private-phone');
      expect(text(tree)).not.toContain('123 Eksaktong Kalye');
      expect(text(tree)).not.toContain(longName); // Secondary identity remains on the existing Details destination.
      contrast(tree, false, colors.canvas);
      contrast(tree, true, colors.canvas);
    }
  }
});
