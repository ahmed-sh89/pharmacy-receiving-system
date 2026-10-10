const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('js/expiry-scanner-diagnostic.js','utf8');
const markup=fs.readFileSync('index.html','utf8');

test('scanner metadata diagnostic is Staging gated, opt-in, bounded, and memory only',()=>{
 assert.match(source,/expiryScannerDiagnostics/);assert.match(source,/tovkcakucyagvbzvlnks/);
 assert.match(source,/const MAX=64,WINDOW_MS=10000/);assert.match(source,/events=\[\]/);
 assert.match(source,/valueLength:value\.length/);assert.match(source,/gsOffsets:gs\.slice/);assert.match(source,/aim:prefix\?prefix\[0\]/);assert.match(source,/separatorMarkers:separators\.slice/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|authRpc|fetch\(/);
 assert.match(markup,/id="expiryScannerDiagnosticToggle"[^>]*hidden/);
});
