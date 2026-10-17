const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld status stays in the header and Desktop status remains available',()=>{
 for(const handheld of [true,false]){const h=harness(handheld);h.c.setExpiryStatus('ready','READY TO SCAN');assert.equal(h.e('expiryDesktopStatus').hidden,handheld);assert.match(h.e('expiryScanStatus').textContent,/ready to scan/i);h.c.setExpiryStatus('error','SCAN REJECTED');assert.equal(h.e('expiryDesktopStatus').hidden,handheld);assert.equal(h.e('expiryScanStatus').textContent,'SCAN REJECTED');}
});
