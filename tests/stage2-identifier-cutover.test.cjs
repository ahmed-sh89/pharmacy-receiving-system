const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

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

test('Settings and Needs Review share one V2 Global Master administration renderer',()=>{
  const index=read('index.html');
  const ui=read('ui.js');
  assert.match(index,/id="globalIdentifierMasterAdmin"/);
  assert.match(index,/data-admin-identifier/);
  assert.match(ui,/function renderV2IdentifierAdministration\(/);
  assert.match(ui,/renderV2IdentifierAdministration\(settingsMaster\)/);
  assert.doesNotMatch(ui,/function initializeGlobalIdentifierMaster\(/);
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

test('Settings leads with V2 Global Master administration while preserving import compatibility',()=>{
  const index=read('index.html');
  assert.match(index,/<h2>Global Identifier Master<\/h2>/);
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
    assert.match(index,new RegExp(`<script src="${escaped}\\?v=RECEIVING_STAGE2_FINAL1"><\\/script>`),`${asset} must use the coherent Stage 2 asset version`);
  }
  assert.match(index,/<script src="js\/master-gtin\.js\?v=RECEIVING_STAGE2_FINAL1"><\/script>/);
  assert.match(index,/<link rel="stylesheet" href="css\/pharmflow-next\.css\?v=RECEIVING_STAGE2_FINAL1">/);
  assert.match(index,/<link rel="stylesheet" href="css\/receiving-surface\.css\?v=RECEIVING_STAGE2_FINAL1">/);
  assert.doesNotThrow(()=>new Function(ui),'the cache-busted UI script must parse before application startup');
  assert.doesNotThrow(()=>new Function(read('js/app.js')),'the cache-busted application bootstrap script must parse before startup');
});

test('authenticated manifest hydration loads UI globals before the application bootstrap',()=>{
  const index=read('index.html');
  const ui=read('ui.js');
  const workspace=read('cloud-workspace.js');
  const app=read('js/app.js');
  assert.ok(index.indexOf('ui.js?v=RECEIVING_STAGE2_FINAL1') < index.indexOf('cloud-workspace.js?v='));
  assert.ok(index.indexOf('cloud-workspace.js?v=') < index.indexOf('js/app.js?v=RECEIVING_STAGE2_FINAL1'));
  assert.match(ui,/function initializeUI\(/);
  assert.match(ui,/function refreshEntireUI\(/);
  assert.match(workspace,/refreshEntireUI\(\)/);
  assert.match(app,/initializeUI\(\)/);
  assert.doesNotThrow(()=>new Function(workspace),'the manifest hydration script must parse before authenticated startup');
});
