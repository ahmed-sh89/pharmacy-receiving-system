const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('js/receiving-release.js','utf8');
const context={window:{},AuthState:{context:{pharmacy_id:'a'},user:{id:'u'}},normalizeItemCode:s=>String(s).trim(),authRpc:async()=>[{item_code:'1',group_name:'HomeHealth'}]};
vm.runInNewContext(src.slice(src.indexOf('window.PharmFlowClassificationFilters='),src.indexOf('// Existing workspace notifications')),context);
const f=context.window.PharmFlowClassificationFilters,g=context.window.PharmFlowReceivingGroups;
test('canonical projection, missing and legacy Group, identity and scope',async()=>{
 await g.refresh([{itemCode:'1'},{itemCode:'2'}]);
 assert.equal(f.displayGroup(f.normalizeReceiving({itemCode:'1',category:'Beauty'}).group),'Home Health');
 assert.equal(f.normalizeReceiving({itemCode:'2',category:'Beauty'}).group,'');
 assert.equal(f.normalizeReceiving({itemCode:'3',group_name:'Medicine'}).group,'Medicine');
 assert.equal(f.normalizeReceiving({barcode:'1'}).group,'');
 context.AuthState.context.pharmacy_id='b';assert.equal(f.normalizeReceiving({itemCode:'1'}).group,'');
});
test('toolbar reserves neighboring actions; only Item Name weight changes',()=>{
 const css=fs.readFileSync('css/receiving-order-toolbar.css','utf8');
 assert(css.includes('grid-template-columns:122px 64px 150px'));
 assert(css.includes('visibility:hidden;pointer-events:none'));
 assert(!css.includes('.pfnBrowserControlRow label{flex:0 0 150px'));
 assert(fs.readFileSync('css/pharmflow-next.css','utf8').includes('.pfnItemName b{font-weight:500;')); 
});
