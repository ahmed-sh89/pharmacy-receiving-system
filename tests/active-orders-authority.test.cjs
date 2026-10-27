const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('cloud-workspace.js','utf8');
function fn(name){const at=source.indexOf(`function ${name}(`);assert(at>=0,name);return source.slice(source.slice(at-6,at)==='async '?at-6:at,source.indexOf('\n}',at)+2);}
const row=(revision=1,assigned=['A'])=>[{revision,manifest:{orderFiles:[{documentId:'A',rows:1}],orderData:[{itemCode:'1',orderedQty:12}],handheldScopeConfigured:true,handheldOrderNumbers:assigned}}];
function harness(rpc){
 const h={AuthState:{identityEpoch:1,user:{id:'u'},context:{pharmacy_id:'p'},session:{}},PharmFlowCloudWorkspace:{activeManifestReadSerial:0,activeManifestRevision:0,lastManifestFullReadAt:0},AppState:{workspace:{orderFiles:[],orderData:[],handheldOrderNumbers:[]}},navigator:{onLine:true},authRpc:rpc,Date,Promise,setTimeout,clearTimeout,Logger:{warn(){}},nowISO:()=> 'now',normalizeOrderNumber:v=>String(v||''),setCloudWorkspaceStatus(){},applyAuthoritativeEmptyActiveOrders(){h.AppState.workspace={orderFiles:[],orderData:[]};},applyActiveOrderManifest(manifest,revision){h.AppState.workspace=manifest;h.PharmFlowCloudWorkspace.activeManifestRevision=revision;return true;}};
 h.window=h;vm.createContext(h);for(const n of ['cloudWorkspacePharmacyId','activeOrderAuthorityScope','pullActiveOrderManifest'])vm.runInContext(fn(n),h);return h;
}
test('a synchronous permission rejection does not consume the 10-second read cooldown',async()=>{
 let requests=0;const h=harness(()=>{requests++;if(requests===1)throw Error('permissions still loading');return row();});assert.equal(await h.pullActiveOrderManifest(),false);assert.equal(h.PharmFlowCloudWorkspace.lastManifestFullReadAt,0);assert.equal(await h.pullActiveOrderManifest(),true);assert.equal(requests,2);assert.equal(h.AppState.workspace.orderFiles.length,1);
});
test('overlapping readers join one in-flight authority answer',async()=>{
 let resolve,requests=0;const h=harness(()=>{requests++;return new Promise(r=>resolve=r);});const one=h.pullActiveOrderManifest(),two=h.pullActiveOrderManifest({force:true});await new Promise(setImmediate);assert.equal(requests,1);resolve(row());assert.deepEqual(await Promise.all([one,two]),[true,true]);
});
for(const kind of ['pharmacy','user','logout'])test('late manifest answer cannot cross '+kind+' identity',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));const read=h.pullActiveOrderManifest();await new Promise(setImmediate);if(kind==='pharmacy')h.AuthState.context.pharmacy_id='other';if(kind==='user'){h.AuthState.identityEpoch++;h.AuthState.user.id='other';}if(kind==='logout')h.AuthState.session=null;resolve(row());assert.equal(await read,false);assert.equal(h.AppState.workspace.orderFiles.length,0);assert.equal(h.PharmFlowCloudWorkspace.activeManifestReadSerial,0);
});
test('an older overlapping read cannot roll back a newer confirmed assignment',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));const read=h.pullActiveOrderManifest();await new Promise(setImmediate);h.PharmFlowCloudWorkspace.activeManifestRevision=3;h.AppState.workspace=row(3,[])[0].manifest;resolve(row(2,['A']));assert.equal(await read,true);assert.deepEqual(h.AppState.workspace.handheldOrderNumbers,[]);assert.equal(h.PharmFlowCloudWorkspace.activeManifestRevision,3);
});
test('empty authority is applied and successful reads retain the normal bounded throttle',async()=>{
 let requests=0;const h=harness(()=>{requests++;return [];});await h.pullActiveOrderManifest({clearIfMissing:true});assert.equal(h.PharmFlowCloudWorkspace.lastManifestResponseEmpty,true);assert.equal(h.PharmFlowCloudWorkspace.manifestAuthorityScope,h.activeOrderAuthorityScope());await h.pullActiveOrderManifest();assert.equal(requests,1);
});
test('joining callers can request authoritative clearing on an already pending read',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.AppState.workspace=row()[0].manifest;const one=h.pullActiveOrderManifest();const two=h.pullActiveOrderManifest({clearIfMissing:true});await new Promise(setImmediate);resolve([]);await Promise.all([one,two]);assert.equal(h.AppState.workspace.orderFiles.length,0);
});

test('a pre-save empty read cannot erase a newer confirmed manifest',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));const read=h.pullActiveOrderManifest({clearIfMissing:true});await new Promise(setImmediate);h.PharmFlowCloudWorkspace.activeManifestRevision=3;h.AppState.workspace=row(3,[])[0].manifest;resolve([]);assert.equal(await read,true);assert.equal(h.AppState.workspace.orderFiles.length,1);
});
