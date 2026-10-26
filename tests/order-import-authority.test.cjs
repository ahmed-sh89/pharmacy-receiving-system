const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/excel.js','utf8').split('/* Publish one structural UI update')[0];
function fixture(){
    const auth={identityEpoch:1,user:{id:'user-a'},session:{access_token:'fixture'},context:{user_id:'user-a',pharmacy_id:'pharmacy-a'},mustChangePassword:false};
    let grants=0;
    const gate={whenReady:async()=>null,state:()=> 'ready',require:(mod,write)=>{assert.equal(mod,'RECEIVING');assert.equal(write,true);grants++;}};
    const c={AuthState:auth,window:{PharmFlowPermissions:gate}};vm.createContext(c);vm.runInContext(source,c);
    return {c,auth,gate,key:c.orderImportScopeKey(),get grants(){return grants;}};
}
test('pending permission read finishes before any grant; no extra load/RPC is created',async()=>{
    const h=fixture();let resolve;h.gate.whenReady=()=>new Promise(r=>resolve=r);h.gate.state=()=> 'loading';
    const pending=h.c.waitForOrderImportAccess(h.key);assert.equal(h.grants,0);h.gate.state=()=> 'ready';resolve();await pending;assert.equal(h.grants,1);
});
test('denied and unavailable permissions fail closed',async()=>{
    const h=fixture();h.gate.require=()=>{throw Error('RECEIVING: modification is not permitted');};
    await assert.rejects(h.c.waitForOrderImportAccess(h.key),/not permitted/);
    h.c.window.PharmFlowPermissions=null;await assert.rejects(h.c.waitForOrderImportAccess(h.key),/Permissions are unavailable/);
});
for(const kind of ['user','pharmacy','logout','password'])test('pending selection cannot cross '+kind+' change',async()=>{
    const h=fixture();let resolve;h.gate.whenReady=()=>new Promise(r=>resolve=r);
    const pending=h.c.waitForOrderImportAccess(h.key);
    if(kind==='user'){h.auth.user.id='user-b';h.auth.identityEpoch++;}
    if(kind==='pharmacy')h.auth.context.pharmacy_id='pharmacy-b';
    if(kind==='logout'){h.auth.session=null;h.auth.identityEpoch++;}
    if(kind==='password')h.auth.mustChangePassword=true;
    resolve();await assert.rejects(pending,/Sign-in or pharmacy changed/);assert.equal(h.grants,0);
});
test('same identity token refresh is allowed, while logout/login to same identity is fenced',async()=>{
    const h=fixture();h.auth.session.access_token='refreshed-fixture';await h.c.waitForOrderImportAccess(h.key);assert.equal(h.grants,1);
    h.auth.identityEpoch++;await assert.rejects(h.c.waitForOrderImportAccess(h.key),/changed/);assert.equal(h.grants,1);
});
test('superseding checks are awaited without granting stale authority or unbounded looping',async()=>{
    const h=fixture();let n=0;h.gate.whenReady=async()=>{n++;};h.gate.state=()=>n<2?'loading':'ready';await h.c.waitForOrderImportAccess(h.key);assert.equal(n,2);assert.equal(h.grants,1);
    n=0;h.gate.state=()=> 'loading';h.gate.require=()=>{throw Error('not permitted');};await assert.rejects(h.c.waitForOrderImportAccess(h.key),/not permitted/);assert.equal(n,3);
});
