const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/dashboard.css','utf8');
const desktop=fs.readFileSync('js/expiry-desktop-v2.js','utf8');
const expiry=fs.readFileSync('js/expiry.js','utf8');

test('Desktop Expiry navigation puts Session Activity first and keeps all views visible',()=>{
 const nav=html.slice(html.indexOf('class="expiryWorkspaceNav"'),html.indexOf('</nav>',html.indexOf('class="expiryWorkspaceNav"')));
 assert.ok(nav.indexOf('btnExpirySessionView')<nav.indexOf('btnOpenExpiryInventory'));
 assert.ok(nav.indexOf('btnExpirySessionView')<nav.indexOf('btnExpiryNeedsReview'));
 assert.match(nav,/btnExpirySessionView[^>]*aria-selected="true"/);
 assert.match(nav,/btnOpenExpiryInventory[^>]*aria-selected="false"/);
 assert.match(css,/\.expiryWorkspaceNav button\[aria-selected="true"\]/);
 assert.match(nav,/id="expiryNeedsReviewCount"/);
 assert.match(desktop,/ExpiryReviewBackend\.refresh\(\)/);
 assert.match(nav,/disabled title="Expiry Needs Review is not available until its Staging backend contract is verified"/);
});

test('Handheld scan fields keep GS1 Batch and Serial adjacent, and Save respects viewport safe area',()=>{
 assert.match(html,/class="expiryReviewField expiryBatchField"/);
 assert.match(html,/class="expiryReviewField expirySerialField"/);
 assert.match(expiry,/const batchFromGS1=gs1\.batchFromGS1\?\?\(gs1\.format==="GS1"&&!!gs1\.lot\)/);
 assert.match(expiry,/const serialFromGS1=gs1\.serialFromGS1\?\?\(gs1\.format==="GS1"&&!!gs1\.serial\)/);
 assert.match(expiry,/batchInput\.readOnly=expiryIsHandheld\(\) && !!\(item && batchFromGS1\)/);
 assert.match(expiry,/serialInput\.readOnly=expiryIsHandheld\(\) && !!\(item && serialFromGS1\)/);
 assert.match(css,/\.expiryEntryGrid:has\(\.expirySerialField:not\(\[hidden\]\)\) \.expiryBatchField\{grid-column:1;grid-row:3\}/);
 assert.match(css,/\.expirySerialField\{grid-column:2;grid-row:3\}/);
 assert.match(css,/body\.zebraDevice #zebraExpiryShell #btnSaveExpiryCapture\{grid-row:6;position:sticky;bottom:max\(8px,env\(safe-area-inset-bottom,0px\)\)/);
 assert.doesNotMatch(css,/body\.zebraDevice\s*\{[^}]*overflow:\s*hidden/);
});
