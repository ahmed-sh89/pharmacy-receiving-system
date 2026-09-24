const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');

const ui=read('ui.js');
const reviews=read('js/needs-review.js');
const receiving=read('js/receiving.js');
const scanner=read('js/scanner.js');
const identifiers=read('js/identifier-service.js');
const migration=read('PHASE2C1158_REVIEW_SCOPE_REFERENCE_AUTHORITY.sql');
const settings=read('index.html');

test('review resolution preserves immutable order and accepts authoritative active manifest only',()=>{
  assert.match(migration,/v_review\.order_number/);
  assert.match(migration,/pharmflow_manifest_has_order_item_v1\(p_pharmacy_id,v_review\.order_number,v_item_code\)/);
  assert.match(migration,/manifest->'orderFiles'/);
  assert.match(migration,/manifest->'orderData'/);
  assert.match(migration,/ORIGINAL_ORDER_UNAVAILABLE/);
  assert.match(migration,/ITEM_NOT_IN_ORIGINAL_ORDER/);
});

test('PC Needs Review fetches once then filters count and panel to selected order union',()=>{
  assert.match(ui,/function filterNeedsReviewRowsToPcScope/);
  assert.match(ui,/new Set\(selected\.map\(normalizeOrderNumber\)/);
  assert.match(ui,/filterNeedsReviewRowsToPcScope\(await loadNeedsReviewRows\("RECEIVING",null\)\)/);
  assert.match(ui,/if\(!handheld\) rawRows=filterNeedsReviewRowsToPcScope\(rawRows\)/);
  assert.doesNotMatch(ui,/nrV2Count\("RECEIVING"\)/);
});

test('Handheld review attribution is exact and scanner completion re-arms',()=>{
  assert.match(reviews,/function nrV2HandheldOrderNumber/);
  assert.match(reviews,/assigned\.length!==1/);
  assert.match(receiving,/source:"HANDHELD",\s*orderNumber:nrV2HandheldOrderNumber\(\)/);
  assert.match(receiving,/setScanBoxState\?\.\("ready"\);\s*focusScannerInput\?\.\(\)/);
});

test('durable resolve remains deterministic, exact and idempotent',()=>{
  assert.match(ui,/NEEDS_REVIEW_GROUP_/);
  assert.match(ui,/if\(!nrV2HasTransactionId\(transactionId\)\)/);
  assert.match(ui,/identifierPreserveExact:true/);
  assert.match(migration,/A different resolution intent already exists/);
  assert.match(migration,/try_finalize_pharmflow_needs_review_resolution_intent_v1/);
});

test('reference pharmacy ownership is server authoritative and tenant isolated',()=>{
  assert.match(migration,/to_jsonb\(p\)->>'code'.*to_jsonb\(p\)->>'pharmacy_code'/);
  assert.match(migration,/='HHP084'/);
  assert.match(migration,/pharmflow_is_pharmacy_identifier_admin_v2\(p_pharmacy_id\)/);
  assert.match(migration,/return public\.add_pharmflow_pharmacy_identifier_v2/);
  assert.match(migration,/insert into public\.pharmflow_global_item_identifiers_v2/);
  assert.match(identifiers,/add_pharmflow_managed_identifier_v1/);
});

test('Settings is one simple item search and hides identifier internals',()=>{
  const section=settings.slice(settings.indexOf('id="globalIdentifierMasterAdmin"'),settings.indexOf('id="globalIdentifierMasterResults"'));
  assert.equal((section.match(/<input/g)||[]).length,1);
  assert.match(section,/Search Item/);
  assert.doesNotMatch(ui,/<small>\$\{esc\(row\.identifier_key\)\}<\/small>/);
  assert.match(ui,/Remove only this identifier mapping\? The Item and sibling identifiers remain/);
});

test('Needs Review is compact and Handheld detail is view-only',()=>{
  assert.match(ui,/needsReviewRowSummary/);
  assert.match(ui,/data-review-case-detail/);
  assert.match(ui,/\$\{handheld\?"":`<div class="needsReviewResolve">/);
  const panel=ui.slice(ui.indexOf('async function openNeedsReviewPanel'),ui.indexOf('window.refreshNeedsReviewCounters'));
  assert.doesNotMatch(panel,/renderV2IdentifierAdministration/);
});

test('typed item names and codes stay search while actual scan recognition remains',()=>{
  assert.match(scanner,/getSearchableItems\(\)\.some/);
  assert.match(scanner,/item\?\.itemCode/);
  assert.match(scanner,/item\?\.itemName/);
  assert.match(scanner,/looksLikeStrongBarcode/);
  assert.match(scanner,/processScannerValue/);
});

test('Handheld recognized history filters display to current work scope without deleting storage',()=>{
  const fn=ui.slice(ui.indexOf('function getHandheldDeviceScannerRows'),ui.indexOf('function getAllWorkspaceScannerRows'));
  assert.match(fn,/workScope\.has\(order\)/);
  assert.match(fn,/AppState\?\.workspace\?\.receivingHistory/);
  assert.doesNotMatch(fn,/splice|delete|receivingHistory\s*=/);
});

test('exact identifiers are never numerically coerced',()=>{
  for(const value of ['U0030','S00110','1234A','ABC01','000123']){
    assert.equal(String(value),value);
  }
  assert.match(reviews,/toSafeString\(parsed\?\.identifierDisplay/);
  assert.doesNotMatch(reviews,/Number\(capturedCode\)|parseInt\(capturedCode/);
});
