const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('cloud-workspace.js','utf8');const start=src.indexOf('async function setHandheldAssignedOrderNumbers(');const code=src.slice(start,src.indexOf('\n}',start)+2);
function harness(){
 const h={scope:'one',AppState:{workspace:{handheldOrderNumbers:['A'],handheldScopeConfigured:true}},activeOrderAuthorityScope:()=>h.scope,PharmFlowPermissions:{require(){return true;}},deepClone:v=>JSON.parse(JSON.stringify(v)),getActiveReceivingOrderNumbers:()=>['A','B','C'],prepareActiveOrderManifestWrite:async()=>true,saveWorkspaceSnapshot(){},saveActiveOrderManifest:async()=>{h.sent=[...h.AppState.workspace.handheldOrderNumbers];return true;}};h.window=h;vm.createContext(h);vm.runInContext(code,h);return h;
}
test('a queued delta merges fresh authority and preserves unrelated assignments',async()=>{
 const h=harness();h.prepareActiveOrderManifestWrite=async()=>{h.AppState.workspace.handheldOrderNumbers=['A','C'];return true;};assert.equal(await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'B',assigned:true}]}),true);assert.deepEqual(h.sent,['A','C','B']);
});
test('a removal changes only its target and allows the configured last order to be removed',async()=>{
 const h=harness();h.AppState.workspace.handheldOrderNumbers=['A','B'];await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'B',assigned:false}]});assert.deepEqual(h.sent,['A']);await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'A',assigned:false}]});assert.deepEqual(h.sent,[]);assert.equal(h.AppState.workspace.handheldScopeConfigured,true);
});
test('failed target save retains the fresh authoritative state of unrelated orders',async()=>{
 const h=harness();h.prepareActiveOrderManifestWrite=async()=>{h.AppState.workspace.handheldOrderNumbers=['A','C'];return true;};h.saveActiveOrderManifest=async()=>false;assert.equal(await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'B',assigned:true}]}),false);assert.deepEqual(JSON.parse(JSON.stringify(h.AppState.workspace.handheldOrderNumbers)),['A','C']);
});
test('revision-conflict recovery is never overwritten by a previous browser snapshot',async()=>{
 const h=harness();h.saveActiveOrderManifest=async()=>{h.AppState.workspace.handheldOrderNumbers=['C'];return false;};await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'B',assigned:true}]});assert.deepEqual(h.AppState.workspace.handheldOrderNumbers,['C']);
});
test('identity change during preparation prevents any proposed mutation',async()=>{
 const h=harness();let saves=0;h.prepareActiveOrderManifestWrite=async()=>{h.scope='other';return true;};h.saveActiveOrderManifest=async()=>{saves++;return true;};assert.equal(await h.setHandheldAssignedOrderNumbers([],{changes:[{orderNumber:'B',assigned:true}]}),false);assert.equal(saves,0);assert.deepEqual(h.AppState.workspace.handheldOrderNumbers,['A']);
});
for(const changes of [[{orderNumber:'FOREIGN',assigned:true}],[{orderNumber:'B',assigned:'true'}],[]])test('invalid/inactive/empty change request cannot be acknowledged',async()=>{
 const h=harness();let saves=0;h.saveActiveOrderManifest=async()=>{saves++;return true;};assert.equal(await h.setHandheldAssignedOrderNumbers([],{changes}),false);assert.equal(saves,0);assert.deepEqual(h.AppState.workspace.handheldOrderNumbers,['A']);
});
test('legacy full-list callers retain the existing API and explicit empty scope',async()=>{
 const h=harness();await h.setHandheldAssignedOrderNumbers(['B']);assert.deepEqual(h.sent,['B']);await h.setHandheldAssignedOrderNumbers([]);assert.deepEqual(h.sent,[]);
});
