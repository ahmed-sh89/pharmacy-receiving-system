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
