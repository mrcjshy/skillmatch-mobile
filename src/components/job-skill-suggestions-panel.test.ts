// @ts-expect-error -- Node-only component harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only component harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '../providers/client-post-job-draft-provider';
import * as core from '../lib/job-skill-suggestions';
import * as selection from '../lib/post-job-skill-selection';
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn(), storage: { from: vi.fn() } } }));
type Props = Record<string, any>;
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
function nodes(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== 'object') return []; return [tree, ...nodes(tree.props?.children)]; }
function harness(enabled = true) {
  const owner = createClientPostJobDraftOwner(first);
  owner.updateDraft({ wizardStep: 2 });
  const slots: any[] = []; let cursor = 0;
  const effects = new Map<number, { deps?: any[]; cleanup?: () => void }>();
  let pending: (() => void)[] = [];
  const effect = (fn: () => void | (() => void), deps?: any[]) => { const i = cursor++; const previous = effects.get(i); if (!previous || !deps || deps.some((x,j) => x !== previous.deps?.[j])) pending.push(() => { previous?.cleanup?.(); effects.set(i,{ deps, cleanup: fn() || undefined }); }); };
  const react = { useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (next:any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; }, useEffect: effect, useLayoutEffect: effect, useCallback: (fn:any) => fn };
  const native: Props = { StyleSheet: { create: (x:any) => x }, AppState: { currentState: 'active', addEventListener: vi.fn((_event, fn) => { background = fn; return { remove: vi.fn() }; }) }, Text:'Text', View:'View', Pressable:'Pressable' };
  let background: (status:string) => void = () => {};
  let lifecycle: () => void = () => {};
  const session: Props = { sessionLifetime: { ownerId:first, isCurrent: () => true }, sessionRevision:0, isSessionRevisionCurrent: () => true, subscribeSessionLifecycle: (fn:any) => { lifecycle = fn; return () => {}; }, isSessionLoading:false, sessionError:null, recoveryStatus:'idle' };
  const response = { mode:'job_skill_suggestions', source:'gemini', suggestions:[{ skill_id:first, explanation:'Repairs the pipe.' },{ skill_id:second, explanation:'Checks the wiring.' }] };
  const invoke = vi.fn(async () => ({ data:response, error:null as unknown }));
  const prepare = vi.fn(async (..._args: any[]) => ({ ok:false, reason:'image_unavailable' }) as any);
  const authority = { revision:0 };
  let props: Props = { owner, skills:[{id:first,skill_name:'Plumbing'},{id:second,skill_name:'Electrical'}], focused:true, authority };
  const modules: Props = { react, 'react-native':native, 'react/jsx-runtime': { jsx:(type:any,props:any) => ({type,props}), jsxs:(type:any,props:any) => ({type,props}) },
    '@/lib/job-skill-suggestions':{ ...core, createJobSkillSuggestionsInvoker: (functions: core.JobSkillSuggestionsFunctions) => core.createJobSkillSuggestionsInvoker(functions, enabled) }, '@/lib/ai-image-input':{ prepareAiImageInput:prepare }, '@/lib/supabase':{ supabase:{functions:{invoke}} }, '@/providers/session-provider':{useSession:() => session},
    '@/components/app-button':{AppButton:'AppButton'}, '@/components/inline-status':{InlineStatus:'InlineStatus'}, '@/components/section-header':{SectionHeader:'SectionHeader'}, '@/components/surface-group':{SurfaceGroup:'SurfaceGroup'}, '@/components/app-symbol':{AppSymbol:'AppSymbol'}, '@/components/app-chip':{AppChip:'AppChip'}, '@/components/skillmatch-mascot':{SkillMatchMascot:'SkillMatchMascot'}, '@/components/motion':{MotionView:'MotionView', useListReveal:() => () => undefined, usePressScale:() => ({style:{},onPressIn(){},onPressOut(){}})}, '@/lib/post-job-skill-selection':selection,
    '@/constants/theme':{SkillMatchTheme:{ui:{ colors:{}, type:{}, spacing:{}, radius:{} }}} };
  const exports:Props = {};
  runInNewContext(ts.transpileModule(readFileSync('src/components/job-skill-suggestions-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,console,require:(key:string) => { if (!(key in modules)) throw Error(key); return modules[key]; }});
  const render = () => { cursor=0; pending=[]; const tree = exports.JobSkillSuggestionsPanel(props); pending.forEach(fn => fn()); return tree; };
  const find = (label:string) => nodes(render()).find(node => node.props?.label === label || node.props?.accessibilityLabel === label);
  const press = (label:string) => { const node=find(label); expect(node,label).toBeDefined(); return node.props.onPress(); };
  const text = () => nodes(render()).map(node => node.props?.message ?? node.props?.children ?? '').filter(x => typeof x === 'string').join(' ');
  return { owner, get props() { return props; }, replaceProps: (next: Props) => { props = next; }, session, authority, invoke, prepare, response, render, find, press, text, background: (status:string) => background(status), lifecycle:() => lifecycle(), unmount:() => { effects.forEach(record => record.cleanup?.()); } };
}
async function settle() { for (let i=0;i<25;i++) await Promise.resolve(); }
it('shows a rejected transport once with empty skills and no automatic Apply or Post', async () => {
  const h = harness();
  h.owner.updateDraft({ description: 'Synthetic leaking pipe repair' });
  const before = JSON.stringify(h.owner.draft);
  h.invoke.mockRejectedValue(new TypeError('PRIVATE_NETWORK_DETAILS'));
  h.press('Ask Itik for skills'); await settle();
  expect(h.text()).toContain("Itik couldn't answer right now. Try again in a moment.");
  expect(h.text()).not.toContain('PRIVATE_NETWORK_DETAILS');
  expect(h.find('Try again')).toBeDefined();
  expect(h.find('Suggestion Plumbing')).toBeUndefined();
  expect(h.owner.draft.primarySkillId).toBeNull();
  expect(h.owner.draft.additionalSkillIds).toEqual([]);
  expect(JSON.stringify(h.owner.draft)).toBe(before);
  expect(h.owner.isPosting).toBe(false);
  expect(h.invoke).toHaveBeenCalledTimes(1);
  h.render(); await settle();
  expect(h.invoke).toHaveBeenCalledTimes(1);
});
it('makes classification explicit, sends English description only and adds a tapped card at once without submitting', async () => {
  const h=harness(); h.owner.updateDraft({description:'Repair the leaking pipe'}); h.render(); expect(h.invoke).not.toHaveBeenCalled();
  h.press('Ask Itik for skills'); await settle(); expect(h.invoke).toHaveBeenCalledTimes(1);
  expect(h.invoke).toHaveBeenCalledWith('skillmatch-ai',{body:{mode:'job_skill_suggestions',description:'Repair the leaking pipe'}});
  expect(h.owner.draft.primarySkillId).toBeNull(); expect(h.text()).toContain('Plumbing');
  expect(h.find('Suggestion Plumbing').props.accessibilityState.checked).toBe(false); expect(h.find('Suggestion Electrical').props.accessibilityState.checked).toBe(false);
  h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBe(first); h.press('Suggestion Electrical'); expect(h.owner.draft.additionalSkillIds).toEqual([second]); expect(h.owner.draft.wizardStep).toBe(2); expect(h.find('Apply selected skills')).toBeUndefined();
});
it('supports Taglish and adding just one suggested skill', async () => { const h=harness(); h.owner.updateDraft({description:'Pakiayos ang leaking gripo'}); h.press('Ask Itik for skills'); await settle(); h.press('Suggestion Electrical'); expect(h.owner.draft.primarySkillId).toBe(second); expect(h.owner.draft.additionalSkillIds).toEqual([]); });
it('shows recoverable provider error and quota without automatic retries or draft changes', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',primarySkillId:second}); h.invoke.mockResolvedValue({data:null as any,error:{context:{status:502}}}); h.press('Ask Itik for skills'); await settle(); expect(h.text()).toContain('Try again'); expect(h.invoke).toHaveBeenCalledTimes(1); h.invoke.mockResolvedValue({data:null as any,error:{context:{status:429}}}); h.press('Try again'); await settle(); expect(h.text()).toContain('limit'); expect(h.owner.draft.primarySkillId).toBe(second); expect(h.invoke).toHaveBeenCalledTimes(2); });
it('latches duplicate taps until the one pending transport completes', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); let complete:any; h.invoke.mockImplementation(() => new Promise(resolve => { complete=resolve; })); const action=h.find('Ask Itik for skills').props.onPress; action(); action(); expect(h.invoke).toHaveBeenCalledTimes(1); complete({data:h.response,error:null}); await settle(); expect(h.text()).toContain('Plumbing'); });
it.each(['description','manual','blur','background','lifetime','unmount','catalog','photos','owner','step'] as const)('discards pending classification after %s invalidation', async kind => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); let complete:any; h.invoke.mockImplementation(() => new Promise(resolve => {complete=resolve;})); h.press('Ask Itik for skills');
  if(kind==='description'){ h.authority.revision++; h.owner.updateDraft({description:'Other job'}); h.authority.revision++; h.owner.updateDraft({description:'Repair the pipe'}); }
  if(kind==='manual') h.authority.revision++;
  if(kind==='blur') h.props.focused=false;
  if(kind==='background') h.background('background');
  if(kind==='lifetime'){ h.session.sessionLifetime={ownerId:first,isCurrent:()=>true}; h.lifecycle(); }
  if(kind==='unmount') h.unmount();
  if(kind==='catalog') h.props.skills=[{id:second,skill_name:'Electrical'}];
  if(kind==='photos') h.owner.updateDraft({jobPhotos:[]});
  if(kind==='owner') h.props.owner=createClientPostJobDraftOwner(second);
  if(kind==='step') h.owner.updateDraft({wizardStep:1});
  h.render(); complete({data:h.response,error:null}); await settle(); expect(h.find('Apply selected skills')).toBeUndefined(); expect(h.owner.draft.primarySkillId).toBeNull();
});
it('masks a ready result on the first replacement-account render before layout effects', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle(); h.replaceProps({...h.props, owner:createClientPostJobDraftOwner(second)}); const tree=h.render(); expect(nodes(tree).find(node => node.props?.accessibilityLabel==='Suggestion Plumbing')).toBeUndefined(); });
it('ordinary context rerenders preserve reviewed results while owner rejection prevents skill mutation', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle(); h.props.owner={...h.owner}; expect(h.find('Suggestion Plumbing')).toBeDefined(); const add=h.find('Suggestion Plumbing').props.onPress; h.owner.dispose(); add(); expect(h.owner.draft.primarySkillId).toBeNull(); });
it.each(['empty','unknown','malformed'] as const)('handles %s output without altering skills', async kind => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',primarySkillId:second}); h.invoke.mockResolvedValue({data: kind==='empty'?{...h.response,suggestions:[]}:kind==='unknown'?{...h.response,suggestions:[{skill_id:'33333333-3333-4333-8333-333333333333',explanation:'Unknown'}]}:{} as any,error:null}); h.press('Ask Itik for skills'); await settle(); expect(h.find('Apply selected skills')).toBeUndefined(); expect(h.owner.draft.primarySkillId).toBe(second); if(kind==='empty')expect(h.text()).toContain("couldn't match a skill"); else expect(h.text()).toContain('Try again'); });
it('does not prepare or send an unselected draft photo and keeps failed explicit photo recoverable', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[{uri:'file:///photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'}]}); h.press('Ask Itik for skills'); await settle(); expect(h.prepare).not.toHaveBeenCalled(); h.press('Use photo 1 for suggestions'); h.press('Ask Itik for skills'); await settle(); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.invoke).toHaveBeenCalledTimes(1); expect(h.text()).toContain("Couldn't prepare"); h.press('Use description only'); h.press('Ask Itik for skills'); await settle(); expect(h.invoke).toHaveBeenCalledTimes(2); });
it('latches image preparation and stops transmission after selected photo removal', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[{uri:'file:///photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'}]}); let finish:any; h.prepare.mockImplementation(() => new Promise(resolve => {finish=resolve;})); h.press('Use photo 1 for suggestions'); const action=h.find('Ask Itik for skills').props.onPress; action(); action(); expect(h.prepare).toHaveBeenCalledTimes(1); h.authority.revision++; h.owner.updateDraft({jobPhotos:[]}); h.render(); finish({ok:true,image:{mime_type:'image/png',data:'fake'}}); await settle(); expect(h.invoke).not.toHaveBeenCalled(); });
it('rejects a retained card callback after a successor request with the same suggestions', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle(); const old=h.find('Suggestion Plumbing').props.onPress; h.press('Ask Itik for skills'); await settle(); old(); expect(h.owner.draft.primarySkillId).toBeNull(); h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBe(first); });
it('rejects a retained Suggest callback rather than retargeting a replacement account', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); const old=h.find('Ask Itik for skills').props.onPress; const next=createClientPostJobDraftOwner(second); next.updateDraft({wizardStep:2,description:'Another job'}); h.replaceProps({...h.props,owner:next}); h.session.sessionLifetime={ownerId:second,isCurrent:()=>true}; h.render(); old(); await settle(); expect(h.invoke).not.toHaveBeenCalled(); });
it('sends exactly one normalized explicitly selected current member after image cleanup succeeds', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[{uri:'file:///original-photo',assetId:'private-metadata',fileName:'private-name',fileSize:20,pickerMimeType:'image/png'}]}); const image={mime_type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='}; h.prepare.mockResolvedValue({ok:true,image}); h.press('Use photo 1 for suggestions'); h.press('Ask Itik for skills'); await settle(); const input=h.prepare.mock.calls[0][0] as any; expect(input.selectedPhoto).toBe(h.owner.draft.jobPhotos[0]); expect(input.draftPhotos).toBe(h.owner.draft.jobPhotos); expect(h.invoke).toHaveBeenCalledWith('skillmatch-ai',{body:{mode:'job_skill_suggestions',description:'Repair the pipe',image}}); expect(JSON.stringify(h.invoke.mock.calls)).not.toContain('original-photo'); expect(JSON.stringify(h.invoke.mock.calls)).not.toContain('private-metadata'); });
it('keeps a successor image preparation latched when an invalidated preparation finishes late', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[{uri:'file:///photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'}]}); const finishes:any[]=[]; h.prepare.mockImplementation(() => new Promise(resolve=>finishes.push(resolve))); h.press('Use photo 1 for suggestions'); h.press('Ask Itik for skills'); h.press('Use description only'); h.press('Use photo 1 for suggestions'); h.press('Ask Itik for skills'); finishes[0]({ok:false,reason:'invalidated'}); await settle(); h.find('Ask Itik for skills').props.onPress(); expect(h.prepare).toHaveBeenCalledTimes(2); finishes[1]({ok:false,reason:'image_unavailable'}); await settle(); expect(h.invoke).not.toHaveBeenCalled(); expect(h.text()).toContain("Couldn't prepare"); });
it('shows authorization failure without displaying server prose', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.invoke.mockResolvedValue({data:null as any,error:{context:{status:403},message:'Private server text'}}); h.press('Ask Itik for skills'); await settle(); expect(h.text()).toContain('this session'); expect(h.text()).not.toContain('Private server text'); });
it('a rejected owner update cannot claim an added skill', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); const update=vi.fn(()=>false); h.props.owner={...h.owner,updateDraft:update}; h.press('Ask Itik for skills'); await settle(); h.press('Suggestion Plumbing'); expect(update).toHaveBeenCalledWith({primarySkillId:first,additionalSkillIds:[]}); expect(h.owner.draft.primarySkillId).toBeNull(); expect(h.find('Suggestion Plumbing')).toBeUndefined(); });
it('requires fresh image selection after account replacement even if both drafts contain the same photo URI', async () => { const h=harness(); const photo={uri:'file:///same-photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'}; h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[photo]}); h.press('Use photo 1 for suggestions'); const next=createClientPostJobDraftOwner(second); next.updateDraft({wizardStep:2,description:'Repair another pipe',jobPhotos:[photo]}); h.replaceProps({...h.props,owner:next}); h.session.sessionLifetime={ownerId:second,isCurrent:()=>true}; h.render(); h.press('Ask Itik for skills'); await settle(); expect(h.prepare).not.toHaveBeenCalled(); expect(h.invoke).toHaveBeenCalledTimes(1); });
it('does not retarget a retained photo-choice callback to a successor account with the same URI', async () => { const h=harness(); const photo={uri:'file:///same-photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'}; h.owner.updateDraft({description:'Repair the pipe',jobPhotos:[photo]}); const old=h.find('Use photo 1 for suggestions').props.onPress; const next=createClientPostJobDraftOwner(second); next.updateDraft({wizardStep:2,description:'Repair another pipe',jobPhotos:[photo]}); h.replaceProps({...h.props,owner:next}); h.session.sessionLifetime={ownerId:second,isCurrent:()=>true}; h.render(); old(); h.press('Ask Itik for skills'); await settle(); expect(h.prepare).not.toHaveBeenCalled(); expect(h.invoke).toHaveBeenCalledTimes(1); });
it('looks tappable: each card shows an Add action that becomes Added, in the draft order', async () => {
  const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle();
  const visible = (label:string) => nodes(h.find(label)).filter(node => node.type==='Text').map(node => node.props.children).join(' ');
  expect(h.find('Suggestion Plumbing').type).toBe('Pressable');
  expect(h.find('Suggestion Plumbing').props.accessibilityRole).toBe('checkbox');
  expect(visible('Suggestion Plumbing')).toContain('Add');
  expect(visible('Suggestion Plumbing')).not.toContain('Added');
  expect(visible('Suggestion Plumbing')).toContain('Repairs the pipe.');
  h.press('Suggestion Plumbing'); h.press('Suggestion Electrical');
  expect(visible('Suggestion Plumbing')).toContain('Added');
  expect(visible('Suggestion Plumbing')).toContain('Primary');
  expect(visible('Suggestion Electrical')).toContain('Secondary');
  expect(h.find('Suggestion Plumbing').props.accessibilityState.checked).toBe(true);
  h.press('Suggestion Plumbing');
  expect(h.find('Suggestion Plumbing').props.accessibilityState.checked).toBe(false);
  expect(visible('Suggestion Electrical')).toContain('Primary');
  expect(h.owner.draft.primarySkillId).toBe(second); expect(h.owner.draft.additionalSkillIds).toEqual([]);
});

it('cannot invoke transport while reconciliation holds even if the panel is reached', async () => {
  const h = harness(false); h.owner.updateDraft({ description: 'Synthetic repair' });
  h.press('Ask Itik for skills'); await settle();
  expect(h.invoke).not.toHaveBeenCalled();
  expect(h.text()).toContain("Itik couldn't answer right now.");
});

const pngImage={mime_type:'image/png' as const,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='};
const draftPhoto={uri:'file:///photo',assetId:null,fileName:null,fileSize:20,pickerMimeType:'image/png'};
it('starts with nothing added and introduces the result as Itik\'s picks', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle(); expect(h.text()).toContain("Itik's picks"); expect(h.find('Suggestion Plumbing').props.accessibilityState.checked).toBe(false); expect(h.find('Suggestion Electrical').props.accessibilityState.checked).toBe(false); expect(h.owner.draft.primarySkillId).toBeNull(); });
it('requests from a selected photo alone using only request context, never the draft description', async () => { const h=harness(); h.owner.updateDraft({jobPhotos:[draftPhoto]}); expect(h.find('Ask Itik for skills').props.disabled).toBe(true); h.prepare.mockResolvedValue({ok:true,image:pngImage}); h.press('Use photo 1 for suggestions'); expect(h.find('Ask Itik for skills').props.disabled).toBe(false); h.press('Ask Itik for skills'); await settle(); expect(h.invoke).toHaveBeenCalledWith('skillmatch-ai',{body:{mode:'job_skill_suggestions',description:core.PHOTO_ONLY_REQUEST_CONTEXT,image:pngImage}}); expect(h.owner.draft.description).toBe(''); h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBe(first); expect(h.owner.draft.description).toBe(''); });
it('a blank description without a selected photo cannot request suggestions', async () => { const h=harness(); h.owner.updateDraft({jobPhotos:[draftPhoto]}); h.find('Ask Itik for skills').props.onPress(); await settle(); expect(h.prepare).not.toHaveBeenCalled(); expect(h.invoke).not.toHaveBeenCalled(); });
it('never replaces an existing skill: a tapped card is added after it', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',primarySkillId:second}); h.press('Ask Itik for skills'); await settle(); expect(h.find('Suggestion Electrical').props.accessibilityState.checked).toBe(true); h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBe(second); expect(h.owner.draft.additionalSkillIds).toEqual([first]); });
it('when two skills are already chosen, other cards cannot be added and say why', async () => { const h=harness(); const third='33333333-3333-4333-8333-333333333333'; h.replaceProps({...h.props,skills:[...h.props.skills,{id:third,skill_name:'Painting'}]}); h.owner.updateDraft({description:'Repair the pipe',primarySkillId:third,additionalSkillIds:[second]}); h.press('Ask Itik for skills'); await settle(); expect(h.find('Suggestion Plumbing').props.accessibilityState.disabled).toBe(true); h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBe(third); expect(h.owner.draft.additionalSkillIds).toEqual([second]); expect(h.text()).toContain('up to two skills'); });
it('shows an already chosen suggested skill as Added, and tapping it removes only that skill', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe',primarySkillId:first}); h.press('Ask Itik for skills'); await settle(); expect(h.find('Suggestion Plumbing').props.accessibilityState.checked).toBe(true); h.press('Suggestion Plumbing'); expect(h.owner.draft.primarySkillId).toBeNull(); });
it('a retained card callback cannot add a skill after the description is edited', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.press('Ask Itik for skills'); await settle(); const add=h.find('Suggestion Plumbing').props.onPress; h.authority.revision++; h.owner.updateDraft({description:'Paint the wall'}); h.render(); add(); expect(h.owner.draft.primarySkillId).toBeNull(); expect(h.find('Suggestion Plumbing')).toBeUndefined(); });
it('shows model explanations as display-only text without contact-like fragments', async () => { const h=harness(); h.owner.updateDraft({description:'Repair the pipe'}); h.invoke.mockResolvedValue({data:{...h.response,suggestions:[{skill_id:first,explanation:'Call 0917 123 4567 or www.example.com now'}]},error:null}); h.press('Ask Itik for skills'); await settle(); expect(h.text()).not.toContain('0917'); expect(h.text()).not.toContain('example.com'); expect(h.owner.draft.description).toBe('Repair the pipe'); });
