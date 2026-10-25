const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync('js/permissions.js','utf8');
const good=(pid='p',extra={})=>({pharmacy_id:pid,receiving:'FULL',expiry:'FULL',data_access:'PHARMACY_ONLY',system_administrator:false,...extra});
const tick=()=>new Promise(r=>setImmediate(r));
function harness(rpc=async()=>good()){
 const {document}=parseHTML('<html><body><main class="mainContent"><section id="page-receiving"><input id="barcodeInput" value="UNSAVED"></section></main><a data-page="receiving"></a><a data-page="expiry"></a><a data-page="settings"></a></body></html>');
 const window={CustomEvent:class{constructor(type){this.type=type;}}};
 const listeners={},timers=new Map();let clock=100000,id=0,calls=0;
 const auth={identityEpoch:0,context:{pharmacy_id:'p',user_id:'u',member_role:'admin'},user:{id:'u'},session:{access_token:'token'},mustChangePassword:false};
 const c={window,document,AuthState:auth,navigator:{onLine:true},MutationObserver:class{observe(){}},queueMicrotask,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n),Date:{now:()=>clock},CustomEvent:window.CustomEvent,
  authRpc:async(...args)=>{calls++;return rpc(...args);},AppRouter:{currentRoute:'receiving'},navigateTo:route=>{c.AppRouter.currentRoute=route;},prepareAuthSessionForPermissions:async()=>{}};
 // Keep listener dispatch explicit and synchronous, independently of DOM mocks.
 window.addEventListener=(type,fn)=>(listeners['w:'+type]??=[]).push(fn);
 window.dispatchEvent=event=>{for(const fn of listeners['w:'+event.type]||[])fn(event);return true;};
 document.addEventListener=(type,fn)=>(listeners['d:'+type]??=[]).push(fn);
 Object.defineProperty(document,'visibilityState',{value:'visible',writable:true});
 vm.createContext(c);vm.runInContext(source,c);const p=window.PharmFlowPermissions;
 return {c,p,auth,document,timers,listeners,get calls(){return calls;},event(type,doc=false){for(const fn of listeners[(doc?'d:':'w:')+type]||[])fn({type});},advance(ms){clock+=ms;},async retry(){const [key,t]=timers.entries().next().value;timers.delete(key);clock+=t.ms;t.fn();await tick();}};
}
test('offline then online restores all authorized navigation, current page and unsaved input without reload',async()=>{
 const h=harness();await h.p.load();assert.equal(h.p.allowed('RECEIVING',true),true);
 h.c.navigator.onLine=false;h.event('offline');assert.equal(h.p.allowed('RECEIVING'),false);assert.equal(h.p.state(),'unavailable');assert.equal(h.c.AppRouter.currentRoute,'receiving');
 h.c.navigator.onLine=true;h.event('online');await tick();assert.equal(h.p.state(),'ready');assert.equal(h.calls,2);assert.equal(h.document.querySelector('[data-page="expiry"]').classList.contains('permissionHidden'),false);assert.equal(h.c.AppRouter.currentRoute,'receiving');assert.equal(h.document.getElementById('barcodeInput').value,'UNSAVED');
});
test('visibility wake, pageshow and focus share a single pending read and restore an initially failed state',async()=>{
 let finish;const h=harness(()=>new Promise(r=>finish=r));
 h.event('visibilitychange',true);h.event('focus');h.event('pageshow');await tick();assert.equal(h.calls,1);assert.equal(h.p.state(),'loading');assert.equal(h.p.allowed('RECEIVING'),false);finish(good());await tick();assert.equal(h.p.state(),'ready');h.event('focus');await tick();assert.equal(h.calls,1);
});
test('transient failed request retries with finite backoff and recovers without focus',async()=>{
 let n=0;const h=harness(async()=>{if(++n<3)throw Error('offline');return good();});
 await assert.rejects(h.p.load());assert.equal(h.p.state(),'unavailable');assert.equal(h.timers.size,1);await h.retry();assert.equal(h.timers.size,1);await h.retry();assert.equal(h.p.state(),'ready');assert.equal(h.timers.size,0);assert.equal(h.calls,3);
});
test('retry budget is bounded; events during backoff cannot cause request storms',async()=>{
 const h=harness(async()=>{throw Error('offline');});await assert.rejects(h.p.load());for(let i=0;i<10;i++){h.advance(2000);h.event('focus');}assert.equal(h.calls,1);
 for(let i=0;i<3;i++)await h.retry();assert.equal(h.calls,4);assert.equal(h.timers.size,0);
});
for(const lateFails of [true,false])test('pre-sleep '+(lateFails?'failure':'success')+' cannot replace a newer response',async()=>{
 let resolve,reject,n=0;const h=harness(()=>++n===1?new Promise((r,j)=>{resolve=r;reject=j;}):Promise.resolve(good()));
 const old=h.p.load().catch(()=>null);await tick();h.advance(60000);await h.p.resume();assert.equal(h.p.state(),'ready');if(lateFails)reject(Error('late timeout'));else resolve(good('p',{receiving:'DISABLED'}));await old;assert.equal(h.p.allowed('RECEIVING'),true);assert.equal(h.timers.size,0);
});
test('same pharmacy different identity and logout/login epoch cannot adopt an old response',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));const old=h.p.load();await tick();h.p.clear();h.auth.identityEpoch++;h.auth.user.id='other';h.auth.context.user_id='other';resolve(good());await old;assert.equal(h.p.snapshot(),null);assert.equal(h.p.allowed('RECEIVING'),false);
});
test('unauthenticated or forced password sessions never issue a permission request',async()=>{
 const h=harness();h.auth.session=null;await h.p.load();assert.equal(h.p.state(),'unauthenticated');assert.equal(h.calls,0);h.auth.session={};h.auth.mustChangePassword=true;await h.p.load();assert.equal(h.p.allowed('GLOBAL'),false);assert.equal(h.calls,0);
});
test('definitive denial fails closed without retry; restricted server policy does not elevate operator',async()=>{
 const h=harness(async()=>{throw Object.assign(Error('denied'),{httpStatus:403,serverRejected:true});});await assert.rejects(h.p.load());assert.equal(h.timers.size,0);assert.equal(h.p.allowed('EXPIRY'),false);
 const restricted=harness(async()=>good('p',{receiving:'DISABLED',expiry:'READ_ONLY',data_access:'READ_ONLY'}));restricted.auth.context.member_role='staff';await restricted.p.load();assert.equal(restricted.p.allowed('RECEIVING'),false);assert.equal(restricted.p.allowed('EXPIRY'),true);assert.equal(restricted.p.allowed('EXPIRY',true),false);assert.equal(restricted.p.allowed('GLOBAL',true),false);assert.equal(restricted.c.AppRouter.currentRoute,'expiry');
});
test('malformed or foreign permission response is never a permission grant',async()=>{
 for(const row of [null,{},good('foreign')]){const h=harness(async()=>row);await assert.rejects(h.p.load());assert.equal(h.p.snapshot(),null);assert.equal(h.p.allowed('DATA'),false);}
});
test('recovery uses existing refresh mechanism only when stale, distinguishes transient failure from expired auth',async()=>{
 const authSource=fs.readFileSync('js/auth.js','utf8');const fn=authSource.slice(authSource.indexOf('async function prepareAuthSessionForPermissions()'),authSource.indexOf('\n\nfunction getAuthContextScope'));
 let stale=false,count=0;const c={AuthState:{session:{}},isRestoredAccessTokenStale:()=>stale,refreshAuthToken:async()=>{count++;return true;}};vm.createContext(c);vm.runInContext(fn,c);await c.prepareAuthSessionForPermissions();assert.equal(count,0);stale=true;await c.prepareAuthSessionForPermissions();assert.equal(count,1);c.refreshAuthToken=async()=>false;await assert.rejects(c.prepareAuthSessionForPermissions());assert.ok(c.AuthState.session);c.AuthState.session=null;await assert.rejects(c.prepareAuthSessionForPermissions(),/sign in/);
});
test('unavailable permissions cannot erase the Receiving workspace at the startup authority boundary',async()=>{
 const cloud=fs.readFileSync('cloud-workspace.js','utf8');const start=cloud.indexOf('async function ensureStartupCloudAuthority()'),end=start+1+cloud.slice(start+1).search(/^(?:async )?function /m);const fn=cloud.slice(start,end);
 const workspace={orderFiles:[{id:'retained'}],draft:'UNSAVED'},archive={orders:['retained'],transactions:['retained']};
 const c={window:{PharmFlowPermissions:{allowed:()=>false,snapshot:()=>null}},AppState:{workspace,archive},ensureCloudAccountContextIsolation(){throw Error('must not reset');}};vm.createContext(c);vm.runInContext(fn,c);assert.equal(await c.ensureStartupCloudAuthority(),false);assert.equal(c.AppState.workspace,workspace);assert.equal(c.AppState.archive,archive);
});
test('lifecycle listeners are registered once; no page reload in recovery',()=>{
 const h=harness();for(const name of ['focus','pageshow','online','offline'])assert.equal(h.listeners['w:'+name].length,1);assert.equal(h.listeners['d:visibilitychange'].length,1);assert.doesNotMatch(source,/location\.reload/);
});
test('idle guard defers recovery until explicit in-app resume; no duplicate idle-resume listener',async()=>{
 const h=harness();await h.p.load();h.c.window.PharmFlowIdleSleep={active:true};h.event('focus');await h.p.load();assert.equal(h.calls,1);h.c.window.PharmFlowIdleSleep.active=false;h.event('pharmflow:idle-resume');await tick();assert.equal(h.calls,2);assert.equal(h.p.state(),'ready');assert.equal(h.listeners['w:pharmflow:idle-resume'].length,1);
});
test('System Administrator projection is revalidated and cannot leak into another identity',async()=>{
 const h=harness(async()=>good('p',{system_administrator:true}));await h.p.load();assert.equal(h.p.allowed('GLOBAL',true),true);h.auth.user={id:'operator'};assert.equal(h.p.allowed('GLOBAL',true),false);assert.throws(()=>h.p.checkRpc('append_pharmflow_receiving_action_v4'),/not permitted/);
});
