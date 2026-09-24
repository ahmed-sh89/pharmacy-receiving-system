const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const ui=fs.readFileSync("ui.js","utf8");
const needs=fs.readFileSync("js/needs-review.js","utf8");
const identifiers=fs.readFileSync("js/identifier-service.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sql=fs.readFileSync("PHASE2C1158_TARGETED_IDENTIFIER_ADMIN.sql","utf8");

test("Handheld review attribution never falls through ambiguous scope",()=>{
  assert.match(needs,/isLikelyZebraDevice[\s\S]*selected\.length===1 \? selected\[0\] : ""/);
});
test("Handheld history is current assigned-order scoped",()=>{
  assert.match(ui,/assignedSet\.size>0 && assignedSet\.has\(txOrder\)/);
});
test("PC Needs Review counter and panel use current order scope",()=>{
  assert.match(ui,/filterNeedsReviewRowsToCurrentOrderScope\(await loadNeedsReviewRows\("RECEIVING",null\)\)/);
  assert.match(ui,/rawRows=filterNeedsReviewRowsToCurrentOrderScope\(await loadNeedsReviewRows\(workflow,null\)\)/);
});
test("Handheld Needs Review is view only and identifier admin is Settings only",()=>{
  assert.match(ui,/VIEW ONLY/);
  assert.doesNotMatch(ui,/<details class="needsReviewAdmin">/);
  assert.match(ui,/Identifier administration lives only in Settings/);
});
test("Settings has one simple search field",()=>{
  assert.match(html,/label>Search Item/);
  assert.match(html,/Item Name, Item Code, or GTIN \/ Barcode/);
  assert.doesNotMatch(html,/data-admin-item-search/);
});
test("Identifier persistence routes through server pharmacy policy",()=>{
  assert.match(identifiers,/route_pharmflow_identifier_add_v1/);
  assert.match(ui,/IdentifierService\.addForCurrentPharmacy/);
});
test("Reference pharmacy policy is server authoritative",()=>{
  assert.match(sql,/p\.code='HHP084'/);
  assert.match(sql,/return 'GLOBAL'/);
  assert.match(sql,/return 'PHARMACY'/);
  assert.match(sql,/pharmflow_is_reference_master_admin_v1/);
});
test("Search supports exact-text identifiers without numeric coercion",()=>{
  assert.match(sql,/identifier_key=public\.pharmflow_identifier_key_v2\(p_query\)/);
  assert.doesNotMatch(sql,/regexp_replace|lpad\(|::bigint|::numeric/);
});
test("Migration does not rewrite receiving or review rows",()=>{
  assert.doesNotMatch(sql,/update\s+public\.pharmflow_needs_review_v2/i);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.pharmflow_needs_review_v2/i);
  assert.doesNotMatch(sql,/update\s+public\.pharmflow_receiving_transactions/i);
});

test("Link and Resolve keeps pharmacy learned provenance scoped",()=>{\n  assert.ok(ui.includes('mappingScope==="PHARMACY"'));\n  assert.ok(ui.includes('kind:"PHARMACY_LEARNED"'));\n  assert.ok(ui.includes("IdentifierService.addForCurrentPharmacy"));\n});\n