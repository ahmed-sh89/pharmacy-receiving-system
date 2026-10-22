'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/receiving.js','utf8');
function fn(s,name){const at=s.indexOf(`function ${name}(`);assert(at>=0,name);return s.slice(s.slice(at-6,at)==='async '?at-6:at,s.indexOf('\n}',at)+2);}
const str=v=>String(v??''),norm=v=>str(v).trim().toUpperCase().replace(/^0+(?=\d)/,'');
class Element{
 constructor(){this.nodes=new Map();this.handlers={};this.value='';this.disabled=false;this.dataset={quickIndex:'0'};this.classList={toggle(){},add(){},remove(){}};}
 querySelector(k){if(!this.nodes.has(k))this.nodes.set(k,new Element());return this.nodes.get(k);}
 querySelectorAll(k){return k.split(',').map(key=>this.querySelector(key));}
 addEventListener(type,handler){this.handlers[type]=handler;}setAttribute(){}removeAttribute(){}focus(){this.focused=true;}remove(){this.removed=true;}
 async click(){return this.handlers.click?.({currentTarget:this});}
 async input(value){this.value=String(value);return this.handlers.input?.({currentTarget:this});}
}
function harness(options={}){
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const panel=new Element(),calls=[],history=[],events=[],hooks=[],receipts=new Map();let seq=0,selected=['A','B'],pharmacy='P',lost=!!options.lostReply;
 const c={window:{},globalThis:{crypto:{randomUUID:()=>`OP${++seq}`}},getCurrentPharmacyId:()=>pharmacy,
  document:{getElementById:()=>null,createElement:()=>panel,body:{appendChild(){}}},setTimeout:()=>0,clearTimeout(){},setScanBoxState(){},focusScannerInput(){},
  toSafeString:str,escapeHTML:str,normalizeItemCode:norm,normalizeOrderNumber:str,normalizeIdentifier:str,getValidReceivingQuantity:v=>Number(v)||1,
  getSelectedReceivingOrderNumbers:()=>selected,isPharmacyAdmin:()=>options.admin!==false,
  getWorkspaceOrderSourceRows:order=>[{itemCode:order==='A'?'105':'106',itemName:order==='A'?'Order Gel':'Order Other',orderedQty:4}],
  AppState:{settings:{},workspace:{receivingHistory:history}},AppEvents:{emit:(name,data)=>events.push({name,data})},
  getItemByCode:code=>({itemCode:code,itemName:'Order Gel'}),updateLastScanFromReceiving:(item,tx)=>hooks.push(['last',tx.transactionId]),updateLocalRuntimeBatchFromTransaction:(item,tx)=>hooks.push(['batch',tx.transactionId]),rememberRecentScannerTransaction:(item,tx)=>hooks.push(['recent',tx.transactionId]),
  rebuildStateIndexes(){},recalculateStatistics(){},saveWorkspaceSnapshot(){},refreshEntireUI(){},refreshNeedsReviewCounters:async()=>{},
  nrV2CreateDraft:async(parsed)=>({review_id:'R',pending_quantity:parsed.quantity,status:'PENDING'}),
  mergeCloudReceivingLedger:rows=>{for(const raw of rows)if(!history.some(r=>r.transactionId===raw.transaction_id))history.push({transactionId:raw.transaction_id,itemCode:raw.item_code,selectedOrderNumber:raw.order_number,gtin:raw.gtin,quantity:raw.quantity,cloudSynced:true});},
  authRpc:async(name,args)=>{
   calls.push({name,args});assert.equal(name,'quick_add_pharmflow_order_item_v1');
   if(options.pharmacyOnly&&!options.existing)return {success:false,code:'GLOBAL_CREATION_PERMISSION_REQUIRED',message:'Global Master creation permission required. Save for Review instead.'};
   if(options.conflict)throw Error('Identifier conflicts with an existing Pharmacy override');
   const id=`QUICK_ADD_V1:${args.p_operation_id}`;
   if(!receipts.has(id))receipts.set(id,{transaction_id:id,order_number:args.p_source_order,item_code:args.p_item_code,item_name:args.p_item_name,quantity:args.p_quantity,gtin:args.p_identifier_display,payload:{quickAdd:{request:args}}});
   if(options.delay)await gate;
   if(lost){lost=false;throw Error('Reply lost after commit');}
   return {success:true,pharmacyId:args.p_pharmacy_id,operationId:args.p_operation_id,receipts:[receipts.get(id)]};
  }
 };
 vm.runInNewContext(fs.readFileSync('js/identifier-service.js','utf8'),c);
 c.window.IdentifierService.findGlobalItemByCode=async()=>options.existing?{item_code:'105',group_name:'Medicine'}:null;
 vm.runInNewContext(['findReceivingQuickAddOrderMatches','applyReceivingQuickAddReceipt','openQuickGTINResolver'].map(n=>fn(source,n)).join('\n'),c);
 const done=c.openQuickGTINResolver({gtin:'06285147015764',lot:'LOT',serial:'SER',expiry:'2030-02'});
 return {c,panel,calls,history,events,hooks,receipts,done,release,changeOrder:()=>{selected=['OTHER'];},changePharmacy:()=>{pharmacy='Q';},
  select:async()=>{await panel.querySelector('[data-quick-search]').input('gel');await panel.querySelector('[data-quick-results]').querySelector('[data-quick-index]').click();},
  submit:async(qty=4,group='Medicine')=>{panel.querySelector('[data-resolver-qty]').value=String(qty);panel.querySelector('[data-quick-group]').value=group;await panel.querySelector('[data-quick-receive]').click();}};
}
test('Quick Add replaces legacy creation, populates readonly code/name from the selected Order and receives quantity 4',async()=>{
 const h=harness();assert(!h.panel.innerHTML.includes('Create New Item'));assert(!h.panel.innerHTML.includes('data-new-code'));assert.match(h.panel.innerHTML,/data-quick-code readonly/);
 await h.select();assert.equal(h.panel.querySelector('[data-quick-code]').value,'105');assert.equal(h.panel.querySelector('[data-quick-name]').value,'Order Gel');
 await h.submit();assert.equal((await h.done).quantity,4);assert.equal(h.calls.length,1);
 const p=h.calls[0].args;assert.equal(p.p_source_order,'A');assert.equal(p.p_item_code,'105');assert.equal(p.p_item_name,'Order Gel');assert.equal(p.p_group_name,'Medicine');assert.equal(p.p_identifier_display,'06285147015764');assert.equal(p.p_capture.lot,'LOT');
 assert.equal(h.history.length,1);assert.equal(h.history[0].cloudSynced,true);assert.deepEqual(h.hooks.map(x=>x[0]),['last','batch','recent']);assert(!h.events.some(e=>e.name==='receiving:transaction'),'server receipt must never be queued a second time');
});
test('missing Group blocks creation; a concurrently existing Master is reused without Group re-entry',async()=>{
 const h=harness();await h.select();await h.submit(4,'');assert.equal(h.calls.length,0);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/Select Group/);
 const existing=harness({existing:true});await existing.select();await existing.submit(4,'');assert.equal((await existing.done).quantity,4);assert.equal(existing.calls[0].args.p_group_name,'');
});
test('pharmacy-only mapping permission cannot create a Master; Save for Review remains available',async()=>{
 const h=harness({pharmacyOnly:true});await h.select();await h.submit();assert.equal(h.history.length,0);assert.equal(h.receipts.size,0);assert.equal(h.panel.querySelector('[data-review]').disabled,false);
 await h.panel.querySelector('[data-review]').click();assert.equal(await h.done,true);
});
test('pharmacy-only user may Quick Add an already existing Master through the same scoped server contract',async()=>{
 const h=harness({pharmacyOnly:true,existing:true});await h.select();await h.submit(4,'');assert.equal((await h.done).quantity,4);assert.equal(h.calls.length,1);
});
test('mapping conflict never creates a local receiving transaction or falls back to another writer',async()=>{
 const h=harness({conflict:true});await h.select();await h.submit();assert.equal(h.calls.length,1);assert.equal(h.history.length,0);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/conflicts/);
});
test('lost committed reply freezes original row/quantity; retry acknowledges one receipt without receiving twice',async()=>{
 const h=harness({lostReply:true});await h.select();await h.submit();assert.equal(h.receipts.size,1);assert.equal(h.history.length,0);assert.equal(h.panel.querySelector('[data-review]').disabled,true);
 await h.submit(9,'Beauty');assert.equal((await h.done).quantity,4);assert.equal(h.receipts.size,1);assert.equal(h.history.length,1);assert.equal(h.calls[0].args,h.calls[1].args);assert.equal(h.calls[1].args.p_quantity,4);
});
test('changed selected scope or lack of mapping permission blocks Quick Add before any RPC',async()=>{
 const h=harness();await h.select();h.changeOrder();await h.submit();assert.equal(h.calls.length,0);
 const viewer=harness({admin:false});await viewer.select();await viewer.submit();assert.equal(viewer.calls.length,0);assert.match(viewer.panel.querySelector('.gtinPanelMessage').textContent,/Save for Review/);
});
test('Quick Add search uses captured Order rows and never selects an unrelated current Order',()=>{
 const c={toSafeString:str,normalizeItemCode:norm,getWorkspaceOrderSourceRows:order=>[{itemCode:'00105',itemName:'Order Gel'}]};vm.runInNewContext(fn(source,'findReceivingQuickAddOrderMatches'),c);
 const rows=c.findReceivingQuickAddOrderMatches('gel',['ORIGINAL']);assert.equal(rows.length,1);assert.equal(rows[0].sourceOrder,'ORIGINAL');assert.equal(rows[0].itemCode,'00105');assert.equal(rows[0].itemName,'Order Gel');
});
test('existing Master Link partial retry preserves allocation IDs and skips already recorded receipts',()=>{
 const history=[],calls=[],item={itemCode:'105',itemName:'Master'},capture={item,quantity:4,extra:false,transactionId:'LINK',plan:[{orderNumber:'A',quantity:2},{orderNumber:'B',quantity:2}]};let fail=true;
 const c={toSafeString:str,normalizeItemCode:norm,normalizeOrderNumber:str,AppState:{workspace:{receivingHistory:history}},APP_CONFIG:{transactionSources:{scanner:'SCANNER'}},receiveOrderItem:options=>{calls.push(options);if(fail&&options.targetOrder==='B'){fail=false;return false;}const tx={transactionId:options.transactionId,itemCode:item.itemCode,selectedOrderNumber:options.targetOrder,quantity:options.quantity,gtin:options.gtin};history.push(tx);return tx;}};
 vm.runInNewContext(fn(source,'receivePinnedReceivingLink'),c);assert.throws(()=>c.receivePinnedReceivingLink(capture,'A07XA04',{},{}),/Retry/);
 c.receivePinnedReceivingLink(capture,'A07XA04',{},{});assert.equal(history.length,2);assert.equal(calls.filter(x=>x.targetOrder==='A').length,1);assert.equal(history[1].transactionId,'LINK:A2');
});
test('SQL reuses Settings creation, checks server roles/Group/source, commits receipt atomically and keeps migration 3 deferred',()=>{
 const sql=fs.readFileSync('sql/receiving-hotfix-review/01_identity_and_provenance.sql','utf8'),quick=sql.slice(sql.indexOf('CREATE FUNCTION public.quick_add_pharmflow_order_item_v1'));
 assert.match(quick,/pharmflow_is_pharmacy_identifier_admin_v2/);assert.match(quick,/pharmflow_is_reference_master_admin_v1/);assert.match(quick,/pharmflow_normalize_main_group_v1/);
 assert.match(quick,/PERFORM public.create_pharmflow_global_item_v2/);assert(!/insert into public.pharmflow_global_items_v2/i.test(quick));
 assert.match(quick,/learn_pharmflow_existing_identifier_v3/);assert.match(quick,/append_pharmflow_learned_transaction_v4/);assert.match(quick,/Selected Order row changed/);assert.match(quick,/Quick Add operation already used with different input/);
 assert(!fs.existsSync('sql/receiving-hotfix-review/03_deferred_resolution.sql'));assert(fs.existsSync('sql/receiving-hotfix-review/deferred/03_deferred_resolution.sql'));
 assert(!fs.readFileSync('ui.js','utf8').includes('nrV6RequestResolution'));assert.match(source,/<select data-extra-order><option value="">Select Target Order/);
});

test('simultaneous Quick Add clicks issue only one server operation',async()=>{
 const h=harness({delay:true});await h.select();const first=h.submit();await new Promise(resolve=>setImmediate(resolve));await h.submit();h.release();await first;
 assert.equal((await h.done).quantity,4);assert.equal(h.calls.length,1);assert.equal(h.receipts.size,1);assert.equal(h.history.length,1);
});
test('a malformed server receipt is rejected before local merge',async()=>{
 const h=harness();const original=h.c.authRpc;h.c.authRpc=async(name,args)=>{const reply=await original(name,args);reply.receipts=[{...reply.receipts[0],quantity:99}];return reply;};
 await h.select();await h.submit();assert.equal(h.history.length,0);assert.equal(h.panel.removed,undefined);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/does not match/);
});

test('reprocessing an acknowledged Quick Add receipt does not duplicate Last Scan batch or local quantity',async()=>{
 const h=harness();await h.select();await h.submit();await h.done;
 const params=h.calls[0].args,reply=await h.c.window.IdentifierService.quickAddOrderItem({pharmacyId:'P',operationId:params.p_operation_id,params});
 h.c.applyReceivingQuickAddReceipt(reply,'P');assert.equal(h.history.length,1);assert.equal(h.hooks.length,3);assert(!h.events.some(e=>e.name==='receiving:transaction'));
});


test('Quick Add selection collapses search/results and focuses the selected Group control',async()=>{
 const h=harness();h.panel.querySelector('[data-resolver-qty]').value='7';await h.select();
 assert.equal(h.panel.querySelector('[data-quick-search-area]').hidden,true);
 assert.equal(h.panel.querySelector('[data-quick-selection]').hidden,false);
 assert.equal(h.panel.querySelector('[data-quick-group]').focused,true);
 assert.equal(h.panel.querySelector('[data-resolver-qty]').value,'7');
 assert.match(h.panel.innerHTML,/data-quick-selection role="region" aria-label="Selected Order item"/);
 assert.match(h.panel.innerHTML,/<button type="button" data-quick-change>Change Item<\/button>/);
 assert.match(h.panel.innerHTML,/aria-label="Search Active Order items"/);
 assert.equal(h.calls.length,0);
});
test('Change Item restores results and clears item-specific fields/Group while preserving scan and quantity',async()=>{
 const h=harness();await h.select();const results=h.panel.querySelector('[data-quick-results]').innerHTML;
 h.panel.querySelector('[data-resolver-qty]').value='7';h.panel.querySelector('[data-quick-group]').value='Beauty';
 await h.panel.querySelector('[data-quick-change]').click();
 assert.equal(h.panel.querySelector('[data-quick-search-area]').hidden,false);assert.equal(h.panel.querySelector('[data-quick-selection]').hidden,true);
 for(const field of ['code','name','group'])assert.equal(h.panel.querySelector('[data-quick-'+field+']').value,'');
 assert.equal(h.panel.querySelector('[data-quick-source]').textContent,'');assert.equal(h.panel.querySelector('[data-quick-search]').focused,true);
 assert.equal(h.panel.querySelector('[data-quick-results]').innerHTML,results);assert.equal(h.panel.querySelector('[data-resolver-qty]').value,'7');
 await h.panel.querySelector('[data-quick-search]').input('order');const button=h.panel.querySelector('[data-quick-results]').querySelector('[data-quick-index]');button.dataset.quickIndex='1';await button.click();
 assert.equal(h.panel.querySelector('[data-quick-code]').value,'106');assert.equal(h.panel.querySelector('[data-quick-name]').value,'Order Other');
 await h.submit(7,'');assert.equal(h.calls.length,0);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/Select Group/);
 await h.submit(7,'Medicine');assert.equal(h.calls[0].args.p_source_order,'B');assert.equal(h.calls[0].args.p_identifier_display,'06285147015764');assert.equal(h.calls[0].args.p_quantity,7);
});
test('Change Item cannot alter a frozen or in-flight receiving operation',async()=>{
 const h=harness({delay:true});await h.select();const pending=h.submit(4,'Medicine');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.panel.querySelector('[data-quick-change]').disabled,true);await h.panel.querySelector('[data-quick-change]').click();
 assert.equal(h.panel.querySelector('[data-quick-code]').value,'105');assert.equal(h.panel.querySelector('[data-quick-group]').value,'Medicine');
 assert.equal(h.panel.querySelector('[data-quick-search-area]').hidden,true);h.release();await pending;assert.equal(h.history.length,1);assert.equal(h.history[0].quantity,4);
});
