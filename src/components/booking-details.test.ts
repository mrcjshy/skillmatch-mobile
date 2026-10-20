// @ts-expect-error -- Node-only component harness, not native layout evidence.
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error -- Node-only component harness.
import path from 'node:path';
// @ts-expect-error -- Node-only component harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
let state: any[] = [], cursor = 0;
const disclosureStates = new Map<string, any[]>();
const native = { ...Object.fromEntries(['KeyboardAvoidingView','View','Text','ScrollView','RefreshControl','Pressable','Image','ActivityIndicator','Modal','TextInput'].map(n => [n,n])), Platform: { OS: 'android', select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s, hairlineWidth: 1 }, AppState: { currentState: 'active' }, Alert: { alert() {} }, Linking: { openURL() { throw Error('No live mutations'); } },
  // The map-first panel animates with core Animated/PanResponder: recorded, never run.
  Animated: { View: 'Animated.View', Value: class { constructor(public value: number) {} setValue(value: number) { this.value = value; } interpolate() { return 0; } }, timing: () => ({ start() {}, stop() {} }) },
  Easing: { bezier: () => () => 0 }, PanResponder: { create: (handlers: Props) => ({ panHandlers: { handlers } }) } };
const pushCalls: any[] = [];
let accountId = 'client-a';
// Extra account fields; an active account in the booking's role opens the map-first layout.
let accountExtra: Props = {};
// The panel's own state survives re-renders, as React keeps it.
let sheetState: any[] = [];
// Components named here stay unrendered elements, as React hands them to their parent.
let unrendered = new Set<string>();
function jsx(kind: any, props: Props): any {
  if (typeof kind !== 'function') return { type: kind, props: kind === 'Modal' && !props.visible ? { ...props, children: null } : props };
  if (unrendered.has(kind.name)) return { type: kind, props };
  const previous = state, previousCursor = cursor;
  state = kind.name === 'Collapsible' ? disclosureStates.get(props.title) ?? [] : kind.name === 'BookingSheet' ? sheetState : [];
  if (kind.name === 'Collapsible') disclosureStates.set(props.title, state);
  cursor = 0;
  try { return kind(props); } finally { state = previous; cursor = previousCursor; }
}
const cache: Props = {};
function load(file: string): Props {
  file = path.resolve(file); if (cache[file]) return cache[file];
  const exports: Props = {}; cache[file] = exports;
  const require = (name: string): any => {
      if (name === '@/components/refinement-theme') return { ...load('src/components/refinement-theme.tsx'), RefinementThemeProvider: 'RefinementThemeProvider' };
    if (name === 'react-native') return native;
    if (name === '@/components/booking-location-map') return { BookingLocationMap: 'BookingLocationMap' };
    if (name === 'expo-crypto') return { randomUUID: () => 'test-operation' };
    if (name === 'expo-image') return { Image: 'Image' };
      if (name === '@/components/app-symbol') return { AppSymbol: 'SymbolView' };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { createContext: (value: any) => ({ value }), useContext: (context: any) => context.value, useState: (initial: any) => { const i=cursor++; if (!(i in state)) state[i]=typeof initial === 'function' ? initial() : initial; const captured=state; return [state[i], (next: any) => { captured[i]=typeof next === 'function' ? next(captured[i]) : next; }]; }, useRef: (value: any) => ({ current: value }), useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), useEffect() {}, useLayoutEffect() {} };
    if (name === 'tamagui') return { XStack: 'View', YStack: 'View' };
    if (name === 'expo-router') return { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ push: (route: any) => pushCalls.push(route), canGoBack: () => true, back: () => pushCalls.push('back') }), useFocusEffect() {}, useLocalSearchParams: () => ({}) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) };
    if (name === '@/hooks/use-reduced-motion') return { useReducedMotion: () => false };
    if (name === '@/global.css') return {};
    if (name === 'expo-router/react-navigation') return { useHeaderHeight: () => 56 };
    if (name === '@/providers/account-provider') return { useAccount: () => ({ account: { id: accountId, ...accountExtra } }) };
    if (name.endsWith('/supabase')) return { supabase: new Proxy({}, { get() { throw Error('No provider/database access permitted'); } }) };
    if (name.endsWith('/realtime')) return { subscribeInvalidation() {}, bookingMessagesTopic: () => '', userNotificationsTopic: () => '' };
    if (name.endsWith('/job-location-map')) return { nativeJobMapsLoaded: () => false, WorkerAssignedJobLocation: 'WorkerAssignedJobLocation' };
    if (name.endsWith('/job-photo-gallery')) return { JobPhotoGallery: 'JobPhotoGallery' };
    if (name.endsWith('/rate-worker')) return { default: 'RateWorker' };
    const stem = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
    const target = [stem + '.ts', stem + '.tsx'].find(existsSync); if (!target) throw Error('Unexpected boundary: ' + name);
    return load(target);
  };
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, Intl, Date, console, Map, Set }); return exports;
}
const theme=load('src/constants/theme.ts').SkillMatchTheme.ui;
const Details=load('src/components/booking-details.tsx').default, List=load('src/components/my-bookings-list.tsx').default;
const Lifecycle=load('src/components/booking-lifecycle.tsx').default, Payment=load('src/components/booking-payment.tsx').default;
function render(component: any, props: Props, seeds: any[] = []) { state=seeds; cursor=0; return component(props); }
function all(tree: any, kind: string): any[] { if (Array.isArray(tree)) return tree.flatMap(x=>all(x,kind)); if (!tree || typeof tree !== 'object') return []; return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children,kind)]; }
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(''); if (tree==null || typeof tree === 'boolean') return ''; return typeof tree === 'object' ? text(tree.props.children) : String(tree); }
function visibleText(tree: any): string { if (Array.isArray(tree)) return tree.map(visibleText).join(''); if (tree==null || typeof tree === 'boolean') return ''; if (typeof tree !== 'object') return String(tree); if (flat(tree.props.style).display === 'none' || tree.props.accessibilityElementsHidden) return ''; return visibleText(tree.props.children); }
const ID='11111111-1111-4111-8111-111111111111';
const name='Maria Ysabel dela Cruz Villanueva de los Santos';
function booking(role='client', status='confirmed', id=ID): Props { return { booking_id:id,job_id:'job-a', booking_status:status,payment_status:'unpaid',booked_at:'2030-12-30T07:00:00Z',completed_at:null, job_title:'Masusing pagkukumpuni ng malaking bahay at paglilinis ng tahanan',job_description:'Long supplied description with Unicode ñ',job_scheduled_at:'2030-12-31T07:00:00Z',job_address:'EXACT PRIVATE ADDRESS',job_barangay:'Barangay San Isidro Labrador na may mahabang pangalan',job_city:'Santa Ana Pampanga',job_budget:987654321.75, ...(role==='client' ? { worker_user_id:'worker-a',worker_full_name:name,worker_phone:'09171234567',worker_barangay:'Worker barangay',worker_skills:['Plumbing','Carpentry'],worker_is_verified:true,worker_rating_avg:4.9,worker_rating_count:1234 } : {client_user_id:'client-a',client_full_name:name,client_phone:'09171234567'}) }; }
function detail(role='client',status='confirmed',overrides: Props={}) { return {booking:booking(role,status),payment:{id:'payment-a',payment_method:'cod',payment_status:'paid'},paymentReadSucceeded:true,jobPaymentMethod:'cash',jobPaymentReady:true,isRated:false,reportReadSucceeded:true,isReported:false,exactLocation:{status:'skipped'},jobPhotos:{status:'skipped'},...overrides}; }
function detailTree(role='client',status='confirmed',overrides:Props={},suppress=false) { disclosureStates.clear(); return render(Details,{role,bookingId:ID},[detail(role,status,overrides),false,false,null,null,suppress]); }
function contrast(tree:any,parent=theme.colors.canvas,pressed=false,opacity=1) { if(Array.isArray(tree)){tree.forEach(x=>contrast(x,parent,pressed,opacity));return;} if(!tree || typeof tree!=='object')return; const style=flat(typeof tree.props.style==='function'?tree.props.style({pressed}):tree.props.style), bg=style.backgroundColor && style.backgroundColor!=='transparent'?style.backgroundColor:parent, alpha=opacity*(style.opacity??1); if(tree.type==='Text' && style.color && /^#[0-9a-f]{6}$/i.test(bg)) { const lum=(c:string)=>c.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0); const a=lum(style.color),b=lum(bg); expect(alpha).toBe(1); expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5); } contrast(tree.props.children,bg,pressed,alpha); }
const disclosures = (tree: any) => all(tree, 'Pressable').filter(node => node.props.accessibilityState?.expanded !== undefined);
const statusesFor = (role: string) => ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map(status => [role, status]);

it('uses one layout, one theme and no disclosures for every role and status: nothing important is hidden', () => {
  for (const [role, status] of [...statusesFor('worker'), ...statusesFor('client')]) {
    const tree = detailTree(role, status), copy = visibleText(tree);
    expect(all(tree, 'RefinementThemeProvider')).toHaveLength(1);
    expect(flat(all(tree, 'ScrollView')[0].props.style).backgroundColor).toBe(theme.colors.canvas);
    expect(copy).toContain('Booking reference'); expect(copy).toContain(ID);
    expect(copy).toContain('About the job'); expect(copy).toContain(booking(role).job_description);
    expect(copy).toContain('Booking record');
    // The only disclosure that may remain is the Client's quiet Cancellation, owned by the lifecycle component.
    expect(disclosures(tree).filter(node => node.props.accessibilityLabel !== 'Cancellation')).toHaveLength(0);
    expect(all(tree, 'Collapsible')).toHaveLength(0);
  }
});

it('orders the Worker screen: status and reference, job, client, location, payment step, about, record, help, then cancellation last', () => {
  const tree = detailTree('worker', 'confirmed', { payment: { id: 'payment-a', payment_method: 'cod', payment_status: 'pending' } }), copy = visibleText(tree);
  const order = ['Booking reference', 'Client details', 'Job location', 'Payment', 'About the job', 'Booking record', 'Help and reporting', 'Cancel booking'].map(label => copy.indexOf(label));
  expect(order.every(index => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((x, y) => x - y));
  const title = all(tree, 'Text').find(x => text(x) === booking('worker').job_title);
  expect(flat(title.props.style)).toMatchObject({ fontSize: theme.type.screenTitle.fontSize, color: theme.colors.textPrimary });
  for (const label of ['Schedule', 'Job budget']) {
    const labelNode = all(tree, 'Text').find(x => text(x) === label); expect(labelNode).toBeTruthy();
    expect(flat(labelNode.props.style).color).toBe(theme.colors.textSecondary);
  }
  const budget = all(tree, 'Text').find(x => text(x).includes('987,654,321.75'));
  expect(flat(budget.props.style)).toMatchObject({ fontWeight: '700', fontSize: theme.type.money.fontSize }); expect(budget.props.numberOfLines).toBeUndefined();
  for (const value of [name, '09171234567', 'EXACT PRIVATE ADDRESS', booking('worker').job_description, ID]) expect(copy).toContain(value);
});

it('keeps the Client layout complete and in the same reading order, with the worker facts beside the person', () => {
  const tree = detailTree('client', 'confirmed', { payment: { id: 'p', payment_method: 'cod', payment_status: 'pending' } }), copy = visibleText(tree);
  const order = ['Booking reference', 'Worker details', 'Job location', 'Payment', 'Cancel booking', 'About the job', 'Booking record', 'Help and reporting'].map(label => copy.indexOf(label));
  expect(order.every(index => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((x, y) => x - y));
  for (const value of [name, '09171234567', 'Worker barangay', 'Plumbing • Carpentry', 'Open chat', '987,654,321.75']) expect(copy).toContain(value);
  for (const label of all(tree, 'Text')) { expect(label.props.numberOfLines).toBeUndefined(); expect(flat(label.props.style).height).toBeUndefined(); }
});

it('preserves every restricted-status disclosure and fail-closed action predicate',()=>{for(const role of ['client','worker'])for(const status of ['pending','completed','cancelled','no_show']) {const tree=detailTree(role,status);expect(text(tree)).not.toContain(name);expect(text(tree)).not.toContain('EXACT PRIVATE ADDRESS');expect(all(tree,'Pressable').some(x=>x.props.accessibilityLabel==='Call booking counterpart')).toBe(false);} const hidden=detailTree('client','confirmed',{},true); expect(text(hidden)).not.toContain(name);expect(text(hidden)).not.toContain('EXACT PRIVATE ADDRESS'); const failed=detailTree('client','confirmed',{paymentReadSucceeded:false});expect(text(failed)).toContain('Payment and lifecycle actions are unavailable');expect(text(failed)).not.toContain('Mark as completed');});
it('keeps chat, portfolio and report destinations on their own supplied booking ID',()=>{for(const role of ['client','worker']) {pushCalls.length=0;const tree=detailTree(role);for(const control of all(tree,'Pressable').filter(x=>['Open chat','Report','View resume & portfolio'].includes(x.props.accessibilityLabel)))control.props.onPress();expect(pushCalls).toContainEqual({pathname:`/${role}/chat`,params:{bookingId:ID}});if(role==='client')expect(pushCalls).toContainEqual({pathname:'/client/portfolio',params:{bookingId:ID}});expect(pushCalls.every(x=>x.params.bookingId===ID)).toBe(true);}});

it('reveals the combined entry when an authoritative confirmation replaces pending and hides it on invalidation', () => {
  const entry = (tree: any) => all(tree, 'Pressable').filter(node => node.props.accessibilityLabel === 'View resume & portfolio');
  expect(entry(detailTree('client', 'pending'))).toHaveLength(0);
  expect(entry(detailTree('client', 'confirmed'))).toHaveLength(1);
  expect(entry(detailTree('client', 'confirmed', {}, true))).toHaveLength(0);
  for (const status of ['completed', 'cancelled', 'no_show']) expect(entry(detailTree('client', status))).toHaveLength(0);
  expect(entry(detailTree('worker', 'confirmed'))).toHaveLength(0);
});
it('offers cancellation to either party directly while completion remains Client-only and busy actions stay disabled', () => {
  for (const role of ['client', 'worker']) {
    const tree = render(Lifecycle, { role, bookingId: ID, showCompletion: true, showCancellation: true, onChanged: async () => {} });
    expect(visibleText(tree)).toContain('Cancel booking');
    expect(visibleText(tree).includes('Mark as completed')).toBe(role === 'client');
    expect(visibleText(tree).includes('Either party may cancel.')).toBe(role === 'client');
    expect(all(tree, 'Collapsible')).toHaveLength(0);
  }
  const busy = render(Lifecycle, { role: 'client', bookingId: ID, showCompletion: true, showCancellation: true, onChanged: async () => {} }, ['complete', null, false, null, '']);
  expect(all(busy, 'Pressable').every(x => x.props.disabled)).toBe(true);
});
it('preserves Active/History filtering, supplied ordering and route callbacks with grouped list headers',()=>{for(const role of ['client','worker'])for(const segment of ['active','history']) {pushCalls.length=0;const rows=[booking(role,'completed','history-a'),booking(role,'confirmed','active-b'),booking(role,'pending','active-c'),booking(role,'cancelled','history-d')];const tree=render(List,{role},[{},segment,rows,false,false,null]);expect(text(tree)).toContain(segment==='active'?'Active bookings':'Booking history');const cards=all(tree,'Pressable').filter(x=>x.props.accessibilityLabel?.includes('View booking details')); cards.forEach(x=>x.props.onPress());expect(pushCalls.map(x=>x.params.bookingId)).toEqual(segment==='active'?['active-b','active-c']:['history-a','history-d']);expect(pushCalls.every(x=>x.pathname===`/${role}/booking-details`)).toBe(true);}});
it('groups booking rows into one surface: first/middle/last positions and no gap between rows',()=>{const rows=[booking('worker','confirmed','a'),booking('worker','pending','b'),booking('worker','confirmed','c')];const tree=render(List,{role:'worker'},[{},'active',rows,false,false,null]);const cards=all(tree,'Pressable').filter(x=>x.props.accessibilityLabel?.includes('View booking details'));expect(cards).toHaveLength(3);const corners=cards.map(c=>{const s=flat(c.props.style({pressed:false}));return [s.borderTopLeftRadius,s.borderBottomLeftRadius];});expect(corners).toEqual([[16,0],[0,0],[0,16]]);const group=all(tree,'View').find(x=>Array.isArray(x.props.children)&&x.props.children.length===3&&x.props.children.every((c:any)=>c?.type==='Pressable'));expect(group).toBeTruthy();expect(flat(group.props.style).gap).toBeUndefined();});
it('keeps list loading, empty and failed states distinct and leaves retries intact',()=>{for(const [loading,error,expected] of [[true,null,'Loading your bookings'],[false,null,'You have no active bookings'],[false,'Safe failure','Safe failure']] as const){const tree=render(List,{role:'client'},[{},'active',[],loading,false,error]);expect(text(tree)).toContain(expected);expect(text(tree).includes('Retry')).toBe(Boolean(error));}});
it('keeps payment role boundaries, real paid text, disabled/loading controls and safe errors',()=>{const payment={id:'payment-a',payment_method:'cod',payment_status:'pending'};for(const role of ['client','worker']){const tree=render(Payment,{role,bookingId:ID,payment,jobPaymentMethod:'cash',onChanged:async()=>{}});expect(text(tree).includes('Confirm cash received')).toBe(role==='worker');expect(text(tree)).toContain('Payment method: Cash');const busy=render(Payment,{role,bookingId:ID,payment,jobPaymentMethod:'cash',onChanged:async()=>{}},[true,'Safe failure',null,null]);expect(text(busy)).toContain('Safe failure');expect(all(busy,'Pressable').every(x=>x.props.disabled)).toBe(true);} });
it('uses effective contrast in populated shared details at rest and pressed, without fading labels',()=>{for(const role of ['client','worker']){const tree=detailTree(role);contrast(tree,theme.colors.canvas);contrast(tree,theme.colors.canvas,true);}});

it('orders lifecycle children before separated cancellation and retains validated cancellation drafts',()=>{
  const props={role:'client',bookingId:ID,showCompletion:true,showCancellation:true,onChanged:async()=>{},children:{type:'Text',props:{children:'COMMUNICATION SLOT'}}};
  const seeds=[null,null,true,null,'']; let tree=render(Lifecycle,props,seeds);
  expect(text(tree).indexOf('Mark as completed')).toBeLessThan(text(tree).indexOf('COMMUNICATION SLOT'));
  expect(text(tree).indexOf('COMMUNICATION SLOT')).toBeLessThan(text(tree).indexOf('Cancel booking'));
  const radios=all(tree,'Pressable').filter(x=>x.props.accessibilityRole==='radio'); expect(radios.length).toBeGreaterThan(0);
  for(const radio of radios) for(const pressed of [false,true]) { const style=flat(radio.props.style({pressed}));expect(style.minHeight).toBeGreaterThanOrEqual(48);expect(style.minWidth).toBeGreaterThanOrEqual(48);expect(style.opacity).toBeUndefined(); }
  expect(all(tree,'ScrollView')[0].props.keyboardShouldPersistTaps).toBe('handled');
  const review=()=>all(tree,'Pressable').find(x=>x.props.accessibilityLabel==='Review cancellation');expect(review().props.disabled).toBe(true);
  radios.find(x=>x.props.accessibilityLabel==='Other').props.onPress(); tree=render(Lifecycle,props,seeds); expect(review().props.disabled).toBe(true);
  all(tree,'TextInput')[0].props.onChangeText('Supplied cancellation explanation retained without any submit'); tree=render(Lifecycle,props,seeds); expect(review().props.disabled).toBe(false);expect(all(tree,'TextInput')[0].props.value).toContain('Supplied cancellation');
  contrast(tree);contrast(tree,theme.colors.canvas,true);
});
it('keeps composed disabled/loading and failed payment/lifecycle text readable',()=>{
  const tree=render(Lifecycle,{role:'client',bookingId:ID,showCompletion:true,showCancellation:true,onChanged:async()=>{}},['complete','Safe failure',true,'other','Long retained detail']); contrast(tree);contrast(tree,theme.colors.canvas,true);expect(all(tree,'Pressable').filter(x=>x.props.accessibilityState?.expanded===undefined).every(x=>x.props.disabled)).toBe(true);expect(visibleText(tree)).toContain('Safe failure');
  for(const role of ['client','worker']) { const tree=render(Payment,{role,bookingId:ID,payment:{id:'p',payment_method:'cod',payment_status:'pending'},jobPaymentMethod:'cash',onChanged:async()=>{}},[true,'Safe failure',null,null]);contrast(tree);contrast(tree,theme.colors.canvas,true); }
});

it('has exactly one filled primary on screen: chat yields to a payment step or the Client completion', () => {
  const filled = (tree: any) => all(tree, 'Pressable').filter(x => x.props.accessibilityRole === 'button' && flat(x.props.style({ pressed: false })).backgroundColor === theme.colors.accent).map(x => x.props.accessibilityLabel);
  // Worker with nothing to confirm (already paid): chat is the one primary.
  expect(filled(detailTree('worker', 'confirmed', { payment: { id: 'p', payment_method: 'cod', payment_status: 'paid' } }))).toEqual(['Open chat']);
  // Worker with cash awaiting: the payment step owns the primary and chat steps back.
  const waiting = detailTree('worker', 'confirmed', { payment: { id: 'p', payment_method: 'cod', payment_status: 'pending' } });
  expect(filled(waiting)).toEqual(['Confirm cash received']);
  // Client with completion available: completion owns the primary.
  expect(filled(detailTree('client', 'confirmed', { payment: { id: 'p', payment_method: 'cod', payment_status: 'paid' } }))).toEqual(['Mark as completed']);
  // Call is always outlined, never filled.
  expect(filled(waiting)).not.toContain('Call booking counterpart');
});

it('holds the protected sections open while a refresh is suppressed, with neutral placeholders (PB-01 geometry contract)', () => {
  const refreshing = detailTree('worker', 'confirmed', {}, true);
  const holds = all(refreshing, 'View').filter(x => typeof x.props.onLayout === 'function' && 'minHeight' in flat(x.props.style));
  expect(holds.length).toBeGreaterThanOrEqual(2);
  // A layout event while suppressed must not overwrite the remembered live height.
  expect(() => holds.forEach(section => section.props.onLayout({ nativeEvent: { layout: { height: 12 } } }))).not.toThrow();
  expect(visibleText(refreshing)).toContain('Checking booking details');
  expect(visibleText(refreshing)).toContain('Checking job location');
  expect(visibleText(refreshing)).not.toContain('Client contact is not available for this booking status.');
  const live = detailTree('worker', 'confirmed');
  expect(all(live, 'View').filter(x => typeof x.props.onLayout === 'function' && !('minHeight' in flat(x.props.style))).length).toBeGreaterThanOrEqual(2);
});

it('hides every protected value and mounted child while a refresh is suppressed, for both roles', () => {
  for (const role of ['client', 'worker']) {
    const exactLocation={status:'ready',location:{jobId:'job-a',address:'EXACT PRIVATE ADDRESS',pin:{latitude:14.547,longitude:121.067},barangay:'Saved barangay',city:'Saved city'}};
    const tree = detailTree(role, 'confirmed', { exactLocation }, true);
    for (const value of [name, 'EXACT PRIVATE ADDRESS', '09171234567']) expect(text(tree)).not.toContain(value);
    expect(all(tree, 'JobPhotoGallery')).toHaveLength(0); expect(all(tree, 'WorkerAssignedJobLocation')).toHaveLength(0);
    expect(all(tree, 'Pressable').some(x => x.props.accessibilityLabel === 'Call booking counterpart')).toBe(false);
  }
});

it('shows the authoritative exact address once in its map surface instead of repeating it above',()=>{
  const exactLocation={status:'ready',location:{jobId:'job-a',address:'EXACT PRIVATE ADDRESS',pin:null,barangay:'Saved barangay',city:'Saved city'}};
  const tree=detailTree('worker','confirmed',{exactLocation});
  expect(text(tree)).not.toContain('EXACT PRIVATE ADDRESS');
  expect(all(tree,'WorkerAssignedJobLocation')[0].props.surface.address).toBe('EXACT PRIVATE ADDRESS');
  expect(all(tree,'WorkerAssignedJobLocation')[0].props.allowNavigation).toBe(true);
  expect(all(detailTree('client','confirmed',{exactLocation}),'WorkerAssignedJobLocation')[0].props.allowNavigation).toBe(false);
});

it('mounts the map visibly for both roles with the authorized projection and removes it on suppression', () => {
  const exactLocation = { status:'ready', location:{jobId:'job-a',address:'EXACT PRIVATE ADDRESS',pin:{latitude:14.547,longitude:121.067},barangay:'Saved barangay',city:'Saved city'} };
  for (const role of ['worker', 'client']) {
    const tree=detailTree(role,'confirmed',{exactLocation});
    expect(all(tree,'WorkerAssignedJobLocation')[0].props.surface.kind).toBe('exact');
    expect(all(tree,'WorkerAssignedJobLocation')[0].props.allowNavigation).toBe(role === 'worker');
    expect(all(detailTree(role,'confirmed',{exactLocation},true),'WorkerAssignedJobLocation')).toHaveLength(0);
  }
});

it('renders informational Confirmed and unchanged other status chips in actual details and chat', () => {
  const colors = theme.colors;
  const expected: Props = { confirmed: ['Confirmed', colors.info, colors.infoTint], completed: ['Completed', colors.success, colors.successTint], pending: ['Pending', colors.warning, colors.warningTint], cancelled: ['Cancelled', colors.error, colors.errorTint], no_show: ['No show', colors.error, colors.errorTint] };
  const assertChip = (tree: any, label: string, foreground: string, background: string) => {
    const labelNode = all(tree, 'Text').find(x => text(x) === label); expect(labelNode).toBeTruthy(); expect(flat(labelNode.props.style).color).toBe(foreground);
    const chip = all(tree, 'View').find(x => x.props.children === labelNode); expect(flat(chip.props.style).backgroundColor).toBe(background);
    contrast(tree, colors.canvas); contrast(tree, colors.canvas, true);
  };
  for (const role of ['client', 'worker']) for (const [status, [label, foreground, background]] of Object.entries(expected)) assertChip(detailTree(role, status), label, foreground, background);
  const Chat = load('src/components/booking-chat.tsx').default;
  for (const role of ['client', 'worker']) {
    const tree = render(Chat, { role, bookingId: ID }, [false, false, null, { status: 'confirmed', jobTitle: 'Supplied job', counterpartName: name }, [], role + ':client-a:' + ID, '', false, null]);
    assertChip(tree, 'Confirmed', colors.info, colors.infoTint); expect(text(tree)).toContain('Supplied job');
  }
});

// V4 #19 cancellation details in Booking record. Worker bookings name client 'client-a'; Client bookings name worker 'worker-a'.
const CANCELLED_AT = '2030-12-30T09:30:00Z';
function cancelledTree(role: string, viewer: string, bundle: Props) {
  accountId = viewer;
  try { return detailTree(role, 'cancelled', { booking: { ...booking(role, 'cancelled'), ...bundle } }); } finally { accountId = 'client-a'; }
}
// The rendered SurfaceGroup: one wrapper View per row, so each fact must be its own row.
function recordRows(tree: any): string[] {
  const rowsOf = (view: any): string[] => (Array.isArray(view.props.children) ? view.props.children : [])
    .filter((row: any) => row && typeof row === 'object').map(text);
  const group = all(tree, 'View').find(view => {
    const rows = rowsOf(view);
    return rows.length >= 3 && !rows.includes('Booking record') && rows.some(row => row.startsWith('Booked') && row !== 'Booked');
  });
  return rowsOf(group).filter(Boolean);
}
const formattedCancelledAt = load('src/lib/date-time.ts').formatDetailDateTime(CANCELLED_AT);

it('shows the Worker who cancelled, why and when, as separate Booking record rows', () => {
  const own = cancelledTree('worker', 'worker-a', { cancellation_reason_code: 'location_issue', cancellation_reason_detail: 'Gate locked', cancelled_by: 'worker-a', cancelled_at: CANCELLED_AT });
  expect(recordRows(own)).toEqual(expect.arrayContaining(['Cancelled byYou', 'ReasonLocation issue', 'DetailsGate locked', 'Cancelled' + formattedCancelledAt]));
  const byClient = cancelledTree('worker', 'worker-a', { cancellation_reason_code: 'schedule_conflict', cancellation_reason_detail: null, cancelled_by: 'client-a', cancelled_at: CANCELLED_AT });
  const rows = recordRows(byClient);
  expect(rows).toContain('Cancelled byYour client'); expect(rows).toContain('ReasonSchedule conflict');
  expect(rows.some(row => row.startsWith('Details'))).toBe(false);
  // Attribution never releases the suppressed counterpart identity.
  expect(text(byClient)).not.toContain(name); expect(text(byClient)).not.toContain('EXACT PRIVATE ADDRESS');
});

it('shows the Client who cancelled using the Client viewpoint', () => {
  const own = cancelledTree('client', 'client-a', { cancellation_reason_code: 'payment_issue', cancellation_reason_detail: null, cancelled_by: 'client-a', cancelled_at: CANCELLED_AT });
  expect(recordRows(own)).toEqual(expect.arrayContaining(['Cancelled byYou', 'ReasonPayment issue', 'Cancelled' + formattedCancelledAt]));
  const byWorker = cancelledTree('client', 'client-a', { cancellation_reason_code: 'other', cancellation_reason_detail: 'Fell ill', cancelled_by: 'worker-a', cancelled_at: CANCELLED_AT });
  expect(recordRows(byWorker)).toEqual(expect.arrayContaining(['Cancelled byYour worker', 'ReasonOther', 'DetailsFell ill']));
  expect(text(byWorker)).not.toContain(name);
});

it('keeps legacy, inconsistent and non-cancelled bookings to the plain status without cancellation rows', () => {
  const legacy = cancelledTree('client', 'client-a', { cancellation_reason_code: null, cancellation_reason_detail: null, cancelled_by: null, cancelled_at: null });
  const stranger = cancelledTree('worker', 'worker-a', { cancellation_reason_code: 'other', cancellation_reason_detail: 'x', cancelled_by: 'someone-else', cancelled_at: CANCELLED_AT });
  for (const tree of [legacy, stranger]) {
    expect(visibleText(tree)).toContain('Cancelled');
    expect(visibleText(tree)).not.toContain('Cancelled by'); expect(visibleText(tree)).not.toContain('Reason');
  }
  for (const role of ['client', 'worker']) for (const status of ['pending', 'confirmed', 'completed', 'no_show']) {
    expect(visibleText(detailTree(role, status))).not.toContain('Cancelled by');
  }
});


// V8-05 P3: SurfaceGroup receives unrendered DetailLine elements, so a fact without a value must
// not be passed at all. Otherwise it takes a row and a divider and then draws nothing.
const COMPLETED_AT = '2030-12-31T09:00:00Z';
function recordStructure(render: () => any) {
  unrendered = new Set(['DetailLine']);
  try {
    const isLine = (node: any) => node && typeof node === 'object' && typeof node.type === 'function' && node.type.name === 'DetailLine';
    const group = all(render(), 'View').find(view => Array.isArray(view.props.children) && view.props.children.some((row: any) =>
      row && typeof row === 'object' && Array.isArray(row.props?.children) && row.props.children.some((child: any) => isLine(child) && child.props.label === 'Booked')));
    expect(group).toBeDefined();
    return group.props.children.map((row: any) => {
      const [divider, line] = row.props.children;
      const drawn = line.type(line.props);
      return { label: line.props.label, divider: divider !== null, drawn: drawn !== null, value: drawn ? text(drawn).slice(line.props.label.length) : null };
    });
  } finally { unrendered = new Set(); }
}

it('gives each Booking record fact one row and one divider, with no empty Completed row, for both roles', () => {
  for (const role of ['worker', 'client']) {
    const viewer = role === 'worker' ? 'worker-a' : 'client-a';
    const cancelled = (bundle: Props) => () => cancelledTree(role, viewer, bundle);
    const cases: [string, () => any, string[]][] = [
      ['confirmed without completion', () => detailTree(role, 'confirmed'), ['Booked']],
      ['completed with completion', () => detailTree(role, 'completed', { booking: { ...booking(role, 'completed'), completed_at: COMPLETED_AT } }), ['Booked', 'Completed']],
      ['cancelled with details', cancelled({ cancellation_reason_code: 'other', cancellation_reason_detail: 'Fell ill', cancelled_by: viewer, cancelled_at: CANCELLED_AT }),
        ['Booked', 'Cancelled by', 'Reason', 'Details', 'Cancelled']],
      ['cancelled without optional details', cancelled({ cancellation_reason_code: 'schedule_conflict', cancellation_reason_detail: null, cancelled_by: viewer, cancelled_at: CANCELLED_AT }),
        ['Booked', 'Cancelled by', 'Reason', 'Cancelled']],
      ['legacy cancellation', cancelled({ cancellation_reason_code: null, cancellation_reason_detail: null, cancelled_by: null, cancelled_at: null }), ['Booked']],
    ];
    for (const [name, render, labels] of cases) {
      const rows = recordStructure(render);
      expect(rows.map((row: Props) => row.label), `${role} ${name}`).toEqual(labels);
      expect(rows.every((row: Props) => row.drawn), `${role} ${name}: every row draws a fact`).toBe(true);
      expect(rows.map((row: Props) => row.divider), `${role} ${name}: dividers only between rows`).toEqual(labels.map((_, index) => index > 0));
    }
    const completed = recordStructure(() => detailTree(role, 'completed', { booking: { ...booking(role, 'completed'), completed_at: COMPLETED_AT } }));
    expect(completed[1].value).toBe(load('src/lib/date-time.ts').formatDetailDateTime(COMPLETED_AT));
  }
});

// Demo-readiness chat scrolling: the local jump indicator appears only while backreading a shown thread.
it('offers an accessible jump-to-latest control with a local unseen count only while backreading', () => {
  const Chat = load('src/components/booking-chat.tsx').default;
  const rows = [{ id: 'm1', sender_id: 'worker-a', content: 'Hello', created_at: '2030-12-30T09:30:00Z' }];
  const seeds = (jump: any, messages: any[] = rows) => [false, false, null, { status: 'confirmed', jobTitle: 'Supplied job', counterpartName: name }, messages, 'client:client-a:' + ID, '', false, null, jump];
  const jumpControl = (tree: any) => all(tree, 'Pressable').filter(x => String(x.props.accessibilityLabel).includes('Jump to latest'));
  const away = jumpControl(render(Chat, { role: 'client', bookingId: ID }, seeds({ away: true, unseen: 2 })));
  expect(away).toHaveLength(1);
  expect(away[0].props.accessibilityRole).toBe('button');
  expect(away[0].props.accessibilityLabel).toBe('2 new messages. Jump to latest');
  expect(text(away[0])).toContain('2 new');
  expect(jumpControl(render(Chat, { role: 'client', bookingId: ID }, seeds({ away: true, unseen: 0 })))[0].props.accessibilityLabel).toBe('Jump to latest messages');
  expect(jumpControl(render(Chat, { role: 'client', bookingId: ID }, seeds({ away: false, unseen: 0 })))).toHaveLength(0);
  expect(jumpControl(render(Chat, { role: 'client', bookingId: ID }, seeds({ away: true, unseen: 1 }, [])))).toHaveLength(0);
  const scroll = all(render(Chat, { role: 'client', bookingId: ID }, seeds({ away: false, unseen: 0 })), 'ScrollView')[0];
  expect(typeof scroll.props.onScroll).toBe('function');
  expect(typeof scroll.props.onContentSizeChange).toBe('function');
});

// 2026-10-14 Android trace: the composer resized the viewport before the thread was measured, and the
// throttled events of the screen's own scrollToEnd stopped part-way with no final event at the bottom.
it('does not leave the jump control on after revealing the latest message, yet still follows the reader', () => {
  const Chat = load('src/components/booking-chat.tsx').default;
  const rows = ['m1', 'm2', 'm3'].map((id) => ({ id, sender_id: 'worker-a', content: 'Hello', created_at: '2030-12-30T09:30:00Z' }));
  const seeds: any[] = [false, false, null, { status: 'confirmed', jobTitle: 'Supplied job', counterpartName: name }, rows, 'client:client-a:' + ID, '', false, null, { away: false, unseen: 0 }];
  const scroll = all(render(Chat, { role: 'client', bookingId: ID }, seeds), 'ScrollView')[0];
  const ends: any[] = [];
  scroll.props.ref.current = { scrollToEnd: (options: any) => ends.push(options) };
  const at = (y: number, content = 1309, viewport = 654) => ({ nativeEvent: { contentOffset: { y }, contentSize: { height: content }, layoutMeasurement: { height: viewport } } });

  scroll.props.onLayout({ nativeEvent: { layout: { height: 654 } } });
  scroll.props.onContentSizeChange(1080, 1309);
  scroll.props.onScroll(at(13));
  scroll.props.onScroll(at(325));
  expect(ends.length).toBeGreaterThan(0);
  expect(seeds[9]).toEqual({ away: false, unseen: 0 });

  // The reader then drags back through history: the arrow appears, and a settled return clears it.
  scroll.props.onScrollBeginDrag(at(325));
  scroll.props.onScroll(at(100));
  expect(seeds[9]).toEqual({ away: true, unseen: 0 });
  scroll.props.onMomentumScrollEnd(at(655));
  expect(seeds[9]).toEqual({ away: false, unseen: 0 });
});

it('shows no jump control for a thread that fits in the viewport', () => {
  const Chat = load('src/components/booking-chat.tsx').default;
  const rows = [{ id: 'm1', sender_id: 'worker-a', content: 'Hi', created_at: '2030-12-30T09:30:00Z' }];
  const seeds: any[] = [false, false, null, { status: 'confirmed', jobTitle: 'Supplied job', counterpartName: name }, rows, 'client:client-a:' + ID, '', false, null, { away: false, unseen: 0 }];
  const scroll = all(render(Chat, { role: 'client', bookingId: ID }, seeds), 'ScrollView')[0];
  scroll.props.ref.current = { scrollToEnd() {} };
  scroll.props.onLayout({ nativeEvent: { layout: { height: 654 } } });
  scroll.props.onContentSizeChange(1080, 400);
  scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 400 }, layoutMeasurement: { height: 654 } } });
  expect(seeds[9]).toEqual({ away: false, unseen: 0 });
});

// ---------- Map-first confirmed booking (2026-10-16): full-screen map + draggable booking panel ----------
const pinLocation = { status: 'ready', location: { jobId: 'job-a', address: 'EXACT PRIVATE ADDRESS', pin: { latitude: 14.547, longitude: 121.067 }, barangay: 'Saved barangay', city: 'Saved city' } };
function mapFirstTree(role = 'worker', overrides: Props = {}, suppress = false) {
  accountExtra = { is_active: true, role }; sheetState = [];
  try { return detailTree(role, 'confirmed', overrides, suppress); } finally { accountExtra = {}; }
}
const el = (type: string, props: Props) => ({ type, props });
const stop = vi.fn();
const location = { primary: el('Pressable', { accessibilityRole: 'button', accessibilityLabel: 'Stop sharing on this device', onPress: stop, children: el('Text', { children: 'PRIMARY CONTROLS' }) }),
  secondary: el('Text', { children: 'SECONDARY DETAILS' }) };
const panelOf = (tree: any) => all(tree, 'BookingLocationMap')[0].props.renderPanel(location);
const headerOf = (panel: any) => all(panel, 'View').find(x => x.props.handlers?.onMoveShouldSetPanResponder);
const bodyOf = (panel: any) => all(panel, 'View').find(x => x.props.handlers?.onMoveShouldSetPanResponderCapture);
const toggleOf = (panel: any) => all(panel, 'Pressable').find(x => ['Show booking details', 'Show map'].includes(x.props.accessibilityLabel));

it('a confirmed booking opens map-first: one full-screen map, a floating Back and no stack header or page scroll', () => {
  for (const role of ['worker', 'client']) {
    pushCalls.length = 0;
    const tree = mapFirstTree(role, { exactLocation: pinLocation });
    expect(all(tree, 'ScrollView')).toHaveLength(0);
    expect(all(tree, 'StackScreen')[0].props.options).toEqual({ headerShown: false });
    const maps = all(tree, 'BookingLocationMap');
    expect(maps).toHaveLength(1);
    expect(maps[0].props).toMatchObject({ role, bookingId: ID, destination: pinLocation.location.pin });
    // Markers are framed below the floating header (safe area 24 + 8 + 48 + 8) and above the panel.
    expect(maps[0].props.insets).toEqual({ top: 24 + theme.spacing.sm + theme.size.iconButton + theme.spacing.sm, bottom: 0 });
    const back = all(tree, 'Pressable').find(x => x.props.accessibilityLabel === 'Navigate up');
    expect(back.props.accessibilityRole).toBe('button');
    back.props.onPress();
    expect(pushCalls).toEqual(['back']);
    expect(visibleText(tree)).toContain('Booking details');
  }
  // Every other status keeps the scrolling page with its stack header.
  for (const status of ['pending', 'completed', 'cancelled']) {
    accountExtra = { is_active: true, role: 'worker' };
    try { const tree = detailTree('worker', status); expect(all(tree, 'ScrollView')).toHaveLength(1); expect(all(tree, 'BookingLocationMap')).toHaveLength(0); } finally { accountExtra = {}; }
  }
});

it('the collapsed panel shows status, title, schedule and the location controls; expanding shows the whole booking', () => {
  const tree = mapFirstTree('worker', { exactLocation: pinLocation, payment: { id: 'p', payment_method: 'cod', payment_status: 'pending' } });
  let panel = panelOf(tree);
  const header = visibleText(headerOf(panel));
  for (const value of ['Confirmed', booking('worker').job_title, '987,654,321.75', 'PRIMARY CONTROLS']) expect(header).toContain(value);
  let body = bodyOf(panel);
  expect(body.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(body.props.accessibilityElementsHidden).toBe(true);
  expect(all(body, 'ScrollView')[0].props.scrollEnabled).toBe(false);
  expect(toggleOf(panel).props.accessibilityLabel).toBe('Show booking details');
  // Expanded content: description, location, schedule/budget, counterpart and contacts, chat, video, location details,
  // payment and the lifecycle controls, in the existing reading order.
  const copy = text(body);
  const order = ['Booking reference', 'Schedule', 'Client details', 'Open chat', 'Video call', 'Your live location', 'SECONDARY DETAILS', 'Payment', 'About the job', 'Booking record', 'Cancel booking'].map(label => copy.indexOf(label));
  expect(order.every(index => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((x, y) => x - y));
  // The address and Open in Maps remain; no second map is drawn inside the panel.
  expect(all(body, 'WorkerAssignedJobLocation')[0].props.showMap).toBe(false);

  toggleOf(panel).props.onPress();
  panel = panelOf(tree); body = bodyOf(panel);
  expect(toggleOf(panel).props.accessibilityLabel).toBe('Show map');
  expect(body.props.accessibilityElementsHidden).toBe(false);
  expect(body.props.importantForAccessibility).toBe('auto');
  expect(all(body, 'ScrollView')[0].props.scrollEnabled).toBe(true);
  toggleOf(panel).props.onPress();
  expect(toggleOf(panelOf(tree)).props.accessibilityLabel).toBe('Show booking details');
});

it('drags only from the panel header with a clearly vertical gesture: taps and map pans neither move it nor press Stop', () => {
  stop.mockClear();
  const tree = mapFirstTree('worker', { exactLocation: pinLocation });
  let panel = panelOf(tree);
  // The panel never covers the map's touches outside itself.
  expect(panel.props.pointerEvents).toBe('box-none');
  const handlers = headerOf(panel).props.handlers;
  expect(handlers.onStartShouldSetPanResponder).toBeUndefined();
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 0, dy: 4 })).toBe(false);
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 40, dy: 12 })).toBe(false);
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 2, dy: -60 })).toBe(true);
  // Swipe up expands; the Stop control in the same header is not pressed by the drag.
  handlers.onPanResponderGrant(); handlers.onPanResponderMove(null, { dy: -240 }); handlers.onPanResponderRelease(null, { dy: -240, vy: -1.2 });
  panel = panelOf(tree);
  expect(toggleOf(panel).props.accessibilityLabel).toBe('Show map');
  expect(stop).not.toHaveBeenCalled();
  // Expanded: pulling down from the top of the content returns to the map; scrolling up inside it does not.
  const capture = bodyOf(panel).props.handlers.onMoveShouldSetPanResponderCapture;
  expect(capture(null, { dx: 0, dy: -40 })).toBe(false);
  expect(capture(null, { dx: 0, dy: 40 })).toBe(true);
  const header = headerOf(panel).props.handlers;
  header.onPanResponderGrant(); header.onPanResponderRelease(null, { dy: 260, vy: 1.4 });
  panel = panelOf(tree);
  expect(toggleOf(panel).props.accessibilityLabel).toBe('Show booking details');
  expect(bodyOf(panel).props.handlers.onMoveShouldSetPanResponderCapture(null, { dx: 0, dy: 40 })).toBe(false);
  expect(stop).not.toHaveBeenCalled();
});

it('while protected fields are re-checked, the map is unmounted (sharing ends) and the panel holds neutral placeholders', () => {
  for (const role of ['worker', 'client']) {
    const tree = mapFirstTree(role, { exactLocation: pinLocation }, true);
    expect(all(tree, 'BookingLocationMap')).toHaveLength(0);
    const copy = text(tree);
    for (const value of ['Checking job location', 'Checking location sharing', 'Checking booking details']) expect(copy).toContain(value);
    for (const value of [name, 'EXACT PRIVATE ADDRESS', '09171234567']) expect(copy).not.toContain(value);
  }
});

it('the Client map-first panel names the Worker location and keeps contact, chat and video actions', () => {
  const tree = mapFirstTree('client', { exactLocation: pinLocation });
  expect(all(tree, 'BookingLocationMap')[0].props.role).toBe('client');
  const body = text(bodyOf(panelOf(tree)));
  for (const value of ['Worker details', 'Open chat', 'Video call', 'Worker location', 'SECONDARY DETAILS']) expect(body).toContain(value);
  expect(body).not.toContain('Your live location');
});
