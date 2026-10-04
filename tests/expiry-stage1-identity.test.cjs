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

test('Expiry known-item save writes current verified state and immutable event through Stage 1 RPC',()=>{
  const expiry=read('js/expiry.js');
  assert.match(expiry,/save_pharmacy_expiry_verified_state_v1/);
  assert.match(expiry,/p_identifier_display: item\.identifierDisplay \|\| item\.gtin/);
  assert.match(expiry,/p_event_type: "CAPTURE"/);
  assert.doesNotMatch(expiry,/authRpc\("save_pharmacy_expiry_capture_smart"/);
});

test('Desktop exposes Current Expiry List while Handheld keeps it out of the shelf workflow',()=>{
  const html=read('index.html');
  const css=read('css/dashboard.css');
  assert.match(html,/id="expiryCurrentStateBody"/);
  assert.match(html,/Current Expiry List/);
  assert.match(html,/>Identifier</);
  assert.match(css,/body\.zebraDevice \.expiryCurrentWorkspace\{display:none!important\}/);
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





test('Expiry operational workspace is visually dominant and has no legacy WORKER mutation',()=>{
  const html=read('index.html');
  const css=read('css/dashboard.css');
  const js=read('js/expiry.js');

  assert.doesNotMatch(html,/for="expiryWorkerSelect">(?:WORKER|OPERATOR)<\/label>/);
  assert.match(html,/id="expiryWorkerSelect" aria-label="Operator"/);
  assert.doesNotMatch(js,/label\.textContent="WORKER"/);
  assert.match(js,/<option value="">Select\.\.\.<\/option>/);

  assert.match(css,/grid-template-columns:150px minmax\(420px,1fr\) 86px 118px 104px 145px!important/);
  assert.match(css,/grid-template-areas:"operator scan qty month year save"/);
  assert.match(css,/\.expiryEntryGrid label>span\{display:none!important\}/);
  assert.match(css,/grid-template-areas:"heading name code identifier category batch serial recent"/);
  assert.match(css,/min-height:64px!important/);
  assert.doesNotMatch(css,/\/\* ---------- Near Expiry desktop ---------- \*\//);
});

test('Expiry desktop keeps page fixed and scrolls only Current Expiry List',()=>{
  const css=read('css/dashboard.css');
  assert.match(css,/#zebraExpiryShell\.appPage\.active\{[\s\S]*?height:calc\(100vh - 76px\)!important;min-height:0!important;[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.expiryCurrentWorkspace\{[\s\S]*?flex:1 1 0!important;[\s\S]*?min-height:0!important;[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.expiryCurrentTableWrap\{[\s\S]*?flex:1 1 0!important;[\s\S]*?min-height:0!important;[\s\S]*?overflow-y:auto!important/);
  assert.match(css,/overscroll-behavior:contain!important/);
});
