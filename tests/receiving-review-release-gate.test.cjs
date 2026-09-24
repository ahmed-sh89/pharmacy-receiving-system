const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=file=>fs.readFileSync(file,'utf8');
function extractFunction(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`${name} must exist`);
  const brace=source.indexOf('{',start);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++;
    if(source[i]==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error(`Unable to extract ${name}`);
}

function normalize(value){return String(value||'').replace(/\s/g,'').toUpperCase();}
function manifestAllows({manifestPharmacy,requestPharmacy,manifest,order,item}){
  if(manifestPharmacy!==requestPharmacy||manifest.active!==true) return false;
  const wantedOrder=normalize(order), wantedItem=String(item||'').trim().toUpperCase();
  const activeOrder=(manifest.orderFiles||[]).some(file=>normalize(file.documentId||file.orderNumber)===wantedOrder);
  const belongs=(manifest.orderData||[]).some(row=>
    String(row.itemCode||'').trim().toUpperCase()===wantedItem &&
    (normalize(row.orderNumber)===wantedOrder||(row.orderNumbers||[]).some(value=>normalize(value)===wantedOrder))
  );
  return activeOrder&&belongs;
}

test('active manifest lifecycle permits only same-pharmacy exact order membership',()=>{
  const active={active:true,orderFiles:[{documentId:'ORD-B'}],orderData:[{itemCode:'ITEM-1',orderNumbers:['ORD-B']} ]};
  assert.equal(manifestAllows({manifestPharmacy:'P1',requestPharmacy:'P1',manifest:active,order:'ORD-B',item:'ITEM-1'}),true);
  assert.equal(manifestAllows({manifestPharmacy:'P1',requestPharmacy:'P1',manifest:{...active,active:false},order:'ORD-B',item:'ITEM-1'}),false,'finalized workspace is blocked');
  assert.equal(manifestAllows({manifestPharmacy:'P1',requestPharmacy:'P1',manifest:{...active,orderFiles:[]},order:'ORD-B',item:'ITEM-1'}),false,'removed order is blocked');
  assert.equal(manifestAllows({manifestPharmacy:'P1',requestPharmacy:'P1',manifest:active,order:'ORD-B',item:'WRONG'}),false,'wrong item is blocked');
  assert.equal(manifestAllows({manifestPharmacy:'P1',requestPharmacy:'P2',manifest:active,order:'ORD-B',item:'ITEM-1'}),false,'wrong pharmacy is blocked');
  assert.match(read('PHASE2C1158_REVIEW_SCOPE_REFERENCE_AUTHORITY.sql'),/manifest->>'active','false'\)\)='true'/);
});

test('Handheld review order reads explicit assignment, never PC selected scope',()=>{
  const source=read('js/needs-review.js');
  const context={
    AppState:{workspace:{handheldScopeConfigured:true,handheldOrderNumbers:['B'],selectedOrderNumbers:['A','B'],selectedOrderNumber:'A'}},
    normalizeOrderNumber:normalize,
    getActiveReceivingOrderNumbers:()=>['A','B']
  };
  vm.runInNewContext(extractFunction(source,'nrV2HandheldAssignedOrderNumbers'),context);
  vm.runInNewContext(extractFunction(source,'nrV2HandheldOrderNumber'),context);
  vm.runInNewContext(extractFunction(source,'nrV2DraftOriginalOrder'),context);
  context.nrV2CurrentOrderNumber=()=> 'A';
  assert.equal(context.nrV2HandheldOrderNumber(),'B');
  assert.equal(context.nrV2DraftOriginalOrder({orderNumber:'ARBITRARY'},true),'B','caller order cannot override Handheld assignment');
  context.AppState.workspace.selectedOrderNumbers=['A'];
  assert.equal(context.nrV2HandheldOrderNumber(),'B');
  context.AppState.workspace.handheldOrderNumbers=['A','B'];
  assert.throws(()=>context.nrV2HandheldOrderNumber(),/exactly one assigned/);
  context.AppState.workspace.handheldOrderNumbers=['B'];
  context.AppState.workspace.handheldScopeConfigured=false;
  assert.throws(()=>context.nrV2HandheldOrderNumber(),/explicit Handheld Order assignment/);
});

test('single Settings search classifies names, codes, identifiers, and unknown identifiers behaviorally',async()=>{
  const context={toSafeString:value=>String(value??''),IdentifierService:null};
  vm.runInNewContext('async '+extractFunction(read('ui.js'),'classifyIdentifierAdminQuery'),context);
  const service={
    async resolve(value){return value==='ABC01'?{found:true,itemCode:'ITEM-1'}:{found:false};},
    async searchItems(value){return value==='Aspirin'||value==='ITEM-1'?[{item_code:'ITEM-1',item_name:'Aspirin'}]:[];}
  };
  assert.equal((await context.classifyIdentifierAdminQuery('Aspirin',service)).kind,'ITEMS');
  assert.equal((await context.classifyIdentifierAdminQuery('ITEM-1',service)).kind,'ITEMS');
  assert.equal((await context.classifyIdentifierAdminQuery('ABC01',service)).kind,'IDENTIFIER');
  const unknown=await context.classifyIdentifierAdminQuery('U0030',service);
  assert.equal(unknown.kind,'UNKNOWN_IDENTIFIER');
  assert.equal(unknown.query,'U0030','unknown identifier remains exact for the subsequent Add GTIN step');
  const settings=read('index.html').slice(read('index.html').indexOf('id="globalIdentifierMasterAdmin"'),read('index.html').indexOf('id="globalIdentifierMasterResults"'));
  assert.equal((settings.match(/<input/g)||[]).length,1);
});

test('IdentifierService uses pharmacy-aware managed RPCs while legacy global RPC remains separate',async()=>{
  const calls=[];
  const context={
    toSafeString:value=>String(value??''),
    getCurrentPharmacyId:()=> 'P-HHP084',
    AuthState:{context:{}},
    authRpc:async(name,args)=>{calls.push({name,args});return {success:true};},
    window:{}
  };
  vm.runInNewContext(read('js/identifier-service.js'),context);
  await context.window.IdentifierService.addManagedIdentifier('op','ABC01',{item_code:'ITEM-1',item_name:'Aspirin'},'reason');
  assert.equal(calls[0].name,'add_pharmflow_managed_identifier_v1');
  assert.equal(calls[0].args.p_pharmacy_id,'P-HHP084');
  await context.window.IdentifierService.addIdentifier('op2','ABC02','ITEM-1','owner reason');
  assert.equal(calls[1].name,'add_pharmflow_global_identifier_v2');
  assert.equal('p_pharmacy_id' in calls[1].args,false,'legacy System Owner RPC cannot impersonate a pharmacy route');
});

test('server authorization contract routes reference and tenant admins without trusting browser role checks',()=>{
  function authorize({authenticated,admin,code,entry}){
    if(!authenticated) return 'DENY';
    if(entry==='LEGACY_GLOBAL') return 'SYSTEM_OWNER_ONLY';
    if(!admin) return 'DENY';
    return code==='HHP084'?'GLOBAL':'PHARMACY';
  }
  assert.equal(authorize({authenticated:true,admin:true,code:'HHP084',entry:'MANAGED'}),'GLOBAL');
  assert.equal(authorize({authenticated:true,admin:true,code:'HHP083',entry:'MANAGED'}),'PHARMACY');
  assert.equal(authorize({authenticated:true,admin:false,code:'HHP084',entry:'MANAGED'}),'DENY');
  assert.equal(authorize({authenticated:true,admin:true,code:'HHP084',entry:'LEGACY_GLOBAL'}),'SYSTEM_OWNER_ONLY');
  const sql=read('PHASE2C1158_REVIEW_SCOPE_REFERENCE_AUTHORITY.sql');
  assert.match(sql,/not public\.pharmflow_reference_identifier_admin_v1\(p_pharmacy_id\).*add_pharmflow_pharmacy_identifier_v2/);
  assert.match(read('PHASE2C1152_ADDITIVE_IDENTIFIER_FOUNDATION.sql'),/not public\.is_system_owner\(\)/,'legacy Global functions retain server-side System Owner authorization in their source migration');
});

function finalizeIntentModel({intent,review,manifestRow,legacyOrderStatus,transaction}){
  if(intent.status==='RESOLVED') return {status:'RESOLVED',idempotent:true};
  if(intent.status==='BLOCKED') return {status:'BLOCKED',code:intent.blockedCode};
  if(!review||review.status!=='PENDING') return {status:'BLOCKED',code:'REVIEW_NOT_PENDING'};
  const orderAvailable=manifestRow
    ? manifestAllows({manifestPharmacy:intent.pharmacyId,requestPharmacy:intent.pharmacyId,manifest:manifestRow,order:review.orderNumber,item:intent.itemCode}) ||
      ((manifestRow.orderFiles||[]).some(file=>normalize(file.documentId||file.orderNumber)===normalize(review.orderNumber))&&manifestRow.active===true)
    : legacyOrderStatus==='uploaded';
  if(!orderAvailable) return {status:'BLOCKED',code:'ORIGINAL_ORDER_UNAVAILABLE'};
  if(!transaction) return {status:'PENDING',code:'RECEIVING_TRANSACTION_PENDING'};
  if(transaction.pharmacyId!==intent.pharmacyId || transaction.transactionId!==intent.transactionId ||
     normalize(transaction.orderNumber)!==normalize(review.orderNumber) || transaction.itemCode!==intent.itemCode ||
     transaction.quantity<=0 || normalize(transaction.identifier)!==normalize(review.identifier)){
    return {status:'BLOCKED',code:'RECEIVING_TRANSACTION_MISMATCH'};
  }
  intent.status='RESOLVED';
  review.status='RESOLVED';
  return {status:'RESOLVED'};
}

test('Gate C finalizer accepts manifest-only active order and remains idempotent',()=>{
  const intent={status:'PENDING',pharmacyId:'P1',transactionId:'TX-1',itemCode:'ITEM-1'};
  const review={status:'PENDING',orderNumber:'ORD-B',identifier:'U0030'};
  const manifest={active:true,orderFiles:[{documentId:'ORD-B'}],orderData:[{itemCode:'ITEM-1',orderNumbers:['ORD-B']}]};
  const transaction={pharmacyId:'P1',transactionId:'TX-1',orderNumber:'ORD-B',itemCode:'ITEM-1',identifier:'U0030',quantity:3};
  assert.deepEqual(finalizeIntentModel({intent,review,manifestRow:manifest,legacyOrderStatus:null,transaction}),{status:'RESOLVED'});
  assert.deepEqual(finalizeIntentModel({intent,review,manifestRow:manifest,legacyOrderStatus:null,transaction}),{status:'RESOLVED',idempotent:true});
  assert.equal(transaction.quantity,3,'finalizer never creates or increments the deterministic transaction');
});

test('Gate C finalizer blocks removed/finalized order and mismatched transaction identity',()=>{
  const make=()=>({intent:{status:'PENDING',pharmacyId:'P1',transactionId:'TX-1',itemCode:'ITEM-1'},review:{status:'PENDING',orderNumber:'ORD-B',identifier:'U0030'}});
  let state=make();
  assert.equal(finalizeIntentModel({...state,manifestRow:{active:false,orderFiles:[{documentId:'ORD-B'}]},transaction:null}).code,'ORIGINAL_ORDER_UNAVAILABLE');
  state=make();
  assert.equal(finalizeIntentModel({...state,manifestRow:{active:true,orderFiles:[]},transaction:null}).code,'ORIGINAL_ORDER_UNAVAILABLE');
  const manifest={active:true,orderFiles:[{documentId:'ORD-B'}],orderData:[{itemCode:'ITEM-1',orderNumbers:['ORD-B']}]};
  state=make();
  assert.equal(finalizeIntentModel({...state,manifestRow:manifest,transaction:{pharmacyId:'P2',transactionId:'TX-1',orderNumber:'ORD-B',itemCode:'ITEM-1',identifier:'U0030',quantity:1}}).code,'RECEIVING_TRANSACTION_MISMATCH');
  state=make();
  assert.equal(finalizeIntentModel({...state,manifestRow:manifest,transaction:{pharmacyId:'P1',transactionId:'WRONG',orderNumber:'ORD-B',itemCode:'ITEM-1',identifier:'U0030',quantity:1}}).code,'RECEIVING_TRANSACTION_MISMATCH');
  state=make();
  assert.equal(finalizeIntentModel({...state,manifestRow:manifest,transaction:{pharmacyId:'P1',transactionId:'TX-1',orderNumber:'ORD-B',itemCode:'WRONG',identifier:'U0030',quantity:1}}).code,'RECEIVING_TRANSACTION_MISMATCH');
});

test('Gate C finalizer retains legacy fallback only without manifest authority',()=>{
  const transaction={pharmacyId:'P1',transactionId:'TX-1',orderNumber:'ORD-B',itemCode:'ITEM-1',identifier:'U0030',quantity:1};
  let intent={status:'PENDING',pharmacyId:'P1',transactionId:'TX-1',itemCode:'ITEM-1'};
  let review={status:'PENDING',orderNumber:'ORD-B',identifier:'U0030'};
  assert.equal(finalizeIntentModel({intent,review,manifestRow:null,legacyOrderStatus:'uploaded',transaction}).status,'RESOLVED');
  intent={status:'PENDING',pharmacyId:'P1',transactionId:'TX-1',itemCode:'ITEM-1'};
  review={status:'PENDING',orderNumber:'ORD-B',identifier:'U0030'};
  assert.equal(finalizeIntentModel({intent,review,manifestRow:null,legacyOrderStatus:'finalized',transaction}).code,'ORIGINAL_ORDER_UNAVAILABLE');
});

test('Gate C SQL preserves locked durable checks and changes only lifecycle authority',()=>{
  const sql=read('PHASE2C1158_REVIEW_SCOPE_REFERENCE_AUTHORITY.sql');
  const start=sql.indexOf('create or replace function public.try_finalize_pharmflow_needs_review_resolution_intent_v1');
  const end=sql.indexOf('create or replace function public.request_pharmflow_needs_review_resolution_v4',start);
  const finalizer=sql.slice(start,end);
  assert.match(finalizer,/where id=p_intent_id for update/);
  assert.match(finalizer,/id=v_intent\.review_id and pharmacy_id=v_intent\.pharmacy_id for update/);
  assert.match(finalizer,/exists\(select 1 from public\.pharmflow_active_order_manifest_v1 where pharmacy_id=v_intent\.pharmacy_id\)/);
  assert.match(finalizer,/pharmflow_manifest_has_active_order_v1\(v_intent\.pharmacy_id,v_review\.order_number\)/);
  assert.match(finalizer,/else\s+select status into v_order_status from public\.pharmflow_orders/);
  assert.match(finalizer,/pharmacy_id=v_intent\.pharmacy_id and transaction_id=v_intent\.transaction_id for update/);
  assert.match(finalizer,/v_transaction\.item_code<>v_intent\.item_code/);
  assert.match(finalizer,/v_transaction\.quantity<=0/);
  assert.match(finalizer,/pharmflow_identifier_key_v2\(v_transaction\.gtin\)<>v_review\.identifier_key/);
  assert.match(finalizer,/if v_intent\.status='RESOLVED'[\s\S]*'idempotent',true/);
  assert.doesNotMatch(finalizer,/insert into public\.pharmflow_receiving_transactions_v1/);
});

test('managed Global mutation operation IDs are replay-safe and reject changed input',()=>{
  const operations=new Map(), mappings=new Map();
  const mutate=input=>{
    const prior=operations.get(input.operationId);
    const signature=JSON.stringify(input);
    if(prior){
      if(prior.signature!==signature) throw new Error('Operation ID was already used with different Global mapping input');
      return prior.result;
    }
    if(input.action==='ADD') mappings.set(input.identifierDisplay,input.itemCode);
    const result={success:true,scope:'GLOBAL',action:input.action,identifierDisplay:input.identifierDisplay,itemCode:input.itemCode};
    operations.set(input.operationId,{signature,result});
    return result;
  };
  const exact=['U0030','S00110','1234A','1234','04065272072977'];
  for(const [index,identifierDisplay] of exact.entries()){
    const input={operationId:`op-${index}`,action:'ADD',identifierDisplay,itemCode:'ITEM-1',itemName:'Item',reason:'audit'};
    assert.deepEqual(mutate(input),mutate({...input}));
    assert.equal(mappings.get(identifierDisplay),'ITEM-1');
  }
  assert.equal(mappings.size,exact.length,'replays do not create duplicate mappings');
  assert.throws(()=>mutate({operationId:'op-0',action:'ADD',identifierDisplay:'U0030',itemCode:'ITEM-2',itemName:'Other',reason:'audit'}),/different Global mapping input/);
});

test('managed Global SQL validates operation input before every mutation',()=>{
  const sql=read('PHASE2C1158_REVIEW_SCOPE_REFERENCE_AUTHORITY.sql');
  assert.match(sql,/add column if not exists result jsonb/);
  for(const name of ['add','correct','remove']){
    const start=sql.indexOf(`create or replace function public.${name}_pharmflow_managed_identifier_v1`);
    const next=sql.indexOf('create or replace function public.',start+40);
    const body=sql.slice(start,next<0?sql.length:next);
    assert.ok(body.indexOf('where operation_id=p_operation_id') < body.indexOf(name==='add'?'insert into public.pharmflow_global_item_identifiers_v2':name==='correct'?'update public.pharmflow_global_item_identifiers_v2':'delete from public.pharmflow_global_item_identifiers_v2'));
    assert.match(body,/Operation ID was already used with different Global mapping input/);
    assert.match(body,/return v_audit\.result/);
  }
});

test('Handheld history display uses persisted assignment and ignores PC selection',()=>{
  const source=read('ui.js');
  const context={
    AppState:{workspace:{receivingHistory:[
      {deviceId:'D1',source:'SCANNER',quantity:1,orderNumber:'A'},
      {deviceId:'D1',source:'SCANNER',quantity:1,orderNumber:'B'}
    ],selectedOrderNumbers:['A']}},
    ensureDeviceId:()=> 'D1',
    APP_CONFIG:{transactionSources:{scanner:'SCANNER'}},
    normalizeOrderNumber:normalize,
    nrV2HandheldAssignedOrderNumbers:()=>['B']
  };
  vm.runInNewContext(extractFunction(source,'getHandheldDeviceScannerRows'),context);
  assert.deepEqual(context.getHandheldDeviceScannerRows().map(row=>row.orderNumber),['B']);
  context.AppState.workspace.selectedOrderNumbers=['A','B'];
  assert.deepEqual(context.getHandheldDeviceScannerRows().map(row=>row.orderNumber),['B']);
});
