const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const receiving=fs.readFileSync('js/receiving.js','utf8');
const ui=fs.readFileSync('ui.js','utf8');
function fn(source,name){
 const marker=`function ${name}(`,at=source.indexOf(marker),start=source.slice(at-6,at)==='async '?at-6:at;
 assert(at>=0,name);return source.slice(start,source.indexOf('\n}',at)+2);
}
const normalizeItemCode=v=>String(v||'').trim().toUpperCase().replace(/^0+(?=\d)/,'');
function context(extra={}){return {toSafeString:v=>String(v??''),normalizeItemCode,normalizeOrderNumber:v=>String(v||'').trim().toUpperCase(),...extra};}
test('Master identity excludes uploaded-only items, ranks normalized codes, preserves Group and live order object',async()=>{
 const order={itemCode:'00105',itemName:'Order name',orderNumbers:['A']};
 const c=context({AppState:{workspace:{orderData:[order,{itemCode:'999',itemName:'Upload only',orderNumbers:['A']}] }},IdentifierService:{pharmacyId:()=> 'P',searchItems:async()=>[
 {item_code:'777',item_name:'Master Extra',group_name:'Beauty'},
 {item_code:'105',item_name:'Master Name',group_name:'Medicine'},
 {item_code:'00105',item_name:'Duplicate normalized identity'}]}});
 vm.runInNewContext(fn(receiving,'buildReceivingResolverSearchIndex')+'\n'+fn(receiving,'searchReceivingMasterItems'),c);
 const rows=await c.searchReceivingMasterItems('Master',['A']);
 assert.equal(rows.length,2);assert.equal(rows[0].itemCode,'105');assert.equal(rows[0].groupName,'Medicine');
 assert.equal(rows[0].receivingItem,order);assert.equal(rows[0].itemName,'Master Name');
 assert.equal(rows[1].inActiveOrder,false);assert.equal(rows[1].receivingItem,null);
 assert.equal(order.itemName,'Order name');
});
test('Master read fails closed on pharmacy change or service error; no order-only fallback',async()=>{
 let pharmacy='P';const c=context({IdentifierService:{pharmacyId:()=>pharmacy,searchItems:async()=>{pharmacy='Q';return [];}}});
 vm.runInNewContext(fn(receiving,'searchReceivingMasterItems'),c);
 await assert.rejects(c.searchReceivingMasterItems('item',['A']),/Pharmacy changed/);
 c.IdentifierService.searchItems=async()=>{throw Error('Offline');};
 await assert.rejects(c.searchReceivingMasterItems('item',['A']),/Offline/);
});
test('explicit original order cannot fall back after current selection changes',()=>{
 const c=context({getSelectedReceivingOrderNumbers:()=>['B'],chooseDeterministicReceivingOrder:()=> 'B'});
 vm.runInNewContext(fn(receiving,'resolveReceivingTransactionOrder'),c);
 const item={orderNumbers:['A','B']};assert.throws(()=>c.resolveReceivingTransactionOrder(item,'A'),/original target Order/);
 assert.equal(c.resolveReceivingTransactionOrder(item,'B'),'B');
 assert.equal(c.resolveReceivingTransactionOrder(item),'B');
});
test('deferred resolution validates captured scope before learning or writing a receipt',async()=>{
 let learns=0;const c=context({nrV2AllocationScope:()=>['A'],getSelectedReceivingOrderNumbers:()=>['B'],IdentifierService:{pharmacyId:()=> 'P',learnIdentifier:async()=>learns++}});
 vm.runInNewContext(fn(ui,'nrV2ResolveGroupToOrderItem'),c);
 await assert.rejects(c.nrV2ResolveGroupToOrderItem({rows:[{pharmacy_id:'P'}]},{}),/original captured Orders/);assert.equal(learns,0);
 await assert.rejects(c.nrV2ResolveGroupToOrderItem({rows:[{pharmacy_id:'Q'}]},{}),/different pharmacy/);
});
test('review draft uses stable operation ID and original captured scope, retaining legacy callers',async()=>{
 const calls=[];const c=context({nrV2PharmacyId:()=> 'P',AppState:{session:{},workspace:{}},getSelectedReceivingOrderNumbers:()=>['B'],authRpc:async(name,args)=>{calls.push({name,args});return [{review_id:'R'}];}});
 vm.runInNewContext(fn(fs.readFileSync('js/needs-review.js','utf8'),'nrV2CreateDraft'),c);
 await c.nrV2CreateDraft({identifierDisplay:'06285147015764'},{operationId:'stable',workScopeOrderNumbers:['A']});
 await c.nrV2CreateDraft({identifierDisplay:'A07XA04'},{});
 assert.equal(calls[0].name,'create_pharmflow_needs_review_v5');assert.equal(calls[0].args.p_order_number,'A');
 assert.equal(calls[0].args.p_operation_id,'stable');assert.equal(calls[0].args.p_identifier_display,'06285147015764');
 assert.equal(calls[1].name,'create_pharmflow_needs_review_v4');assert.equal(calls[1].args.p_identifier_display,'A07XA04');
});
test('immediate Save retains draft on quantity update retry and blocks duplicate click',()=>{
 // These guards accompany the executable draft and scope tests; no live RPCs are called.
 assert.match(receiving,/if\(reviewSaving\|\|linking\)return/);
 assert.match(receiving,/reviewDraft=reviewDraft\|\|await nrV2CreateDraft/);
 assert.match(receiving,/await nrV2SetQty\(reviewDraft.review_id,quantity\)/);
 assert.match(receiving,/data-extra-target><option value="">Select Target Order/);
 assert.match(receiving,/gtinResolution:resolution/);
});
