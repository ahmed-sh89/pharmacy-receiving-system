'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/receiving-release.js','utf8');
const part=source.slice(source.indexOf('window.PharmFlowClassificationFilters='),source.indexOf('// Existing workspace notifications'));
function harness(rpc=async()=>[{item_code:'1056889',group_name:'HomeHealth'}]){
 const c={window:{},AuthState:{context:{pharmacy_id:'A'},user:{id:'U'}},normalizeItemCode:v=>String(v||'').trim().toUpperCase().replace(/^0+(?=\d)/,''),authRpc:rpc};vm.createContext(c);vm.runInContext(part,c);return c;
}
test('Item Code projection supplies Group without a barcode and never mutates uploaded rows or quantities',async()=>{
 const c=harness(),g=c.window.PharmFlowClassificationFilters,p=c.window.PharmFlowReceivingGroups;
 const rows=[{itemCode:'1056889',group_name:'',orderedQty:9,receivedQty:4},{itemCode:'1056889',Group:'Beauty'},{itemCode:'1056889',group_name:'unapproved original',category:''}];
 const before=JSON.stringify(rows);await p.refresh(rows,'V1');
 assert.equal(g.normalizeReceiving(rows[0]).group,'HomeHealth');assert.equal(g.displayGroup(g.normalizeReceiving(rows[0]).group),'Home Health');
 assert.equal(g.normalizeReceiving(rows[1]).group,'Beauty');assert.equal(g.normalizeReceiving({itemCode:'1056889',group_name:'   ',Group:'Beauty'}).group,'Beauty');assert.equal(g.normalizeReceiving(rows[2]).group,'');
 assert.equal(JSON.stringify(rows),before);assert.equal(g.normalize(rows[0]).group,'','base classification/Expiry contract unchanged');
 assert.equal(g.filter(rows,{groups:['HomeHealth']}).length,1);
});
test('projection batches, caches, shares simultaneous requests and invalidates by Master version',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);const c=harness(async()=>{calls++;await gate;return [{item_code:'1056889',group_name:'Medicine'}];}),p=c.window.PharmFlowReceivingGroups;
 const rows=[{itemCode:'1056889'},{itemCode:'MISSING'}];const a=p.refresh(rows,'V1'),b=p.refresh(rows,'V1');release();await Promise.all([a,b]);assert.equal(calls,1);
 await p.refresh(rows,'V1');assert.equal(calls,1);await p.refresh(rows,'V2');assert.equal(calls,2);
});
test('late response cannot cross pharmacy/user boundary, and failed reads remain retryable',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const c=harness(async()=>{calls++;await gate;return [{item_code:'1056889',group_name:'HomeHealth'}];}),p=c.window.PharmFlowReceivingGroups;
 const pending=p.refresh([{itemCode:'1056889'}],'V1');c.AuthState.context.pharmacy_id='B';release();await pending;assert.equal(p.get({itemCode:'1056889'}),'');await p.refresh([{itemCode:'1056889'}],'V1');assert.equal(calls,2);
 c.AuthState.user.id='OTHER';assert.equal(p.get({itemCode:'1056889'}),'');
 let failed=true;c.authRpc=async()=>{if(failed)throw Error('offline');return [{item_code:'1056889',group_name:'Beauty'}];};await assert.rejects(p.refresh([{itemCode:'1056889'}],'V2'));failed=false;await p.refresh([{itemCode:'1056889'}],'V2');assert.equal(p.get({itemCode:'1056889'}),'Beauty');
});
test('1001 codes use bounded requests and no new polling loop',async()=>{
 const sizes=[],c=harness(async(_,params)=>{sizes.push(params.p_item_codes.length);return []});await c.window.PharmFlowReceivingGroups.refresh(Array.from({length:1001},(_,i)=>({itemCode:String(i+1)})),'V1');assert.deepEqual(sizes,[1000,1]);assert(!part.includes('setInterval'));
});
test('Quick Add uses scoped full-width select styling and retains all six values',()=>{
 const html=fs.readFileSync('js/receiving.js','utf8'),css=fs.readFileSync('css/pharmflow-next.css','utf8');
 assert.match(html,/<label class="pfnCreateGroup"><span>Group <b>\*<\/b><\/span><select data-quick-group>/);
 for(const value of ['Beauty','FMCG','HomeHealth','Medicine','Mom &amp; Baby','Supplement'])assert(html.includes(`value="${value}"`));
 assert.match(css,/#quickGTINResolver \[data-quick-group\]\{[^}]*width:100%;height:42px;[^}]*padding:0 38px 0 11px/);assert.match(css,/#quickGTINResolver \[data-quick-group\]:focus-visible/);assert.match(css,/no-repeat right 13px center;appearance:none/);
});
test('order-scoped metrics retain calculations; Total V2 and identifier labels are explicit',()=>{
 const ui=fs.readFileSync('ui.js','utf8'),index=fs.readFileSync('index.html','utf8');assert(index.includes('TOTAL V2 ITEMS'));assert(index.includes('IDENTIFIER MAPPINGS'));assert(index.includes('Workspace Items Loaded'));
 const baseline=require('node:child_process').execFileSync('git',['show','8dd9a3c2fe2ccc322db4a05ea3afe09e30a05ad5:ui.js'],{encoding:'utf8'});
 const fn=s=>s.slice(s.indexOf('function refreshHealthSummary(){'),s.indexOf('\n}',s.indexOf('function refreshHealthSummary(){'))+2);assert.equal(fn(ui),fn(baseline));assert.match(ui,/status.apiVersion!==2/);
});
test('Receiving report projection shares display fallback without changing allocation/quantity code',async()=>{
 const c=harness();await c.window.PharmFlowReceivingGroups.refresh([{itemCode:'1056889'}],'V1');
 const reports=fs.readFileSync('js/reports.js','utf8');const start=reports.indexOf('function getOperationalGroupForReceivingRow('),end=reports.indexOf('\n}',start)+2;
 c.AppState={workspace:{orderData:[]}};c.toSafeString=v=>String(v||'');vm.runInContext(reports.slice(start,end),c);
 assert.equal(c.getOperationalGroupForReceivingRow({itemCode:'1056889'}),'Home Health');assert.equal(c.getOperationalGroupForReceivingRow({itemCode:'1056889',Group:'Beauty'}),'Beauty');
 const before=require('node:child_process').execFileSync('git',['show','8dd9a3c2fe2ccc322db4a05ea3afe09e30a05ad5:js/reports.js'],{encoding:'utf8'});
 assert.equal(reports.replaceAll('normalizeReceiving(', 'normalize('),before);
});
