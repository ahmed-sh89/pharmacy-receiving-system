'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const receiving=fs.readFileSync('js/receiving.js','utf8');
const review=fs.readFileSync('js/needs-review.js','utf8');
const ui=fs.readFileSync('ui.js','utf8');
function fn(source,name){
 const at=source.indexOf(`function ${name}(`);
 assert(at>=0,name);
 return source.slice(source.slice(at-6,at)==='async '?at-6:at,source.indexOf('\n}',at)+2);
}
// Minimal event-driven DOM: runs the real dialog's Save handler, not a duplicate of it.
// RPCs use only synthetic in-memory rows. No network or Production mutation.
class Element{
 constructor(){this.nodes=new Map();this.handlers={};this.value='';this.disabled=false;this.removed=false;this.classList={toggle(){},add(){},remove(){}};}
 querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
 querySelectorAll(key){return key.split(',').map(s=>this.querySelector(s));}
 addEventListener(type,handler){this.handlers[type]=handler;}
 setAttribute(){} removeAttribute(){} focus(){} remove(){this.removed=true;}
 async click(){return this.handlers.click?.({currentTarget:this});}
}
function harness({loseCreateReply=false,failSetOnce=false,badConfirmation=false,delaySet=false}={}){
 const panel=new Element(),calls=[],rows=new Map();
 let selected=['TO-000519647','TO-000522923'],releaseSet;
 const gate=new Promise(resolve=>{releaseSet=resolve;});
 const c={
  document:{getElementById:()=>null,createElement:()=>panel,body:{appendChild(){}}},
  globalThis:{crypto:{randomUUID:()=> 'stable-capture-operation'}},
  setTimeout:()=>0,clearTimeout(){},setScanBoxState(){},focusScannerInput(){},
  escapeHTML:v=>String(v??''),toSafeString:v=>String(v??''),normalizeIdentifier:v=>String(v??''),
  normalizeOrderNumber:v=>String(v??'').trim(),getValidReceivingQuantity:v=>Number(v)||1,
  getSelectedReceivingOrderNumbers:()=>selected,IdentifierService:{pharmacyId:()=> 'P'},
  nrV2PharmacyId:()=> 'P',AppState:{session:{},workspace:{}},refreshNeedsReviewCounters:async()=>{},
  authRpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='create_pharmflow_needs_review_v5'){
    let row=rows.get(args.p_operation_id);
    if(!row){row={review_id:'R',pending_quantity:1,identifier_display:args.p_identifier_display,work_scope_order_numbers:args.p_work_scope_order_numbers,order_number:args.p_order_number,status:'PENDING'};rows.set(args.p_operation_id,row);}
    if(loseCreateReply){loseCreateReply=false;throw Error('Create reply lost');}
    return [{...row}];
   }
   if(name==='set_pharmflow_needs_review_qty_v2'){
    if(delaySet)await gate;
    if(failSetOnce){failSetOnce=false;throw Error('Set quantity unavailable');}
    const row=[...rows.values()].find(r=>r.review_id===args.p_review_id);
    assert(row);row.pending_quantity=args.p_pending_quantity;
    if(badConfirmation==='quantity')return [{review_id:row.review_id,pending_quantity:1}];
    if(badConfirmation==='review')return [{review_id:'OTHER',pending_quantity:row.pending_quantity}];
    return badConfirmation?[]:[{review_id:row.review_id,pending_quantity:row.pending_quantity}];
   }
   if(name==='list_pharmflow_needs_review_v4')return [...rows.values()].map(r=>({...r}));
   throw Error(`Unexpected write/contract: ${name}`);
  }
 };
 vm.runInNewContext(['nrV2CreateDraft','nrV2SetQty','nrV2List'].map(n=>fn(review,n)).join('\n')+'\n'+fn(ui,'groupNeedsReviewRows')+'\n'+fn(receiving,'openQuickGTINResolver'),c);
 const done=c.openQuickGTINResolver({identifierDisplay:'884400159403',quantity:1});
 return {c,panel,calls,rows,done,releaseSet,changeOrders:()=>{selected=['OTHER'];},save:async(qty=4)=>{panel.querySelector('[data-resolver-qty]').value=String(qty);await panel.querySelector('[data-review]').click();},reopen:async()=>c.groupNeedsReviewRows(await c.nrV2List())};
}
test('Quantity 4 reaches the actual Save handler, cloud setter, and reopened grouped review with original two-order scope',async()=>{
 const h=harness();h.changeOrders();await h.save(4);assert.equal(await h.done,true);
 const groups=await h.reopen();assert.equal(groups.length,1);assert.equal(groups[0].total_quantity,4);assert.equal(groups[0].rows.length,1);
 assert.deepEqual(Array.from(groups[0].work_scope_order_numbers),['TO-000519647','TO-000522923']);
 assert.equal(h.calls[0].args.p_operation_id,'stable-capture-operation');assert.equal(h.calls[1].args.p_pending_quantity,4);
 assert.equal(h.calls[1].args.p_review_id,'R');assert.equal(h.calls[1].args.p_pharmacy_id,'P');
 assert(h.calls.every(c=>!c.name.includes('resolution')&&!c.name.includes('transaction')&&!c.name.includes('identifier_v2')));
});
test('failed quantity update keeps dialog open; retry reuses same draft and saves 4 once',async()=>{
 const h=harness({failSetOnce:true});await h.save(4);assert.equal(h.panel.removed,false);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/unavailable/);
 await h.save(4);assert.equal(await h.done,true);assert.equal(h.rows.size,1);assert.equal(h.calls.filter(c=>c.name.startsWith('create_')).length,1);
 assert.equal((await h.reopen())[0].total_quantity,4);
});
test('lost create reply retries the same operation ID without a second review',async()=>{
 const h=harness({loseCreateReply:true});await h.save(4);assert.equal(h.panel.removed,false);await h.save(4);
 assert.equal(await h.done,true);assert.equal(h.rows.size,1);assert.equal((await h.reopen())[0].total_quantity,4);
 const creates=h.calls.filter(c=>c.name.startsWith('create_'));assert.equal(creates.length,2);assert.equal(creates[0].args.p_operation_id,creates[1].args.p_operation_id);
});
test('concurrent Save clicks produce one create and one quantity update',async()=>{
 const h=harness({delaySet:true});const first=h.save(4);await Promise.resolve();await h.save(4);h.releaseSet();await first;
 assert.equal(await h.done,true);assert.equal(h.calls.filter(c=>c.name.startsWith('create_')).length,1);assert.equal(h.calls.filter(c=>c.name.startsWith('set_')).length,1);
});
for(const badConfirmation of [true,'quantity','review']){
 test(`invalid quantity confirmation (${badConfirmation}) keeps dialog open`,async()=>{
  const h=harness({badConfirmation});await h.save(4);
  assert.equal(h.panel.removed,false);assert.match(h.panel.querySelector('.gtinPanelMessage').textContent,/quantity.*confirm/i);
 });
}
test('invalid entered quantity does not issue a create or setter call',async()=>{
 const h=harness();await h.save(0);assert.equal(h.panel.removed,false);assert.equal(h.calls.length,0);
 await h.save(4);assert.equal(await h.done,true);assert.equal((await h.reopen())[0].total_quantity,4);
});

function selection(quantity,ordered=4,received=0){
 const c={getValidReceivingQuantity:Number,normalizeOrderNumber:String,normalizeItemCode:String,toNumber:(v,f=0)=>Number(v??f),buildReceivingAutoAllocationPlan:()=>[{orderNumber:'A',quantity}],getPerOrderReceivingRows:()=>[{'Item Number':'1021954','Ordered Qty':ordered,'Received Qty':received}]};
 vm.runInNewContext(fn(receiving,'buildReceivingResolverSelectionModel'),c);
 return c.buildReceivingResolverSelectionModel({itemCode:'1021954'},quantity,['A']);
}
test('Remaining is positive pending quantity; Complete, Over and Extra retain their meanings',()=>{
 assert.equal(selection(1).status.label,'REMAINING');assert.equal(selection(1).status.value,'3');
 assert.equal(selection(4).status.label,'COMPLETE');assert.equal(selection(4).status.value,'0');
 assert.equal(selection(5).status.label,'OVER');assert.equal(selection(5).status.value,'+1');
 assert.equal(selection(4,0).status.label,'EXTRA');assert.equal(selection(4,0).status.value,'+4');
});
