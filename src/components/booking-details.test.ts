// @ts-expect-error -- Node-only component harness, not native layout evidence.
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error -- Node-only component harness.
import path from 'node:path';
// @ts-expect-error -- Node-only component harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
let state: any[] = [], cursor = 0;
const disclosureStates = new Map<string, any[]>();
const native = { ...Object.fromEntries(['KeyboardAvoidingView','View','Text','ScrollView','RefreshControl','Pressable','Image','ActivityIndicator','Modal','TextInput'].map(n => [n,n])), Platform: { OS: 'android', select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s, hairlineWidth: 1 }, AppState: { currentState: 'active' }, Alert: { alert() {} }, Linking: { openURL() { throw Error('No live mutations'); } } };
const pushCalls: any[] = [];
function jsx(kind: any, props: Props): any {
  if (typeof kind !== 'function') return { type: kind, props: kind === 'Modal' && !props.visible ? { ...props, children: null } : props };
  const previous = state, previousCursor = cursor;
  state = kind.name === 'Collapsible' ? disclosureStates.get(props.title) ?? [] : [];
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
    if (name === 'expo-crypto') return { randomUUID: () => 'test-operation' };
    if (name === 'expo-image') return { Image: 'Image' };
      if (name === '@/components/app-symbol') return { AppSymbol: 'SymbolView' };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { createContext: (value: any) => ({ value }), useContext: (context: any) => context.value, useState: (initial: any) => { const i=cursor++; if (!(i in state)) state[i]=typeof initial === 'function' ? initial() : initial; const captured=state; return [state[i], (next: any) => { captured[i]=typeof next === 'function' ? next(captured[i]) : next; }]; }, useRef: (value: any) => ({ current: value }), useCallback: (fn: any) => fn, useEffect() {}, useLayoutEffect() {} };
    if (name === 'tamagui') return { XStack: 'View', YStack: 'View' };
    if (name === 'expo-router') return { useRouter: () => ({ push: (route: any) => pushCalls.push(route) }), useFocusEffect() {}, useLocalSearchParams: () => ({}) };
    if (name === '@/global.css') return {};
    if (name === 'expo-router/react-navigation') return { useHeaderHeight: () => 56 };
    if (name === '@/providers/account-provider') return { useAccount: () => ({ account: { id: 'client-a' } }) };
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
it('keeps chat, portfolio and report destinations on their own supplied booking ID',()=>{for(const role of ['client','worker']) {pushCalls.length=0;const tree=detailTree(role);for(const control of all(tree,'Pressable').filter(x=>['Open chat','Report','View Portfolio'].includes(x.props.accessibilityLabel)))control.props.onPress();expect(pushCalls).toContainEqual({pathname:`/${role}/chat`,params:{bookingId:ID}});expect(pushCalls.every(x=>x.params.bookingId===ID)).toBe(true);}});
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

