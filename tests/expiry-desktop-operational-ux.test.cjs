const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness:inventory}=require('./expiry-inventory-filter-reset.test.cjs');
const {harness:capture}=require('./expiry-capture-review.test.cjs');
function session(){const h=inventory();h.engine.desktopView='SESSION';h.nodes.set('expirySessionCount',{textContent:''});h.c.expiryMonthShortName=m=>'Month '+m;return h;}
test('Session grouped rows retain all operational values and one persistent latest-save highlight',()=>{
 const h=session();h.engine.currentRows=h.all.map(r=>({...r,batch_no:'LONG-BATCH',sample_serial:'FULL-SERIAL',verified_by_name:'Operator'}));
 h.c.recordExpirySessionCapture({...h.all[0],sample_serial:'FULL-SERIAL',quantity:1});
 let html=h.nodes.get('expiryCurrentStateBody').innerHTML;assert.match(html,/Latest saved activity/);assert.equal((html.match(/<td /g)||[]).length,5);
 for(const v of ['One','ITEM1','001234','Medicine','LONG-BATCH','FULL-SERIAL','Operator'])assert.ok(html.includes(v),v);
 h.c.renderExpirySessionActivity();assert.match(h.nodes.get('expiryCurrentStateBody').innerHTML,/expiryRowSavedStrong/);
 h.c.recordExpirySessionCapture({...h.all[1],quantity:2});html=h.nodes.get('expiryCurrentStateBody').innerHTML;assert.equal((html.match(/expiryRowSavedStrong/g)||[]).length,1);assert.ok(html.indexOf('Two')<html.indexOf('One'));assert.equal(h.nodes.get('expirySessionCount').textContent,'2');
 h.engine.sessionRows[1].captured_at='2099-01-01T00:00:00Z';h.c.renderExpirySessionActivity();assert.ok(h.nodes.get('expiryCurrentStateBody').innerHTML.indexOf('Two')<h.nodes.get('expiryCurrentStateBody').innerHTML.indexOf('One'));
 h.c.resetExpiryDesktopSession();h.c.renderExpirySessionActivity();assert.equal(h.nodes.get('expirySessionCount').textContent,'0');assert.doesNotMatch(h.nodes.get('expiryCurrentStateBody').innerHTML,/expiryRowSavedStrong/);
});
test('Identity badges distinguish recognized, unknown and empty; full Batch/Serial and auto-date mode preserved',()=>{
 const h=capture();h.c.renderExpiryActiveItem(null);assert.equal(h.e('expiryRecognizedBadge').hidden,true);
 h.c.renderExpiryActiveItem({itemName:'Long Product',itemCode:'CODE',identifierDisplay:'00001234',category:'Medicine'},{lot:'B'.repeat(100),serial:'S'.repeat(100),expiry:'2028-08-31'});
 assert.equal(h.e('expiryRecognizedBadge').hidden,false);assert.equal(h.e('expiryAutoDateBadge').hidden,false);assert.equal(h.e('expiryBatchInput').value.length,100);assert.equal(h.e('expirySerialInput').value.length,100);assert.equal(h.e('expiryActiveItemGTIN').textContent,'00001234');
 h.c.setExpiryDateMode('MANUAL');assert.equal(h.e('expiryAutoDateBadge').hidden,true);
 h.c.renderExpiryActiveItem({needsReview:true,itemName:'Item not recognized',identifierDisplay:'X'});assert.equal(h.e('expiryRecognizedBadge').hidden,true);
});
for(const type of ['month','year'])test(type+' dropdown supports arrows, Home/End, Enter, Escape and focus restoration with one handler',()=>{
 const h=capture(),el=h.e(type==='month'?'expiryMonth':'expiryYear');el.dataset.expirySelect=type;delete el.dataset.selectBound;
 const menu={hidden:true},label={textContent:''},trigger=h.e('expirySerialInput');const opts=['','1','2'].map(v=>{const classes=new Set(),o={dataset:{value:v,label:v},textContent:v,classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},setAttribute(){},focus(){h.c.document.activeElement=this;}};o.click=()=>{h.c.setExpiryControlValue(el,v,true);h.c.closeExpirySelect(el,true);};return o;});
 el.querySelector=s=>s==='.pfSelectMenu'?menu:s==='.pfSelectValue'?label:trigger;el.querySelectorAll=()=>opts;menu.querySelector=()=>opts[1];opts.forEach(o=>o.scrollIntoView=()=>{});
 h.c.document.querySelectorAll=s=>s==='#zebraExpiryShell .pfSelect'?[el]:[];h.c.initExpirySelects();h.c.initExpirySelects();assert.equal(el.listeners.keydown.length,1);
 const key=k=>el.dispatchEvent({type:'keydown',key:k,preventDefault(){}});key('ArrowDown');assert.equal(h.c.document.activeElement,opts[1]);key('End');assert.equal(h.c.document.activeElement,opts[2]);key('Enter');assert.equal(el.dataset.value,'2');assert.equal(el.classList.contains('is-open'),false);assert.equal(h.c.document.activeElement,el);
 key('ArrowDown');key('Home');assert.equal(h.c.document.activeElement,opts[0]);key('Escape');assert.equal(el.classList.contains('is-open'),false);assert.equal(h.c.document.activeElement,el);
});
test('Session columns are view-scoped; accepted Inventory head and local search owner remain intact',async()=>{
 const h=inventory(),original={innerHTML:'original inventory head',hidden:false},head={innerHTML:'original inventory head',querySelector:()=>original,appendChild(r){this.session=r;}},classes=new Set(),table={querySelector:()=>head,classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}}};h.c.document.querySelector=s=>s==='.expiryCurrentTable'?table:null;h.c.document.createElement=()=>({innerHTML:'',hidden:false});
 await h.c.refreshExpiryCurrentState();assert.equal(head.innerHTML,'original inventory head');h.engine.desktopView='SESSION';await h.c.refreshExpiryCurrentState();assert.match(head.session.innerHTML,/Product \/ Identification/);assert.equal(original.hidden,true);assert.equal(classes.has('expirySessionTable'),true);h.engine.desktopView='INVENTORY';await h.c.refreshExpiryCurrentState();assert.equal(head.innerHTML,'original inventory head');assert.equal(classes.has('expirySessionTable'),false);assert.equal(original.hidden,false);assert.equal(head.session.hidden,true);
});
test('Clear Session retains existing local action, menu is unique, and tab switch never invokes page scrolling',()=>{
 const js=fs.readFileSync('js/expiry-desktop-v2.js','utf8'),html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/dashboard.css','utf8');
 assert.equal((html.match(/id="btnClearExpirySession"/g)||[]).length,1);assert.match(html,/<details id="expirySessionMenu"/);assert.match(html,/Session Activity <b id="expirySessionCount"/);assert.doesNotMatch(js,/Date\.now\(\)-Date\.parse\(r\.captured_at/);
 assert.match(js,/clearSession\.onclick=\(\)=>\{closeRecordDialog\(\);ExpiryCaptureEngine\.sessionRows=\[\];renderExpirySessionActivity\(\);/);
 assert.doesNotMatch(css,/expiryInventoryMode \.expiryCaptureCard\{display:none/);assert.doesNotMatch(js.slice(js.indexOf('const selectView='),js.indexOf('if(inv&&')),/scrollIntoView|scrollTo/);
});
