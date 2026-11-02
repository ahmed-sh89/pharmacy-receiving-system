const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const read=p=>process.env.P1_RUNTIME_REF?cp.execFileSync('git',['show',process.env.P1_RUNTIME_REF+':'+p],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
const cloud=read('cloud-workspace.js'),hh=read('js/handheld-runtime.js');
function fn(s,n){const at=s.indexOf('function '+n+'(');assert(at>=0,n);return (s.slice(at-6,at)==='async '?'async ':'')+s.slice(at,s.indexOf('\n}',at)+2);}
function fixture(){
 const events=[],queue=[],c={AuthState:{identityEpoch:1,session:{access_token:'synthetic'},user:{id:'u'},context:{pharmacy_id:'p'},mustChangePassword:false},AppState:{workspace:{orderFiles:[{documentId:'ORDER-A'}],orderData:[{itemCode:'A',orderedQty:12}],receivingHistory:[]}},HandheldRuntime:{receivingBusy:false},permissionsAllowed:true,
 cleanScannerInput:s=>String(s).trim(),parseGS1Barcode:s=>({raw:s,gtin:s}),hhSetVisualState(){},showToast:s=>events.push(s),Logger:{error(){}},setTimeout:()=>0,hhRefreshReadyState(){},hhFocusActiveScanner(){}};
 c.window=c;vm.createContext(c);
 vm.runInContext(cloud.slice(cloud.indexOf('const PharmFlowCloudWorkspace ='),cloud.indexOf('\nfunction cloudWorkspacePharmacyId')),c);
 for(const n of ['cloudWorkspacePharmacyId','activeOrderAuthorityScope','getReceivingHydrationState'])vm.runInContext(fn(cloud,n),c);
 for(const n of ['hhReceivingSessionReady','hhProcessReceiving'])vm.runInContext(fn(hh,n),c);
 c.PharmFlowPermissions={allowed:()=>c.permissionsAllowed};c.PharmFlowReceivingScanQueue={enqueue:async(raw,parsed)=>{queue.push(raw);return {accepted:true}}};
 vm.runInContext(`Object.assign(PharmFlowCloudWorkspace,{startupAuthorityReady:true,hydratedPharmacyId:'p',startupAuthorityScope:activeOrderAuthorityScope(),manifestAuthorityScope:activeOrderAuthorityScope(),receivingAuthorityScope:activeOrderAuthorityScope(),activeManifestPresent:true});`,c);
 return {c,events,queue,setCloud:code=>vm.runInContext('Object.assign(PharmFlowCloudWorkspace,'+code+');',c)};
}
test('classic-script const authority is not a window property; Zebra uses the same ready state as Desktop',()=>{const h=fixture();assert.equal(h.c.window.PharmFlowCloudWorkspace,undefined);assert.equal(h.c.getReceivingHydrationState(),'READY');assert.equal(h.c.hhReceivingSessionReady(),true)});
test('selected order and multiple Zebra items enter the normal queue exactly once per scan',async()=>{const h=fixture();for(const s of ['0123456789012','U0030','0123456789012'])assert.equal((await h.c.hhProcessReceiving(s,{value:s})).accepted,true);assert.deepEqual(h.queue,['0123456789012','U0030','0123456789012']);assert.equal(h.events.length,0);assert.equal(h.c.AppState.workspace.orderFiles[0].documentId,'ORDER-A')});
for(const [name,change] of [
 ['startup incomplete',h=>h.setCloud('{startupAuthorityReady:false}')],
 ['wrong pharmacy',h=>h.setCloud("{hydratedPharmacyId:'other'}")],
 ['stale manifest scope',h=>h.setCloud("{manifestAuthorityScope:'old'}")],
 ['stale ledger scope',h=>h.setCloud("{receivingAuthorityScope:'old'}")],
 ['hydration error',h=>h.setCloud("{startupAuthorityError:'failed'}")],
 ['context switch',h=>h.setCloud('{contextSwitching:true}')],
 ['permission denied',h=>h.c.permissionsAllowed=false],
 ['logged out',h=>h.c.AuthState.session=null],
 ['mandatory password',h=>h.c.AuthState.mustChangePassword=true],
 ['another account',h=>h.c.AuthState.user.id='other'],
 ['same account re-login',h=>h.c.AuthState.identityEpoch++],
 ['missing context',h=>h.c.AuthState.context=null]
])test(name+' cannot enqueue or create a Receiving transaction',async()=>{const h=fixture();change(h);assert.equal(h.c.hhReceivingSessionReady(),false);assert.equal(await h.c.hhProcessReceiving('0123456789012',{value:'scan'}),false);assert.equal(h.queue.length,0);assert.equal(h.c.AppState.workspace.receivingHistory.length,0)});
test('authoritative empty workspace still permits approved Unassigned capture',async()=>{const h=fixture();h.setCloud('{activeManifestPresent:false,lastManifestResponseEmpty:true}');h.c.AppState.workspace.orderFiles=[];h.c.AppState.workspace.orderData=[];assert.equal(h.c.getReceivingHydrationState(),'EMPTY');assert.equal(h.c.hhReceivingSessionReady(),true);await h.c.hhProcessReceiving('0123456789012',{value:'scan'});assert.equal(h.queue.length,1)});
test('ordinary token rotation keeps matching authority, order and pending Receiving state',()=>{const h=fixture();const before=JSON.stringify(h.c.AppState);h.c.AuthState.session={access_token:'rotated'};assert.equal(h.c.hhReceivingSessionReady(),true);assert.equal(JSON.stringify(h.c.AppState),before)});
test('missing authority function fails closed',()=>{const h=fixture();h.c.getReceivingHydrationState=undefined;assert.equal(h.c.hhReceivingSessionReady(),false)});
