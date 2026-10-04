const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');

test('Expiry resolves products through authoritative IdentifierService V2 boundary',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/IdentifierService\.resolve\(identifierDisplay\)/);
  assert.doesNotMatch(expiry,/getMasterGTINRecordByGTIN\(gtin\)/);
  assert.doesNotMatch(expiry,/replace\(\/\\D\/g/);
});

test('Expiry preserves exact alphanumeric identifier display values',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/function expiryIdentifierFromScan\(cleaned, parsed\)/);
  assert.match(expiry,/return raw;/);
  assert.match(expiry,/identifierDisplay:resolvedIdentifier/);
  assert.match(expiry,/gtin:resolvedIdentifier/);
});

test('Expiry keeps GS1 operational evidence separate from product identity',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/parsed\?\.lot/);
  assert.match(expiry,/parsed\?\.serial/);
  assert.match(expiry,/parsed\?\.expiry/);
  assert.match(expiry,/ExpiryCaptureEngine\.scannedGS1 = parsed/);
});

test('Expiry unknown identifiers preserve exact value for review instead of numeric collapse',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/identifierDisplay,/);
  assert.match(expiry,/rawBarcode:cleaned/);
  assert.match(expiry,/expiryItemGTIN"\)\.textContent=identifierDisplay/);
});

test('Expiry known-item save uses additive V2 current-state RPC',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/save_pharmacy_expiry_verified_state_v2/);
  assert.match(expiry,/p_identifier_display: item\.identifierDisplay \|\| item\.gtin/);
  assert.match(expiry,/p_event_type: "CAPTURE"/);
});

test('Desktop exposes Current Expiry workspace while Handheld keeps it out of shelf workflow',()=>{
  const html=read('index.html');
  const css=read('css/dashboard.css');
  assert.match(html,/id="expiryCurrentStateBody"/);
  assert.match(html,/Current Expiry/);
  assert.match(html,/<th>Product<\/th><th>Category<\/th>/);
  assert.match(css,/body\.zebraDevice \.expiryKpiRow,body\.zebraDevice \.expiryCurrentWorkspace\{display:none!important\}/);
});

test('Expiry Stage 1 schema is additive, tenant scoped and preserves immutable events',()=>{
  const sql=read('PHASE2C1176_EXPIRY_STAGE1_CURRENT_STATE.sql');
  assert.match(sql,/create table if not exists public\.pharmflow_expiry_current_state_v1/);
  assert.match(sql,/create table if not exists public\.pharmflow_expiry_events_v1/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/is_pharmacy_member\(pharmacy_id\)/);
  assert.match(sql,/save_pharmacy_expiry_verified_state_v1/);
  assert.match(sql,/event_type in \('CAPTURE','RECOUNT','CLEARED'\)/);
  assert.doesNotMatch(sql,/drop table/i);
  assert.doesNotMatch(sql,/truncate/i);
});

test('Expiry is reachable from both Desktop sidebar and Handheld workspace chooser',()=>{
  const html=read('index.html');
  const ui=read('ui.js');
  const config=read('js/config.js');
  assert.match(html,/data-page="expiry"[^>]*aria-label="Near Expiry"/);
  assert.match(config,/expiry:\s*\{/);
  assert.match(config,/elementId:\s*\n\s*"zebraExpiryShell"/);
  assert.match(ui,/id="btnZebraExpiryMode"/);
  assert.match(ui,/btnZebraExpiryMode"\)\?\.addEventListener/);
  assert.match(ui,/setZebraExpiryMode\(\)/);
  assert.doesNotMatch(ui,/zebraModeExpiry" type="button" disabled/);
});





test('Expiry desktop has one canonical visual owner with no stacked override layer',()=>{
  const css=read('css/dashboard.css');
  assert.equal((css.match(/EXPIRY — CANONICAL DESKTOP OWNER/g)||[]).length,1);
  assert.doesNotMatch(css,/EXPIRY DESKTOP OPERATIONS — Stage 1 Build 1/);
  assert.match(css,/grid-template-areas:"scan qty month year save operator"/);
  assert.match(css,/\.expiryHandheldItemCard\{display:none!important\}/);
});

test('Expiry desktop keeps page fixed and scrolls only Current Expiry List',()=>{
  const css=read('css/dashboard.css');
  assert.match(css,/#zebraExpiryShell\.appPage\.active\{[\s\S]*?height:calc\(100vh - 76px\)!important;min-height:0!important;[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.expiryCurrentWorkspace\{[\s\S]*?flex:1 1 0!important;[\s\S]*?min-height:0!important;[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.expiryCurrentTableWrap\{[\s\S]*?flex:1 1 0!important;[\s\S]*?min-height:0!important;[\s\S]*?overflow-y:auto!important/);
  assert.match(css,/overscroll-behavior:contain!important/);
});

test('Expiry desktop operations keep operator optional while Handheld remains guarded',()=>{
  const html=read('index.html');
  const js=read('js/expiry.js');
  assert.match(html,/Operator \(optional\)/);
  assert.match(js,/expiryIsHandheld\(\) && !ExpiryCaptureEngine\.selectedWorkerId/);
  assert.match(js,/save_pharmacy_expiry_verified_state_v2/);
});

test('Expiry desktop current list exposes Category filter and edit-delete controls',()=>{
  const html=read('index.html');
  const js=read('js/expiry.js');
  assert.match(html,/id="expiryCategoryFilter"/);
  assert.match(html,/<th>Product<\/th><th>Category<\/th>/);
  assert.match(js,/expiryPopulateCategoryFilter/);
  assert.match(js,/data-expiry-edit/);
  assert.match(js,/data-expiry-clear/);
});

test('Expiry desktop hides duplicate Last Scan surface without changing Handheld item card',()=>{
  const html=read('index.html');
  const css=read('css/dashboard.css');
  assert.match(html,/expiryItemCard expiryHandheldItemCard/);
  assert.match(css,/body:not\(\.zebraDevice\) #zebraExpiryShell \.expiryHandheldItemCard\{display:none!important\}/);
});

test('Expiry current-state actions preserve scan-add, audited correction and clear semantics',()=>{
  const js=read('js/expiry.js');
  const saveSql=read('PHASE2C1177_EXPIRY_DESKTOP_OPERATIONS_V2.sql');
  const correctionSql=read('PHASE2C1178_EXPIRY_CORRECTION_AUDIT_V1.sql');
  assert.match(js,/correct_pharmacy_expiry_current_state_v1/);
  assert.match(js,/p_event_type:"CLEARED"/);
  assert.match(saveSql,/v_event_type='CAPTURE'.*coalesce\(v_previous_quantity,0\)\+p_quantity/s);
  assert.match(correctionSql,/previous_batch_no/);
  assert.match(correctionSql,/previous_expiry_month/);
  assert.match(correctionSql,/previous_expiry_year/);
  assert.doesNotMatch(saveSql+correctionSql,/drop table|truncate/i);
});

test('Expiry desktop Scan Search uses authoritative V2 product and identifier services',()=>{
  const html=read('index.html');
  const js=read('js/expiry.js');
  assert.match(html,/id="expirySearchResults"/);
  assert.match(js,/search_pharmflow_global_items_v2/);
  assert.match(js,/list_pharmflow_global_item_identifiers_v2/);
  assert.match(js,/inputmode",expiryIsHandheld\(\)\?"none":"text"/);
});
test('Expiry desktop correction is inline and no browser prompt patch remains',()=>{
  const js=read('js/expiry.js');
  assert.match(js,/data-edit-batch/);
  assert.match(js,/data-edit-month/);
  assert.match(js,/data-edit-year/);
  assert.match(js,/data-edit-qty/);
  assert.doesNotMatch(js,/window\.prompt\(/);
});

test('Expiry desktop paste routes barcode-like identifiers through scan resolution',()=>{
  const js=read('js/expiry.js');
  assert.match(js,/looksLikeExpiryIdentifier/);
  assert.match(js,/barcode\.addEventListener\("paste"/);
  assert.match(js,/\^\\d\{8,18\}\$/);
  assert.match(js,/if\(looksLikeExpiryIdentifier\(value\)\) commitHardwareScan\(\)/);
  assert.match(js,/desktopSearchTimer=setTimeout/);
});

test('Expiry desktop shows compact active item and auto-saves complete GS1 only',()=>{
 const html=read('index.html'),js=read('js/expiry.js'),css=read('css/dashboard.css');
 assert.match(html,/id="expiryActiveItem"/);
 assert.match(js,/renderExpiryActiveItem\(ExpiryCaptureEngine\.currentItem,parsed\|\|\{\}\)/);
 assert.match(js,/expiryCaptureHasCompleteAutoData/);
 assert.match(js,/await saveExpiryCapture\(\{auto:true\}\)/);
 assert.match(js,/currentItem\.needsReview\) return false/);
 assert.match(css,/grid-template-areas:"scan qty month year save operator" "active active active active active active"/);
});

test('Expiry desktop separates recent operational work from full current state',()=>{
 const html=read('index.html'),js=read('js/expiry.js');
 assert.match(html,/data-expiry-view="RECENT"/);
 assert.match(html,/data-expiry-view="CURRENT"/);
 assert.match(html,/<th>Item Code<\/th><th>Product Name<\/th><th>Category<\/th>/);
 assert.match(js,/desktopView: "RECENT"/);
 assert.match(js,/last_verified_at\|\|a\?\.updated_at/);
 assert.match(js,/slice\(0,10\)/);
});

test('Expiry manual search reuses Receiving result hierarchy and authenticated Global V2 contract',()=>{
 const js=read('js/expiry.js'),css=read('css/dashboard.css'),sql=read('PHASE2C1179_GLOBAL_V2_AUTHENTICATED_SEARCH_FIX.sql');
 assert.match(js,/class="smartSearchResult expirySearchResult"/);
 assert.match(js,/Item Code:/);
 assert.match(js,/expirySearchResultMeta/);
 assert.match(css,/\.expirySearchResultMain strong/);
 assert.match(sql,/grant execute on function public\.search_pharmflow_global_items_v2\(text,integer\) to authenticated/i);
 assert.doesNotMatch(sql,/auth\.uid\(\) is not null/i);
 assert.doesNotMatch(sql,/drop table|truncate/i);
});

test('Expiry manual search accepts authenticated RPC response envelope',()=>{
 const js=read('js/expiry.js');
 assert.match(js,/Array\.isArray\(response\?\.data\) \? response\.data/);
});

test('Expiry desktop search dropdown is not clipped by legacy scan-box overflow',()=>{
 const css=read('css/dashboard.css');
 assert.match(css,/body:not\(\.zebraDevice\) #zebraExpiryShell \.expiryScanBox\{position:relative!important;overflow:visible!important;z-index:50!important\}/);
 assert.match(css,/\.expirySearchResults\{position:absolute!important/);
});

test('Manual search selection renders Active Item and save feedback is strongly visible',()=>{
 const js=read('js/expiry.js'),css=read('css/dashboard.css');
 assert.match(js,/renderExpiryActiveItem\(ExpiryCaptureEngine\.currentItem,\{\}\)/);
 assert.match(js,/expiryRowSavedStrong/);
 assert.match(css,/tr\.expiryRowSavedStrong/);
 assert.match(css,/outline:3px solid #20a35a!important/);
});

test('Expiry desktop table remains readable and visually structured',()=>{
 const css=read('css/dashboard.css');
 assert.match(css,/\.expiryCurrentTable th\{padding:9px 8px!important;border-right:1px solid #d5e2ef!important;border-bottom:2px solid #9fbad6!important/);
 assert.match(css,/\.expiryCurrentTable th:nth-child\(1\)\{width:11%!important\}/);
 assert.match(css,/\.expiryCurrentTable th:nth-child\(2\)\{width:31%!important\}/);
 assert.match(css,/\.expiryRowAction\{min-width:48px!important;height:30px!important;padding:0 9px!important;font-size:11px!important\}/);
});
