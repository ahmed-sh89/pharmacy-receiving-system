const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=file=>fs.readFileSync(file,'utf8');

test('Stage 2 routes receiving identity and Needs Review through V2 contracts',()=>{
  const receiving=read('js/receiving.js');
  const reviews=read('js/needs-review.js');
  const service=read('js/identifier-service.js');
  assert.match(receiving,/IdentifierService\.resolve\(identifierDisplay\)/);
  assert.match(reviews,/create_pharmflow_needs_review_v3/);
  assert.match(reviews,/request_pharmflow_needs_review_resolution_v4/);
  assert.doesNotMatch(receiving,/savePharmacyLearnedGTIN\(/);
  assert.match(service,/resolve_pharmflow_identifier_v2/);
  assert.match(service,/create_pharmflow_global_item_v2/);
});

test('PC unknown-identifier review requires an explicit active Order and uses an allowed review reason',()=>{
  const receiving=read('js/receiving.js');
  assert.match(receiving,/data-review-order/);
  assert.match(receiving,/reviewOrderNumbers=\[\.\.\.new Set\(selectedOrders\.map\(normalizeOrderNumber\)\.filter\(Boolean\)\)\]/);
  assert.doesNotMatch(receiving,/const activeOrderNumbers=/);
  assert.match(receiving,/Only Orders selected on this device are available/);
  assert.match(receiving,/Select original Order/);
  assert.match(receiving,/reason:knownCode\?"KNOWN_NOT_IN_ORDER":"UNKNOWN_GTIN"/);
  assert.doesNotMatch(receiving,/reason:knownCode\?"KNOWN_NOT_IN_ORDER":"UNKNOWN_IDENTIFIER"/);
  assert.match(receiving,/orderNumber:reviewOrder/);
});

test('Handheld multi-order Needs Review snapshots device scope and defers Order assignment to PC',()=>{
  const review=read('js/needs-review.js');
  const ui=read('ui.js');
  const migration=read('PHASE2C1157_NEEDS_REVIEW_WORK_SCOPE.sql');
  assert.match(review,/create_pharmflow_needs_review_v4/);
  assert.match(review,/selectedOrders\.length===1 \? selectedOrders\[0\] : \"\"/);
  assert.match(review,/p_work_scope_order_numbers:workScope/);
  assert.match(review,/assign_pharmflow_needs_review_order_v1/);
  assert.match(ui,/data-assign-order/);
  assert.match(ui,/Captured Handheld scope/);
  assert.match(ui,/await nrV2AssignOrder\(row\.review_id,order\)/);
  assert.match(migration,/work_scope_order_numbers text\[\]/);
  assert.match(migration,/not\(v_order=any\(coalesce\(v_review\.work_scope_order_numbers/);
  assert.match(migration,/is_pharmacy_admin\(p_pharmacy_id\)/);
});

test('Needs Review persists a durable intent and keeps original order scope',()=>{
  const ui=read('ui.js');
  const reviews=read('js/needs-review.js');
  assert.match(ui,/nrV2RequestResolution\(row,item,transactionId\)/);
  assert.doesNotMatch(ui,/nrV2WaitForCloudConfirmation/);
  assert.doesNotMatch(ui,/savePharmacyLearnedGTIN\(/);
  assert.doesNotMatch(ui,/getPharmacyLearnedGTINRecord\(/);
  assert.match(ui,/getPerOrderReceivingRows\(original\)/);
  assert.match(ui,/nrV2FindOrderMatches\(q,group\.order_number\)/);
  assert.match(reviews,/request_pharmflow_needs_review_resolution_v4/);
  assert.match(ui,/nrV2RequestResolution\(row,item,transactionId\)[\s\S]{0,900}receiveOrderItem\(\{/);
});

test('Receiving KPIs use per-order entities, not the aggregated search projection',()=>{
  const app=read('js/app.js');
  assert.match(app,/getPerOrderReceivingRows\(order\)/);
});

test('completion archives each selected Order and offers a controlled Complete All action',()=>{
  const orders=read('js/orders.js');
  assert.match(orders,/for\(const orderNumber of summary\.orderNumbers\)[\s\S]*closeAndArchiveCurrentOrder\(orderNumber\)/);
  assert.match(orders,/requestFinalizeReceiving\(\{allOrders:true\}\)/);
});

test('Needs Review preserves the captured identifier and requires original Order attribution',()=>{
  const reviews=read('js/needs-review.js');
  const ui=read('ui.js');
  assert.match(reviews,/p_identifier_display:capturedCode/);
  assert.match(reviews,/Select the original active Order before saving this scan for review/);
  assert.match(ui,/data-copy-identifier/);
  assert.match(ui,/Link &amp; Resolve/);
});

test('identifier normalization keeps legitimate non-GTIN identity intact',()=>{
  const utils=read('js/utils.js');
  assert.match(utils,/function normalizeIdentifier\(value\)[\s\S]*toSafeString\(value\)\.toUpperCase\(\)/);
  assert.doesNotMatch(utils,/function normalizeIdentifier\(value\)[\s\S]{0,180}padStart/);
  assert.doesNotMatch(utils,/function normalizeIdentifier\(value\)[\s\S]{0,180}replace\(\/\[\^\\d\]/);
});

test('pharmacy-specific identifier resolution is owned by IdentifierService and precedes Global V2',()=>{
  const service=read('js/identifier-service.js');
  const receiving=read('js/receiving.js');
  const workspace=read('cloud-workspace.js');
  const migration=read('PHASE2C1156_PHARMACY_IDENTIFIER_V2.sql');
  assert.match(service,/add_pharmflow_pharmacy_identifier_v2/);
  assert.match(service,/correct_pharmflow_pharmacy_identifier_v2/);
  assert.match(service,/remove_pharmflow_pharmacy_identifier_v2/);
  assert.match(migration,/identifier_display text/);
  assert.match(migration,/identifier_key text/);
  assert.match(migration,/PHARMACY_V2/);
  assert.match(migration,/identifier_key = v_key/);
  assert.match(receiving,/masterRecord\?\.source==="PHARMACY_V2"/);
  assert.match(workspace,/resolution\.identifierKey/);
  assert.doesNotMatch(service,/savePharmacyLearnedGTIN/);
});

test('V2-resolved identifiers retain their exact display value through receiving state and queue upload',()=>{
  const state=read('js/state.js');
  const receiving=read('js/receiving.js');
  const ui=read('ui.js');
  const workspace=read('cloud-workspace.js');
  assert.match(state,/function normalizeReceivingTransactionIdentifier\(value,preserveExact=false\)/);
  const start=state.indexOf('function normalizeReceivingTransactionIdentifier');
  const end=state.indexOf('\n\nfunction addReceivingTransaction',start);
  const context={
    toSafeString:value=>String(value??''),
    normalizeGTIN:value=>String(value??'').replace(/[^\d]/g,'')
  };
  vm.runInNewContext(`${state.slice(start,end)};globalThis.normalizeReceivingTransactionIdentifier=normalizeReceivingTransactionIdentifier;`,context);
  for(const identifier of ['U0030','S00110','1234A','001234']){
    assert.equal(context.normalizeReceivingTransactionIdentifier(` ${identifier} `,true),identifier);
  }
  assert.equal(context.normalizeReceivingTransactionIdentifier(' 6281234567890 ',false),'6281234567890');
  assert.match(receiving,/identifierPreserveExact:masterRecord\?\.found===true/);
  assert.match(receiving,/options\.identifierPreserveExact === true[\s\S]{0,90}options\.gtinResolution\?\.kind === "PHARMACY_LEARNED"/);
  assert.match(ui,/transactionId,[\s\S]{0,100}identifierPreserveExact:true,[\s\S]{0,260}kind:"PHARMACY_LEARNED"/);
  assert.match(workspace,/p_gtin:identifierDisplay/);
  assert.match(workspace,/resolution\.identifierDisplay \|\|[\s\S]{0,90}resolution\.identifierKey \|\|[\s\S]{0,90}tx\.gtin/);
});

test('learned receipts finalize the exact pending review intent without changing receipt idempotency',()=>{
  const migration=read('PHASE2C1157_LEARNED_RECEIPT_INTENT_FINALIZATION.sql');
  assert.match(migration,/create or replace function public\.append_pharmflow_learned_transaction_v3/);
  assert.match(migration,/on conflict\(pharmacy_id,transaction_id\) do nothing/);
  assert.match(migration,/for v_intent_id in[\s\S]*transaction_id=v_transaction_id[\s\S]*status='PENDING'/);
  assert.match(migration,/perform public\.try_finalize_pharmflow_needs_review_resolution_intent_v1\(v_intent_id\)/);
  assert.match(migration,/exception when others[\s\S]*helper_failure_count=helper_failure_count\+1/);
  assert.match(migration,/return true/);
});

test('Handheld History is recognized-scan history only and REVIEW is the single review entry point',()=>{
  const ui=read('ui.js');
  const history=ui.slice(ui.indexOf('function openHandheldScansPanel'),ui.indexOf('function setZebraInterfaceMode'));
  assert.match(ui,/btnHandheldNeedsReview"\)\.onclick=\(\)=>openNeedsReviewPanel\("RECEIVING"\)/);
  assert.doesNotMatch(history,/NEEDS REVIEW/);
  assert.doesNotMatch(history,/nrV2List\("RECEIVING"/);
  assert.match(history,/data-remove-last/);
});

test('Handheld compact controls and success acknowledgement use the existing Last Scan state',()=>{
  const ui=read('ui.js');
  const css=read('css/receiving-surface.css');
  assert.match(ui,/class="zebraControlGrid"/);
  assert.match(css,/\.handheldTopControl\{[\s\S]*height:34px/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(ui,/handheldScanSavedAck"\)\?\.setAttribute\("hidden",""\)/);
});

test('visible Settings Barcode Management route exposes the V2 controls before legacy import compatibility',()=>{
  const index=read('index.html');
  const ui=read('ui.js');
  const settings=index.slice(index.indexOf('id="page-settings"'),index.indexOf('id="page-settings"')+14000);
  assert.match(settings,/id="globalIdentifierMasterAdmin"/);
  assert.match(settings,/BARCODE MANAGEMENT/);
  assert.match(settings,/<h2>Item Barcodes<\/h2>/);
  assert.match(settings,/data-admin-identifier/);
  assert.match(settings,/data-admin-item-search/);
  assert.match(settings,/>Find<\/button>/);
  assert.match(settings,/>Search<\/button>/);
  assert.ok(settings.indexOf('id="globalIdentifierMasterAdmin"') < settings.indexOf('Global Master import and mapping-file compatibility'));
  assert.match(ui,/function renderV2IdentifierAdministration\(/);
  assert.match(ui,/renderV2IdentifierAdministration\(settingsMaster\)/);
  assert.match(ui,/IdentifierService\.searchItems\(value,12\)/);
  assert.match(ui,/barcodeList/);
  assert.match(ui,/Add Barcode/);
  assert.match(ui,/data-correct/);
  assert.match(ui,/data-remove/);
});

test('Handheld can reach the compact Needs Review and photo viewer without a second scan path',()=>{
  const ui=read('ui.js');
  const nextCss=read('css/pharmflow-next.css');
  const handheldCss=read('css/receiving-surface.css');
  assert.match(ui,/id="btnHandheldNeedsReview"/);
  assert.match(ui,/btnHandheldNeedsReview"\)\.onclick=\(\)=>openNeedsReviewPanel\("RECEIVING"\)/);
  assert.doesNotMatch(ui,/async function openNeedsReviewPanel\(workflow="RECEIVING"\)\{\s*if\(typeof isLikelyZebraDevice/);
  assert.doesNotMatch(nextCss,/body\.zebraDevice #needsReviewOverlay\{display:none/);
  assert.match(handheldCss,/body\.zebraDevice \.needsReviewOverlay/);
  assert.match(handheldCss,/body\.zebraDevice \.needsReviewPhotoViewer\{z-index:1010/);
  assert.match(ui,/if\(handheld\) focusScannerInput\?\.\(\)/);
});

test('loaded legacy Global Master compatibility code has no learned-mapping resolver or writer',()=>{
  const master=read('js/master-gtin.js');
  assert.doesNotMatch(master,/resolve_pharmacy_learned_gtin/);
  assert.doesNotMatch(master,/learn_pharmacy_gtin/);
  assert.doesNotMatch(master,/correct_pharmacy_learned_gtin/);
  assert.doesNotMatch(master,/remove_pharmacy_learned_gtin/);
  assert.match(master,/function getMasterGTINRecordByGTIN\(/,'Expiry retains its read-only legacy Global Master lookup');
});

test('Settings leads with simplified Barcode Management while preserving import compatibility',()=>{
  const index=read('index.html');
  assert.match(index,/<h2>Item Barcodes<\/h2>/);
  assert.match(index,/BARCODE MANAGEMENT/);
  assert.ok(index.indexOf('id="globalIdentifierMasterAdmin"') < index.indexOf('Global Master import and mapping-file compatibility'));
  assert.match(index,/Update Global GTIN Import/);
  assert.match(index,/Mapping-file compatibility/);
});

test('Stage 2 loads one coherent cache-versioned startup asset set',()=>{
  const index=read('index.html');
  const ui=read('ui.js');
  const stage2Assets=[
    'js/utils.js',
    'ui.js',
    'js/identifier-service.js',
    'js/receiving.js',
    'js/orders.js',
    'js/needs-review.js',
    'js/app.js'
  ];
  for(const asset of stage2Assets){
    const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(index,new RegExp(`<script src="${escaped}\\?v=RECEIVING_U0030_RECOVERY2"><\\/script>`),`${asset} must use the coherent U0030 recovery asset version`);
  }
  assert.match(index,/<script src="js\/master-gtin\.js\?v=RECEIVING_U0030_RECOVERY2"><\/script>/);
  assert.match(index,/<script src="js\/state\.js\?v=RECEIVING_U0030_RECOVERY2"><\/script>/);
  assert.match(index,/<link rel="stylesheet" href="css\/pharmflow-next\.css\?v=RECEIVING_U0030_RECOVERY2">/);
  assert.match(index,/<link rel="stylesheet" href="css\/receiving-surface\.css\?v=RECEIVING_U0030_RECOVERY2">/);
  assert.doesNotThrow(()=>new Function(ui),'the cache-busted UI script must parse before application startup');
  assert.doesNotThrow(()=>new Function(read('js/app.js')),'the cache-busted application bootstrap script must parse before startup');
});

test('authenticated manifest hydration loads UI globals before the application bootstrap',()=>{
  const index=read('index.html');
  const ui=read('ui.js');
  const workspace=read('cloud-workspace.js');
  const app=read('js/app.js');
  assert.ok(index.indexOf('ui.js?v=RECEIVING_U0030_RECOVERY2') < index.indexOf('cloud-workspace.js?v='));
  assert.ok(index.indexOf('cloud-workspace.js?v=') < index.indexOf('js/app.js?v=RECEIVING_U0030_RECOVERY2'));
  assert.match(ui,/function initializeUI\(/);
  assert.match(ui,/function refreshEntireUI\(/);
  assert.match(workspace,/refreshEntireUI\(\)/);
  assert.match(app,/initializeUI\(\)/);
  assert.doesNotThrow(()=>new Function(workspace),'the manifest hydration script must parse before authenticated startup');
});


test("alphanumeric scanner identifiers preserve exact identity before V2 resolution",()=>{
  const scanner=read("js/scanner.js");
  const handheld=read("js/handheld-runtime.js");
  assert.match(scanner,/\[A-Za-z\]\/\.test\(cleaned\)/);
  assert.match(scanner,/parsed\.identifierDisplay=cleaned/);
  assert.match(scanner,/parsed\.gtin=cleaned/);
  assert.match(handheld,/nonGs1Alphanumeric/);
  assert.match(handheld,/parsed\.identifierDisplay=cleaned/);
  assert.match(handheld,/parsed\.gtin=cleaned/);
  for(const identifier of ["BT 122585","U0030","S00110","1234A"]){
    assert.ok(/[A-Za-z]/.test(identifier),identifier);
  }
});


test('Global Identifier writes use the authoritative reference-pharmacy gate',()=>{
  const migration=read('PHASE2C1159_HHP084_GLOBAL_IDENTIFIER_AUTH.sql');
  assert.match(migration,/HHP084/);
  assert.match(migration,/pm\.active is true/);
  assert.match(migration,/p\.active is true/);
  assert.match(migration,/p\.status = 'active'/);
  for(const rpc of [
    'add_pharmflow_global_identifier_v2',
    'correct_pharmflow_global_identifier_v2',
    'remove_pharmflow_global_identifier_v2',
    'create_pharmflow_global_item_v2'
  ]){
    const start=migration.indexOf('function public.'+rpc);
    assert.notEqual(start,-1,rpc);
    const body=migration.slice(start,migration.indexOf('end $$;',start)+7);
    assert.match(body,/pharmflow_is_reference_master_admin_v1\(\)/,rpc);
  }
});


test("reference pharmacy learning is centralized for Receiving and future Expiry reuse",()=>{
  const service=read("js/identifier-service.js");
  const ui=read("ui.js");
  assert.match(service,/isReferencePharmacy\(\)/);
  assert.match(service,/pharmacy_code[\s\S]*HHP084/);
  assert.match(service,/async learnIdentifier\(/);
  assert.match(service,/learn_pharmflow_identifier_v1/);
  assert.match(service,/p_global_operation_id:operationId/);
  assert.match(service,/p_pharmacy_operation_id:globalThis\.crypto\.randomUUID\(\)/);
  assert.match(service,/return row\?\.pharmacyMapping/);
  assert.match(ui,/IdentifierService\.learnIdentifier\(/);
  assert.doesNotMatch(ui,/Needs Review learns only in the current pharmacy/);
});


test("Receiving report uses attributed ledger totals and normalized search",()=>{
  const reports=read("js/reports.js");
  const ui=read("ui.js");
  const css=read("css/receiving-surface.css");
  const start=reports.indexOf("function buildReceivedQuantityByOrder");
  const end=reports.indexOf("function getOperationalGroupForReceivingRow",start);
  const aggregation=reports.slice(start,end);
  assert.match(aggregation,/receivingHistory/);
  assert.doesNotMatch(aggregation,/item\?\.receivedQty/);
  assert.doesNotMatch(aggregation,/remainder/);
  assert.match(ui,/function normalizeReceivingSearchText/);
  assert.match(ui,/terms\.every\(term=>haystack\.includes\(term\)\)/);
  assert.match(css,/#receivingInlineResult[\s\S]*display:none/);
});
