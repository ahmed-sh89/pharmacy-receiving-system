const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function harness(canCreate=true){
 const {document,window}=parseHTML('<html><body><section id="case"><div class="expiryGlobalSearchRow"><input data-master-search="0"></div><div data-master-matches="0"></div><div data-master-selection="0" hidden></div></section></body></html>');
 const timers=[],calls=[],section=document.getElementById('case');
 const c={document,window,console,toSafeString:v=>String(v??''),escapeHTML:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},IdentifierService:{searchItems:async q=>[{item_code:'00123',item_name:'Test Item',identifiers:['OLD1','OLD2']}]},ExpiryReviewBackend:{resolve:async(...args)=>{calls.push(args);}},};
 const src=fs.readFileSync('ui.js','utf8');vm.runInNewContext(src.slice(src.indexOf('function expiryGlobalMasterSummary'),src.indexOf('async function openExpiryNeedsReviewPanel')),c);
 c.mountExpiryReviewResolver(section,{review_id:'review1',identifier_display:'S00110'},0,{canCreate,overlay:document.body,onResolved:async()=>calls.push('refreshed')});
 return {section,document,window,calls,c,timers};
}
test('Existing search selects exact item and retains original scanned barcode',async()=>{
 const h=harness();const input=h.section.querySelector('input');input.value='00123';input.dispatchEvent(new h.window.Event('input'));await h.timers.pop()();h.section.querySelector('[data-global-match]').click();
 assert.match(h.section.querySelector('[data-master-selection]').textContent,/OLD1.*OLD2/);assert.match(h.section.textContent,/S00110/);
 await h.section.querySelector('[data-confirm-resolution]').onclick();assert.equal(h.calls[0][0],'review1');assert.equal(h.calls[0][1].item_code,'00123');assert.equal(h.calls[0][3],null);
});
test('Create mode has six exact Groups and immutable scanned barcode; local-only account has no create action',()=>{
 const h=harness();h.section.querySelector('[data-create-mode]').click();
 const values=[...h.section.querySelectorAll('select option')].map(o=>o.value).filter(Boolean);
 assert.deepEqual(values,['Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement']);
 assert.equal(h.section.querySelector('[name=barcode]').value,'S00110');assert.equal(h.section.querySelector('[name=barcode]').hasAttribute('readonly'),true);
 assert.equal(h.section.querySelector('[name=item_code]').value,'');assert.equal(harness(false).section.querySelector('[data-create-mode]'),null);
});
test('Ambiguous response freezes payload, retains capture and permits only same-resolution retry',async()=>{
 const h=harness();h.c.ExpiryReviewBackend.resolve=async()=>{throw Error('network');};const input=h.section.querySelector('input');input.value='Item';input.dispatchEvent(new h.window.Event('input'));await h.timers.pop()();h.section.querySelector('[data-global-match]').click();const confirm=h.section.querySelector('[data-confirm-resolution]');await confirm.onclick();assert.equal(confirm.disabled,false);assert.equal(confirm.textContent,'Retry Resolution');assert.match(h.section.querySelector('[data-resolution-status]').textContent,/retained/);assert.equal(input.disabled,true);
});
