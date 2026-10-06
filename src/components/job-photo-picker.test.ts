// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
type Props = Record<string, any>;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function all(tree:any, predicate:(x:any)=>boolean):any[] {
  if(Array.isArray(tree)) return tree.flatMap(x=>all(x,predicate));
  if(!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree)?[tree]:[]),...all(tree.props?.children,predicate)];
}
function harness(initial:Props={}) {
 const state:any[]=[]; let cursor=0; const cleanups:(()=>void)[]=[]; const effects:(()=>any)[]=[]; const layoutCleanups:(()=>void)[]=[]; const layoutEffects:(()=>any)[]=[]; let layouts:(()=>any)[]=[];
 const react={useState:(v:any)=>{const i=cursor++;if(!(i in state))state[i]=v;return[state[i],(n:any)=>state[i]=typeof n==='function'?n(state[i]):n];},useRef:(v:any)=>{const i=cursor++;return state[i]??(state[i]={current:v});},useLayoutEffect:(f:()=>any,deps?:unknown[])=>{const i=cursor++;if(deps===undefined){layouts.push(f);}else if(!(i in state)){state[i]=true;layoutEffects.push(f);layouts.push(()=>{const c=f();if(c)layoutCleanups.push(c);});}},useEffect:(f:()=>any)=>{const i=cursor++;if(!(i in state)){state[i]=true;effects.push(f);const c=f();if(c)cleanups.push(c);}}};
 const picker={requestMediaLibraryPermissionsAsync:vi.fn(async()=>({granted:true})),launchImageLibraryAsync:vi.fn(async()=>({canceled:false,assets:[{uri:'new'}]}))};
 const jsx=(type:any,props:Props)=>({type,props});
 const load=(file:string,modules:Props)=>{const exports:Props={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>{if(!(name in modules))throw Error(name);return modules[name];}});return exports;};
 const native={StyleSheet:{create:(s:any)=>s},Platform:{select:(v:Props)=>v.android??v.default},Pressable:'Pressable',Text:'Text',View:'View'};
 const theme=load('src/constants/theme.ts',{'react-native':native,'@/global.css':{}});
 const {JobPhotoPicker}=load('src/components/job-photo-picker.tsx',{react,'react-native':native,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-image':{Image:'Image'},'expo-image-picker':picker,'@/components/app-button':{AppButton:'AppButton'},'@/components/app-notice':{AppNotice:'AppNotice'},'@/constants/theme':theme});
 const props:Props={photos:[],error:null,ownerKey:'owner',resetEpoch:0,isOwnerCurrent:()=>true,onPhotosChange:vi.fn((photos:any)=>{props.photos=photos;}),onErrorChange:vi.fn((error:any)=>{props.error=error;}),...initial};
 const render=(commit=true)=>{cursor=0;layouts=[];const tree=JobPhotoPicker(props);if(commit)layouts.forEach(f=>f());return tree;};
 const choose=()=>all(render(),x=>x.type==='AppButton')[0].props.onPress();
 return{props,render,choose,picker,unmount:()=>{layoutCleanups.forEach(f=>f());cleanups.forEach(f=>f());},removeCommit:()=>layoutCleanups.forEach(f=>f()),replayEffects:()=>{layoutCleanups.splice(0).forEach(f=>f());cleanups.splice(0).forEach(f=>f());layoutEffects.forEach(f=>{const cleanup=f();if(cleanup)layoutCleanups.push(cleanup);});effects.forEach(f=>{const cleanup=f();if(cleanup)cleanups.push(cleanup);});}};
}
const photo=(uri:string)=>({uri,assetId:null,fileName:null,fileSize:null,pickerMimeType:null});
it('displays the controlled retained photos and reorders/removes their original metadata',()=>{
 const h=harness({photos:[photo('first'),photo('second')],error:'retained error'});
 expect(all(h.render(),x=>x.type==='Image').map(x=>x.props.source.uri)).toEqual(['first','second']);
 all(h.render(),x=>x.props?.accessibilityLabel==='Move photo 2 earlier')[0].props.onPress();
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['second','first']);
 all(h.render(),x=>x.props?.accessibilityLabel==='Remove job photo 1')[0].props.onPress();
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['first']);
 expect(h.props.error).toBeNull();
});
it('appends gallery selection in order with original options and metadata',async()=>{
 const h=harness({photos:[photo('existing')]});h.choose(); await flush();await flush();await flush();
 expect(h.picker.launchImageLibraryAsync).toHaveBeenCalledWith({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:2,allowsEditing:false,legacy:false});
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['existing','new']);
});
it.each(['unmount','owner','reset','disabled','photos','authorization'])('rejects delayed permission after %s',async(kind)=>{
 const h=harness();let complete:any;h.picker.requestMediaLibraryPermissionsAsync.mockImplementation(()=>new Promise(r=>{complete=r;}));h.choose();
 if(kind==='unmount')h.unmount();if(kind==='owner')h.props.ownerKey='other';if(kind==='reset')h.props.resetEpoch++;
 if(kind==='disabled')h.props.disabled=true;if(kind==='photos')h.props.photos=[photo('newer')];if(kind==='authorization')h.props.isOwnerCurrent=()=>false;
 if(kind!=='unmount')h.render();complete({granted:true});await flush();await flush();
 expect(h.picker.launchImageLibraryAsync).not.toHaveBeenCalled();expect(h.props.onPhotosChange).not.toHaveBeenCalled();
});
it('a newer request wins over a stale gallery completion',async()=>{
 const h=harness();const resolves:any[]=[];h.picker.launchImageLibraryAsync.mockImplementation(()=>new Promise(r=>resolves.push(r)));
 h.choose();await flush();h.choose();await flush();
 resolves[1]({canceled:false,assets:[{uri:'newest'}]});await flush();await flush();h.render();
 resolves[0]({canceled:false,assets:[{uri:'stale'}]});await flush();await flush();
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['newest']);
});
it('cancellation and permission denial preserve selected photos and existing permission copy',async()=>{
 const h=harness({photos:[photo('existing')]});h.picker.launchImageLibraryAsync.mockResolvedValue({canceled:true,assets:[]} as any);h.choose();await flush();await flush();
 expect(h.props.onPhotosChange).not.toHaveBeenCalled();h.picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({granted:false});h.choose();await flush();await flush();
 expect(h.props.error).toBe('Allow photo-library access to select job photos.');expect(h.props.photos[0].uri).toBe('existing');
});

it.each(['unmount','owner','reset','disabled','photos','authorization'])('rejects delayed gallery result after %s',async(kind)=>{
 const h=harness();let complete:any;h.picker.launchImageLibraryAsync.mockImplementation(()=>new Promise(r=>{complete=r;}));h.choose();await flush();
 if(kind==='unmount')h.unmount();if(kind==='owner')h.props.ownerKey='other';if(kind==='reset')h.props.resetEpoch++;
 if(kind==='disabled')h.props.disabled=true;if(kind==='photos')h.props.photos=[photo('newer')];if(kind==='authorization')h.props.isOwnerCurrent=()=>false;
 if(kind!=='unmount')h.render();complete({canceled:false,assets:[{uri:'stale'}]});await flush();
 expect(h.props.onPhotosChange).not.toHaveBeenCalled();
});
it('invalid or excessive gallery metadata leaves the controlled selection untouched',async()=>{
 const h=harness({photos:[photo('existing')]});
 for(const assets of [[{uri:''}],[{uri:'a'},{uri:'b'},{uri:'c'}]]){
  h.picker.launchImageLibraryAsync.mockResolvedValue({canceled:false,assets} as any);h.choose();await flush();
  expect(h.props.onPhotosChange).not.toHaveBeenCalled();expect(h.props.error).toBeTruthy();
 }
});


it('does not revoke a committed gallery operation because an uncommitted render had different props', async () => {
 const h=harness(); let resolvePermission!:(value:any)=>void;
 const permission=new Promise<any>(resolve=>{resolvePermission=resolve;});
 h.picker.requestMediaLibraryPermissionsAsync.mockImplementation(()=>permission);
 h.choose(); h.props.ownerKey='abandoned-render-owner'; h.render(false); h.props.ownerKey='owner';
 resolvePermission({granted:true});
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['new']);
});
it('effect cleanup and replay rejects old work while allowing a new picker operation', async () => {
 const h=harness(); let resolvePermission!:(value:any)=>void;
 const permission=new Promise<any>(resolve=>{resolvePermission=resolve;});
 h.picker.requestMediaLibraryPermissionsAsync.mockImplementationOnce(()=>permission);
 h.choose(); h.replayEffects(); resolvePermission({granted:true});
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.picker.launchImageLibraryAsync).not.toHaveBeenCalled();
 h.choose(); for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
 expect(h.props.photos.map((p:any)=>p.uri)).toEqual(['new']);
});

it('revokes queued gallery publication at removal commit before passive cleanup', async () => {
 const h=harness(); let resolveGallery!:(value:any)=>void, markStarted!:()=>void;
 const started=new Promise<void>(resolve=>{markStarted=resolve;});
 const gallery=new Promise<any>(resolve=>{resolveGallery=resolve;});
 h.picker.launchImageLibraryAsync.mockImplementation(()=>{markStarted();return gallery;});
 h.choose(); await started;
 resolveGallery({canceled:false,assets:[{uri:'late-after-removal'}]});
 h.removeCommit(); // The account draft still exists; passive effects have not run.
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.props.onPhotosChange).not.toHaveBeenCalled();
 expect(h.props.onErrorChange).toHaveBeenCalledTimes(1);
});


it.each(['permission', 'gallery'] as const)('keeps a pending %s operation revoked after committed blur and refocus', async boundary => {
 let focused=true; const h=harness({isOwnerCurrent:()=>focused});
 let resolvePending!:(value:any)=>void, markStarted!:()=>void;
 const pending=new Promise<any>(resolve=>{resolvePending=resolve;});
 const started=new Promise<void>(resolve=>{markStarted=resolve;});
 if(boundary==='permission') h.picker.requestMediaLibraryPermissionsAsync.mockImplementation(()=>{markStarted();return pending;});
 else h.picker.launchImageLibraryAsync.mockImplementation(()=>{markStarted();return pending;});
 h.choose(); await started;
 focused=false; h.render(); // Blur commits while the screen and account draft remain mounted.
 focused=true; h.render(); // Refocus must not revive the prior picker transaction.
 resolvePending(boundary==='permission'?{granted:true}:{canceled:false,assets:[{uri:'stale-before-blur'}]});
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.picker.launchImageLibraryAsync).toHaveBeenCalledTimes(boundary==='permission'?0:1);
 expect(h.props.onPhotosChange).not.toHaveBeenCalled();
 expect(h.props.onErrorChange).toHaveBeenCalledTimes(1);
});
it.each(['permission', 'gallery'] as const)('fails closed when the committed owner guard throws during pending %s', async boundary => {
 let broken=false; const h=harness({isOwnerCurrent:()=>{if(broken)throw Error('private-owner-error');return true;}});
 let resolvePending!:(value:any)=>void, markStarted!:()=>void;
 const pending=new Promise<any>(resolve=>{resolvePending=resolve;});
 const started=new Promise<void>(resolve=>{markStarted=resolve;});
 if(boundary==='permission') h.picker.requestMediaLibraryPermissionsAsync.mockImplementation(()=>{markStarted();return pending;});
 else h.picker.launchImageLibraryAsync.mockImplementation(()=>{markStarted();return pending;});
 h.choose(); await started;
 broken=true; expect(()=>h.render()).not.toThrow();
 broken=false; h.render();
 resolvePending(boundary==='permission'?{granted:true}:{canceled:false,assets:[{uri:'stale-before-error'}]});
 for(let i=0;i<10;i++)await Promise.resolve();
 expect(h.picker.launchImageLibraryAsync).toHaveBeenCalledTimes(boundary==='permission'?0:1);
 expect(h.props.onPhotosChange).not.toHaveBeenCalled();
 expect(h.props.onErrorChange).toHaveBeenCalledTimes(1);
});
