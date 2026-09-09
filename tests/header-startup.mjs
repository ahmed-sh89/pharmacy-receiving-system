import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
let fixture=fs.readFileSync(new URL('receiving-authority-postfix.mjs',import.meta.url),'utf8').split('const passed=[];')[0];
fixture=fixture.replace("new URL('../',import.meta.url)",`new URL(${JSON.stringify(root.href)})`);
const {client}=await import('data:text/javascript;base64,'+Buffer.from(fixture+'\nexport {client};\n//# sourceURL=offline-header-fixture.mjs').toString('base64'));
const current=fs.readFileSync(new URL('js/ui.js',root),'utf8');
const released=execFileSync('git',['show','0e36a0ef2c2f36b2fcd1fa1b3874cd9da47ef9a6:js/ui.js'],{encoding:'utf8'});
const fn=(source,name)=>source.match(new RegExp('function '+name+'\\([^]*?^}', 'm'))[0];
function setup(source,orders,missing=false){
    const c=client();c.seed([],orders);
    if(!orders.length)c.run('AppState.workspace=createEmptyWorkspace();rebuildStateIndexes();');
    const label={hidden:false,textContent:''},picker={hidden:true},pickerLabel={textContent:''},session={};
    const elements={headerOrderId:missing?null:label,headerOrderPicker:picker,headerOrderPickerLabel:pickerLabel,headerSessionId:session};
    c.ctx.document.getElementById=id=>elements[id]||null;
    c.run('const UI={elements:{}};');
    for(const name of ['setElementText','cacheUIElements','refreshHeader','refreshEntireUI'])c.run(fn(source,name));
    // Run the actual refresh entry point and header; unrelated renderers are inert.
    for(const name of ['refreshSafeAccountIdentity','refreshDashboard','refreshProgress','refreshLastScan',
        'refreshReceivingTable','refreshFileLists','refreshMasterGTINUI','refreshHealthSummary','refreshSessionUI',
        'refreshArchiveUI','refreshOpenOrderStatusReport','ensurePcClearScreenButton'])c.run(`${name}=()=>{};`);
    return {c,label,picker,pickerLabel,session};
}
for(const orders of [[],['SYNTHETIC-A'],['SYNTHETIC-A','SYNTHETIC-B']]){
    const old=setup(released,orders);
    assert.throws(()=>old.c.run('refreshEntireUI()'),/Cannot set properties of undefined/);
    const {c,label,picker,pickerLabel,session}=setup(current,orders);
    c.run('refreshEntireUI()');
    assert.equal(label.hidden,orders.length>1);
    assert.equal(picker.hidden,orders.length<=1);
    if(orders.length<=1)assert.equal(label.textContent,orders[0]||'No Active Order');
    else assert.equal(pickerLabel.textContent,'All Orders');
    c.run('cacheUIElements();refreshHeader();');
    assert.equal(session.textContent,orders.length?'LOCAL':'INACTIVE');
    const absent=setup(current,orders,true);absent.c.run('refreshEntireUI();cacheUIElements();refreshHeader();');
}
const reset=setup(current,['SYNTHETIC-A']);
reset.c.run("AuthState.context.user_id='OTHER';ensureCloudAccountContextIsolation();");
assert.equal(reset.label.textContent,'No Active Order');
assert.equal(reset.c.run('AppState.workspace.receivingHistory.length'),0);
// Exercise both authority read paths with the real early header renderer.
const live=setup(current,['SYNTHETIC-A']);
const manifest=JSON.parse(live.c.run('JSON.stringify(serializeActiveOrderManifest())'));
live.c.run('navigator.onLine=true;');
live.c.setRpc(async name=>{
    if(name==='get_pharmflow_active_order_manifest_v3')return {manifest,revision:10};
    if(name==='list_pharmflow_cloud_transactions_v2')return [{transactionId:'scan',itemCode:'X',orderId:'SYNTHETIC-A',quantity:11}];
    throw Error('Unexpected RPC '+name);
});
assert.equal(await live.c.run('pullActiveOrderManifest()'),true);
assert.equal(await live.c.run('pullCloudWorkspaceTransactions()'),true);
assert.equal(live.c.sample().qty,11);
console.log('PASS: release exception reproduced; early/cached/missing header, empty/single/multiple orders, account reset, manifest and ledger refresh');
