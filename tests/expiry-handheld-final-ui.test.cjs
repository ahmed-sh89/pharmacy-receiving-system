const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');

test('Handheld month options are consistently padded while values and Desktop labels stay unchanged',()=>{
 for(const handheld of [true,false]){
  const h=harness(handheld);let months;
  h.c.buildExpirySelectOptions=(el,options)=>{if(el.id==='expiryMonth')months=options;};
  h.c.populateExpiryDateDropdowns();
  assert.equal(months.length,13);
  for(let n=1;n<=12;n++){assert.equal(months[n].value,String(n));assert.equal(months[n].label,`${handheld?String(n).padStart(2,'0'):n} · ${h.c.expiryMonthShortName(n)}`);}
  h.c.setExpiryControlValue(h.e('expiryMonth'),'6');assert.equal(h.c.expiryControlValue(h.e('expiryMonth')),'6');
 }
});
test('Existing month popup has adequate label space without wrapping, scoped only to Handheld',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8');
 assert.match(css,/body\.zebraDevice #zebraExpiryShell #expiryMonth \.pfSelectMenu\{width:max-content;min-width:max\(100%,140px\)\}/);
 assert.match(css,/body\.zebraDevice #zebraExpiryShell #expiryMonth \.pfSelectOption\{white-space:nowrap\}/);
});
for(const handheld of [true,false])test(`${handheld?'Handheld hides':'Desktop retains'} Serial without losing parsed data; batch quantity greater than one saves once`,async()=>{
 const h=harness(handheld),field={hidden:false};h.e('expirySerialInput').closest=()=>field;
 vm.runInContext(fs.readFileSync('js/utils.js','utf8')+fs.readFileSync('js/scanner.js','utf8'),h.c);
 h.c.engine.selectedWorkerId='worker1';
 const raw='0106281086107829173002181003077\x1d218R0PSYDT0SS50';
 await h.c.resolveExpiryScannedValue(raw);
 assert.equal(field.hidden,handheld);assert.equal(h.e('expirySerialInput').value,'8R0PSYDT0SS50');assert.equal(h.c.engine.scannedGS1.serial,'8R0PSYDT0SS50');
 h.e('expiryQuantity').value='3';await h.c.saveExpiryCapture();
 const writes=h.calls.filter(c=>c.name===`save_pharmflow_expiry_${handheld?'session_capture_v2':'desktop_capture_v1'}`);
 assert.equal(writes.length,1);assert.equal(writes[0].payload.p_capture.quantity,3);assert.equal(writes[0].payload.p_capture.sample_serial,'8R0PSYDT0SS50');assert.equal(writes[0].payload.p_capture.batch_no,'03077');
 assert.equal(h.receipts.size,1);assert.equal([...h.receipts.values()][0].quantity,3);
});
