const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function backendHarness(rpc){
  const button={disabled:true,title:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const pharmacy={id:'pharmacy-a'};
  const events={};
  const window={addEventListener(){}};
  const context={
    window,document:{getElementById:id=>id==='btnExpiryNeedsReview'?button:null,addEventListener(){}},
    AuthState:{context:{pharmacy_id:pharmacy.id}},getCurrentPharmacyId:()=>pharmacy.id,
    authRpc:rpc,crypto:{randomUUID:(()=>{let i=0;return()=>`stable-operation-${++i}`;})()},
    AppEvents:{on:(name,handler)=>{events[name]=handler;}},setTimeout,clearTimeout,AbortController,Blob,URL,console,Map,Number,Array,String,Error,Promise,globalThis:null
  };
  context.globalThis=context;
  vm.runInNewContext(read('js/needs-review.js'),context,{filename:'js/needs-review.js'});
  return {backend:window.ExpiryReviewBackend,button,context,pharmacy,events,waitForImage:window.nrV2WaitForEvidenceImage};
}

test('Needs Review refresh is single-flight and transient failure preserves the verified tab',async()=>{
  let resolveContract,failNext=false,calls=0;
  const rpc=(name)=>{
    calls++;
    if(name==='get_pharmflow_expiry_review_contract_v1'){
      if(failNext){failNext=false;return Promise.reject(new Error('temporary network failure'));}
      return new Promise(resolve=>{resolveContract=()=>resolve({contract_version:'EXPIRY_NEEDS_REVIEW_20261010_V2'});});
    }
    if(name==='count_pharmflow_expiry_reviews_v1')return Promise.resolve(3);
    throw new Error('unexpected RPC '+name);
  };
  const {backend,button}=backendHarness(rpc);
  const a=backend.refresh(),b=backend.refresh();
  assert.equal(calls,1,'overlapping refreshes share one request');
  resolveContract();
  assert.deepEqual(await Promise.all([a,b]),[true,true]);
  assert.equal(backend.ready,true);assert.equal(backend.pendingCount,3);assert.equal(button.disabled,false);
  failNext=true;assert.equal(await backend.refresh(),false);
  assert.equal(backend.ready,true);assert.equal(backend.pendingCount,3);assert.equal(button.disabled,false);
  backend.invalidate();assert.equal(backend.ready,false);assert.equal(button.disabled,true);
});

test('same-pharmacy auth-context refresh does not strand a verified Needs Review tab during a transient failure',async()=>{
  let fail=false;
  const rpc=async name=>{
    if(name==='get_pharmflow_expiry_review_contract_v1'){
      if(fail)throw new Error('temporary timeout');
      return {contract_version:'EXPIRY_NEEDS_REVIEW_20261010_V2'};
    }
    if(name==='count_pharmflow_expiry_reviews_v1')return 2;
    throw new Error('unexpected RPC '+name);
  };
  const {backend,button,events}=backendHarness(rpc);
  assert.equal(await backend.refresh(),true);assert.equal(button.disabled,false);
  fail=true;events['auth:context']();await backend.refresh();
  assert.equal(backend.ready,true);assert.equal(backend.pendingCount,2);assert.equal(button.disabled,false);
});

test('private evidence image settles only after decode, and decode errors or timeouts become recoverable states',async()=>{
  const {waitForImage}=backendHarness(async()=>{});
  const image={src:'',complete:false,naturalWidth:0,naturalHeight:0,onload:null,onerror:null};
  const loaded=waitForImage(image,'blob:private-photo-test',100);
  image.naturalWidth=32;image.naturalHeight=24;image.onload();
  assert.equal(await loaded,image);assert.equal(image.src,'blob:private-photo-test');

  const broken={src:'',complete:false,naturalWidth:0,naturalHeight:0,onload:null,onerror:null};
  const rejected=waitForImage(broken,'blob:broken',100);
  broken.onerror();await assert.rejects(rejected,/could not be decoded/);

  const stalled={src:'',complete:false,naturalWidth:0,naturalHeight:0,onload:null,onerror:null};
  await assert.rejects(waitForImage(stalled,'blob:stalled',5),/rendering timed out/);
});

test('photo retrieval uses only the private authenticated Storage endpoint and rejects missing objects',async()=>{
  const {context}=backendHarness(async()=>{});let requested;
  context.getSupabaseAccessToken=()=> 'user-session-token';
  context.getSupabaseProjectUrl=()=> 'https://staging.example.invalid';
  context.getSupabasePublishableKey=()=> 'staging-publishable-key';
  context.fetch=async(url,options)=>{
    requested={url,options};
    return {ok:true,blob:async()=>new Blob(['synthetic-image'],{type:'image/jpeg'})};
  };
  const objectUrl=await context.nrV2PhotoObjectUrl('pharmacy-a/review-a/photo-a.jpg');
  assert.match(requested.url,/\/storage\/v1\/object\/authenticated\/pharmflow-needs-review\/pharmacy-a\/review-a\/photo-a\.jpg$/);
  assert.equal(requested.options.headers.Authorization,'Bearer user-session-token');
  assert.equal(requested.options.headers.apikey,'staging-publishable-key');
  assert.ok(requested.options.signal);
  context.nrV2ReleasePhotoObjectUrl('pharmacy-a/review-a/photo-a.jpg');

  context.fetch=async()=>({ok:false,status:404});
  await assert.rejects(()=>context.nrV2PhotoObjectUrl('pharmacy-a/review-a/missing.jpg'),/no longer available/);
});

test('uncertain Resolve retry reuses the same operation ID and item payload',async()=>{
  let first=true;const calls=[];
  const rpc=async(name,args)=>{
    calls.push([name,args]);
    if(name==='resolve_pharmflow_expiry_review_v2'){
      if(first){first=false;throw new Error('lost response');}
      return {success:true,review_id:'review-1',item_code:'ITEM-1',operation_id:args.p_operation_id,already_resolved:false};
    }
    if(name==='get_pharmflow_expiry_review_contract_v1')return {contract_version:'EXPIRY_NEEDS_REVIEW_20261010_V2'};
    if(name==='count_pharmflow_expiry_reviews_v1')return 0;
    throw new Error('unexpected RPC '+name);
  };
  const {backend}=backendHarness(rpc);backend.ready=true;backend.pharmacyId='pharmacy-a';backend.pendingCount=1;
  await assert.rejects(()=>backend.resolve('review-1',{itemCode:'ITEM-1'}),/lost response/);
  const firstArgs=calls.find(x=>x[0]==='resolve_pharmflow_expiry_review_v2')[1];
  const ack=await backend.resolve('review-1',{itemCode:'ITEM-1'});
  const attempts=calls.filter(x=>x[0]==='resolve_pharmflow_expiry_review_v2');
  assert.equal(attempts.length,2);assert.equal(attempts[0][1].p_operation_id,attempts[1][1].p_operation_id);
  assert.deepEqual(attempts[0][1],attempts[1][1]);assert.equal(ack.success,true);assert.equal(backend.resolutionOperations.size,0);
});

test('Expiry tab switching retains draft controls and has no application scroll commands',async()=>{const {harness}=require('./expiry-desktop-harness.cjs');const h=harness();h.e('expiryBatchInput').value='KEEP';await h.refresh();await h.click('btnOpenExpiryInventory');await h.click('btnExpirySessionView');assert.equal(h.e('expiryBatchInput').value,'KEEP');assert.doesNotMatch(read('js/expiry-desktop-v2.js'),/scrollIntoView|scrollTo/);});
test('Shelf exports use server filter authority and do not depend on the current page',()=>{const s=read('js/expiry-desktop-v2.js');assert.match(s,/export_pharmflow_expiry_inventory_v1/);assert.match(s,/p_filters:\s*formFilters\(\)/);assert.match(s,/"Item Code":\s*String\(r.item_code\)/);assert.match(s,/Qty:\s*qty\(r\)/);assert.doesNotMatch(s,/inventoryFiltered|loadInventorySnapshot/);});

test('Resolve UI remains pharmacy-local and Storage evidence stays authenticated/private',()=>{
  const ui=read('ui.js'),backend=read('js/needs-review.js');
  const panel=ui.slice(ui.indexOf('async function openExpiryNeedsReviewPanel'),ui.indexOf('window.refreshNeedsReviewCounters'));
  assert.match(panel,/pharmacy-local identifier mapping/);
  assert.match(panel,/Search Global Master by Item Code or name/);
  assert.doesNotMatch(panel,/Only approved Global Master writers can change item mappings/);
  assert.match(backend,/async function nrV2PhotoObjectUrl/);
  assert.match(backend,/\/storage\/v1\/object\/authenticated\//);
  assert.match(backend,/signal:controller\?\.signal/);assert.match(backend,/setTimeout\(\(\)=>controller\?\.abort\(\),15000\)/);
  assert.match(ui,/nrV2WaitForEvidenceImage\(img,url\)/);assert.match(ui,/Evidence photo unavailable\. Retry or check pharmacy access\./);
  assert.match(ui,/data-expiry-photo-retry/);
  assert.doesNotMatch(backend,/storage\.from\([^)]*\)\.makePublic|service_role/i);
});
