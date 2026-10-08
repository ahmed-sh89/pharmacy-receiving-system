const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(handheld=false){
 const ids=[...fs.readFileSync('index.html','utf8').matchAll(/id="(expiry[^"]+|btnSaveExpiryCapture|btnExpiryQty[^" ]+|btnClearExpiryActive)"/g)].map(m=>m[1]);
 const timers=new Map(),calls=[],elements=new Map();let timer=0;
 function element(id){
  const classes=new Set(),listeners={};
  const el={id,value:'',textContent:'',innerHTML:'',dataset:{},style:{setProperty(){}},hidden:false,disabled:false,readOnly:false,isConnected:true,tagName:'INPUT',listeners,
   classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
   setAttribute(k,v){if(k==='disabled')this.disabled=true;else this[k]=v;},removeAttribute(k){if(k==='disabled')this.disabled=false;else delete this[k];},toggleAttribute(k,v){this[k]=v;},
   addEventListener(k,fn){(listeners[k]??=[]).push(fn);},dispatchEvent(e){for(const fn of listeners[e.type]||[])fn(e);},focus(){document.activeElement=this;},blur(){document.activeElement=null;},select(){},querySelectorAll(){return [];},querySelector(){return null;},closest(){return null;}
  };return el;
 }
 ids.forEach(id=>elements.set(id,element(id)));
 ['expiryMonth','expiryYear','expiryWorkerSelect'].forEach(id=>{const e=elements.get(id);e.dataset.expirySelect=id==='expiryMonth'?'month':id==='expiryYear'?'year':'worker';e.tagName='DIV';});
 const document={activeElement:null,body:element('body'),documentElement:element('html'),addEventListener(){},getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]};
 const c={document,console,Event:class{constructor(type){this.type=type;}},setTimeout(fn,ms){const id=++timer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},isLikelyZebraDevice:()=>handheld,toSafeString:v=>String(v??''),looksLikeStrongBarcode:raw=>raw.startsWith('(01)'),AuthState:{user:{id:'user1'},context:{pharmacy_id:'isolated-test'}},parseGS1Barcode:()=>({gtin:'04065272072977',identifierDisplay:'04065272072977',lot:'GS1-BATCH',serial:'GS1-SERIAL',expiry:'2027-08-31'}),IdentifierService:{resolve:async id=>({found:true,itemCode:'ITEM1',itemName:'Test Product',identifierDisplay:id,category:'Medicine'})},authRpc:async(name,payload)=>{calls.push({name,payload});return name==='save_pharmacy_expiry_verified_state_v2'?{state_id:'state1',event_id:'event1'}:[];},window:null};c.window=c;vm.createContext(c);
 vm.runInContext(fs.readFileSync('js/expiry.js','utf8')+'\nthis.engine=ExpiryCaptureEngine;',c);
 const drafts=new Map();c.ExpiryDraftStore={put:async(scope,draft)=>drafts.set(scope,structuredClone(draft)),get:async scope=>drafts.get(scope),remove:async scope=>drafts.delete(scope)};c.Blob=Blob;
 c.engine.draftReady=true;
 c.refreshExpiryCapturedCount=()=>{};c.refreshExpiryCurrentState=async()=>[];c.renderExpiryCurrentState=()=>{};
 return {c,drafts,e:id=>elements.get(id),calls,timers,flush(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}
test('Desktop complete GS1 stays unsaved and all review controls remain editable',async()=>{
 const h=harness();await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH');
 assert.equal(h.calls.length,0);assert.equal(h.e('expiryActiveItemName').textContent,'Test Product');
 assert.equal(h.e('expiryBatchInput').value,'GS1-BATCH');assert.equal(h.e('expirySerialInput').value,'GS1-SERIAL');
 assert.equal(h.e('expiryMonth').dataset.value,'8');assert.equal(h.e('expiryYear').dataset.value,'2027');assert.equal(h.e('expiryQuantity').value,'1');
 assert.equal(h.e('expiryQuantity').readOnly,false);assert.equal(h.e('expiryMonth').dataset.disabled,'false');assert.equal(h.e('expiryYear').dataset.disabled,'false');
 assert.equal([...h.timers.values()].some(t=>t.ms===30000),false);
});
test('Save uses edited Batch, Serial, Date, Quantity, exact identifier and null Desktop operator',async()=>{
 const h=harness();await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH');h.e('expiryBatchInput').value=' EDITED-BATCH ';h.e('expirySerialInput').value=' EDITED-SERIAL ';h.e('expiryQuantity').value='7';h.c.setExpiryControlValue(h.e('expiryMonth'),'9');h.c.setExpiryControlValue(h.e('expiryYear'),'2028');
 const session=[];h.c.recordExpirySessionCapture=p=>session.push(p);await h.c.saveExpiryCapture();
 assert.equal(h.calls.length,1);const p=h.calls[0].payload;
 assert.equal(p.p_batch_no,'EDITED-BATCH');assert.equal(p.p_sample_serial,'EDITED-SERIAL');assert.equal(p.p_quantity,7);assert.equal(p.p_expiry_month,9);assert.equal(p.p_expiry_year,2028);assert.equal(p.p_identifier_display,'04065272072977');assert.equal(p.p_worker_id,null);assert.equal(p.p_event_type,'CAPTURE');
 assert.equal(session[0].batch_no,'EDITED-BATCH');h.flush(500);h.flush(40);
 assert.equal(h.c.engine.currentItem,null);assert.equal(h.e('expiryBatchInput').value,'');assert.equal(h.e('expirySerialInput').value,'');assert.equal(h.e('expiryMonth').dataset.value,'');assert.equal(h.e('expiryYear').dataset.value,'');assert.equal(h.c.document.activeElement.id,'expiryBarcodeInput');
});
test('Ambiguous save retains review fields and blocks unsafe retry',async()=>{
 const h=harness();await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH');h.e('expiryBatchInput').value='KEEP';h.c.authRpc=async()=>{throw new Error('isolated failure');};h.c.console={error(){}};
 await h.c.saveExpiryCapture();h.flush(500);assert.equal(h.e('expiryBatchInput').value,'KEEP');assert.equal(h.c.engine.currentItem.itemCode,'ITEM1');assert.equal(h.e('btnSaveExpiryCapture').disabled,true);assert.equal(h.c.engine.saveUncertain,true);
});
test('Handheld retains worker guard, GS1 date locking and original GS1 payload',async()=>{
 const h=harness(true);assert.equal(await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH'),false);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831(10)GS1-BATCH');
 assert.equal(h.e('expiryQuantity').readOnly,true);assert.equal(h.e('expiryMonth').dataset.disabled,'true');h.e('expiryBatchInput').value='DESKTOP-ONLY';await h.c.saveExpiryCapture();assert.equal(h.calls[0].payload.p_batch_no,'GS1-BATCH');assert.equal(h.calls[0].payload.p_sample_serial,'GS1-SERIAL');assert.equal(h.calls[0].payload.p_worker_id,'worker1');
});
test('Critical capture IDs occur once and Session Activity markup is preserved',()=>{
 const html=fs.readFileSync('index.html','utf8');for(const id of ['expiryBarcodeInput','expiryCaptureValidation','expiryQuantity','expiryMonth','expiryYear','expiryBatchInput','expirySerialInput','btnExpiryQtyMinus','btnExpiryQtyPlus','btnSaveExpiryCapture','btnClearExpiryActive','expiryWorkerSelect','expiryCurrentStateBody','btnClearExpirySession','btnOpenExpiryInventory'])assert.equal(html.split(`id="${id}"`).length-1,1,id);
 const css=fs.readFileSync('css/dashboard.css','utf8');assert.doesNotMatch(css,/grid-area:(scan|qty|month|year|save|operator|active)!important/);
});

test('Compact rows have explicit siblings and no anonymous grid text',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const capture=html.slice(html.indexOf('<section class="expiryCaptureCard">'),html.indexOf('<div class="expiryItemCard expiryHandheldItemCard">'));
 assert.doesNotMatch(capture,/\\n/);
 const root={children:[]},stack=[root],nodes=[];
 for(const token of capture.matchAll(/<!--[^]*?-->|<\/?[a-z][^>]*>|[^<]+/gi)){
  const text=token[0];if(text.startsWith('<!--'))continue;
  if(text.startsWith('</')){const tag=text.match(/^<\/([\w-]+)/)[1];assert.equal(stack.pop().tag,tag,'balanced capture DOM');}
  else if(text.startsWith('<')){const tag=text.match(/^<([\w-]+)/)[1],id=text.match(/\bid="([^"]+)"/)?.[1],classes=text.match(/\bclass="([^"]+)"/)?.[1]?.split(' ')||[];
   const node={tag,id,classes,parent:stack.at(-1),children:[]};node.parent.children.push(node);nodes.push(node);if(!['input','br','img'].includes(tag))stack.push(node);
  }else if(text.trim()){stack.at(-1).children.push({text:text.trim()});}
 }
 const byClass=c=>nodes.find(n=>n.classes.includes(c)),byId=id=>nodes.find(n=>n.id===id);
 assert.deepEqual(byClass('expiryCaptureRow').children.filter(n=>n.classes?.some(c=>['expiryCapturePrimary','expiryActiveItem','expiryEntryGrid','expiryCaptureActions'].includes(c))).map(n=>n.classes[0]),['expiryCapturePrimary','expiryActiveItem','expiryEntryGrid','expiryCaptureActions']);
 assert.equal(byId('btnSaveExpiryCapture').parent,byClass('expiryCaptureActions'));
 assert.ok(capture.indexOf('class="expiryEntryGrid"')<capture.indexOf('id="btnSaveExpiryCapture"'),'Handheld DOM keeps Save after inputs');
 assert.equal(byId('expiryActiveItem').parent,byClass('expiryCaptureRow'));
 assert.equal(byId('btnClearExpiryActive').parent,byClass('expiryOperatorActions'));
 assert.equal(byClass('expiryEntryGrid').parent,byClass('expiryCaptureRow'));
 assert.equal(byClass('expiryCaptureRow').children.some(n=>n.text),false);
});

test('Capture has one canonical desktop owner and transparent handheld wrappers',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8'),theme=fs.readFileSync('css/pharmflow-next.css','utf8');
 const owner=css.indexOf('/* Expiry Desktop Capture — canonical');
 assert.equal(css.slice(0,owner).includes('body:not(.zebraDevice) #zebraExpiryShell .expiryCaptureRow'),false);
 assert.equal((css.match(/\.expiryCaptureRow\{display:/g)||[]).length,1);
 assert.match(css,/body:not\(\.zebraDevice\) #zebraExpiryShell \.expiryCaptureActions\{display:contents\}/);
 assert.match(css,/\.expirySaveButton\{grid-column:2;grid-row:2;/);
 assert.doesNotMatch(theme,/body:not\(\.zebraMode\) \.expiryCaptureCard/);
 assert.match(css,/\.expiryScanBox:focus-within\{border-color:[^;]+;box-shadow:none\}/);
 assert.match(css,/#expiryBarcodeInput:focus\{padding:0;border:0;outline:none;box-shadow:none\}/);
 assert.match(css,/body\.zebraDevice #zebraExpiryShell \.expiryCaptureActions\{display:contents\}/);
});

for(const [name,month,year,message,missing] of [
 ['Month','','2028','Enter expiry month',['expiryMonth']],
 ['Year','3','','Enter expiry year',['expiryYear']],
 ['Month + Year','','','Enter expiry month and year',['expiryMonth','expiryYear']]
])test('Missing '+name+' has visible red feedback and field errors without saving',async()=>{
 const h=harness();h.c.engine.currentItem={itemCode:'ITEM1'};h.e('expiryQuantity').value='1';h.c.setExpiryControlValue(h.e('expiryMonth'),month);h.c.setExpiryControlValue(h.e('expiryYear'),year);
 await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.e('expiryCaptureValidation').hidden,false);assert.equal(h.e('expiryCaptureValidation').textContent,message);
 for(const id of ['expiryMonth','expiryYear'])assert.equal(h.e(id).classList.contains('expiryFieldError'),missing.includes(id));
 for(const id of missing)assert.equal(h.e(id)['aria-invalid'],'true');
});
test('Correcting date selections clears each error and concise feedback through real change handlers',async()=>{
 const h=harness();h.c.bindExpiryCaptureUI();h.c.engine.currentItem={itemCode:'ITEM1'};h.e('expiryQuantity').value='1';await h.c.saveExpiryCapture();
 h.c.setExpiryControlValue(h.e('expiryMonth'),'3',true);assert.equal(h.e('expiryMonth').classList.contains('expiryFieldError'),false);assert.equal(h.e('expiryYear').classList.contains('expiryFieldError'),true);assert.equal(h.e('expiryCaptureValidation').textContent,'Enter expiry year');
 h.c.setExpiryControlValue(h.e('expiryYear'),'2028',true);assert.equal(h.e('expiryYear').classList.contains('expiryFieldError'),false);assert.equal(h.e('expiryCaptureValidation').hidden,true);assert.equal(h.e('expiryYear')['aria-invalid'],undefined);assert.equal(h.calls.length,0);
});
test('Existing invalid quantity rule is exposed and +/- correction clears error',async()=>{
 const h=harness();h.c.bindExpiryCaptureUI();h.c.engine.currentItem={itemCode:'ITEM1'};h.e('expiryQuantity').value='0';await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.e('expiryCaptureValidation').textContent,'Enter quantity');assert.equal(h.e('expiryQuantity').classList.contains('expiryFieldError'),true);
 h.e('btnExpiryQtyPlus').dispatchEvent(new h.c.Event('click'));assert.equal(h.e('expiryQuantity').classList.contains('expiryFieldError'),false);assert.equal(h.e('expiryCaptureValidation').hidden,true);
});
test('New validation presentation remains Desktop-only',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker';h.c.engine.currentItem={itemCode:'ITEM1'};h.e('expiryQuantity').value='1';await h.c.saveExpiryCapture();assert.equal(h.calls.length,0);assert.equal(h.e('expiryMonth').classList.contains('expiryFieldError'),false);assert.equal(h.e('expiryCaptureValidation').textContent,'');
});

module.exports={harness};
