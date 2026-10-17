const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld responds before asynchronous saving, skips projection waits and keeps an unresolved draft',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831');
 const rpc=h.c.authRpc;let release;const pending=new Promise(resolve=>release=resolve);
 h.c.authRpc=async(name,p)=>{if(name==='save_pharmflow_expiry_session_capture_v2')await pending;return rpc(name,p);};
 h.c.refreshExpiryCurrentState=()=>{throw new Error('Must not delay Handheld readiness');};
 const started=h.c.saveExpiryCapture();assert.equal(h.c.engine.busy,true);assert.match(h.e('btnSaveExpiryCapture').textContent,/SAVING/);
 await new Promise(setImmediate);assert.ok(h.c.engine.currentItem);assert.equal(h.c.engine.busy,true);
 await h.c.saveExpiryCapture();release();await started;
 assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.busy,false);
 assert.equal(h.calls.filter(x=>x.name==='save_pharmflow_expiry_session_capture_v2').length,1);
 assert.equal(h.calls.some(x=>x.name==='reserve_pharmflow_expiry_capture_v1'||x.name==='list_pharmflow_expiry_capture_receipts_v1'),false);
});
test('Active Session Edit Quantity preserves selected earlier operation and durable retry identity',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';const rpc=h.c.authRpc;
 const rows=[{operation_id:'earlier',pharmacy_id:'isolated-test',created_by:'user1',item_name:'Earlier',identifier_display:'U0030',quantity:1,expiry_month:8,expiry_year:2028,revision:0,editable:true},{operation_id:'later',pharmacy_id:'isolated-test',created_by:'user1',item_name:'Later',quantity:3,expiry_month:8,expiry_year:2028,revision:0,editable:true}];
 let attempts=0,id;
 h.c.authRpc=async(name,p)=>{
  if(name==='list_pharmflow_expiry_session_v2')return rows;
  if(name==='correct_pharmflow_expiry_session_v2'){
   attempts++;if(id)assert.equal(p.p_request_id,id);id=p.p_request_id;assert.equal(p.p_operation_id,'earlier');
   if(attempts===1)throw new Error('Network reply lost');
   rows[0].quantity=p.p_correction.quantity;rows[0].revision++;
   return {operation_id:p.p_operation_id,request_id:p.p_request_id,quantity:p.p_correction.quantity,revision:1};
  }return rpc(name,p);
 };
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),list=overlay.querySelector('.expiryCapturedList');
 list.children[0].children[1].children.at(-1).children.find(button=>button.textContent==='Edit').onclick();const editor=overlay.children.at(-1).children[0];editor.children[1].children[1].value='2';
 await editor.onsubmit({preventDefault(){}});assert.equal(attempts,1);assert.ok([...h.session.keys()].some(k=>k.startsWith('pharmflow_expiry_correction_')));
 await editor.onsubmit({preventDefault(){}});assert.equal(attempts,2);assert.equal(rows[0].quantity,2);assert.equal(rows[1].quantity,3);
 assert.equal([...h.session.keys()].some(k=>k.startsWith('pharmflow_expiry_correction_')),false);
});
test('Back preserves session and only Sign Out awaits authoritative closure',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.ensureExpiryActiveSession();const original=h.c.expiryHandheldSession().session.id;
 h.c.setZebraHomeMode=()=>{};assert.equal(await h.c.leaveExpiryHandheld(),true);assert.equal(h.c.expiryHandheldSession().session.id,original);assert.equal(h.calls.some(x=>x.name.startsWith('close_')),false);
 assert.equal(await h.c.prepareExpirySignOut(),true);assert.equal(h.calls.some(x=>x.name==='close_pharmflow_expiry_auth_session_v1'),true);
});
test('Known adapter removes reservation round trip without changing acknowledged transaction identity',async()=>{
 const c={Blob,structuredClone,AbortController,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',c);
 const times=[];
 for(const directKnown of [false,true]){
  const calls=[],operation={id:'same-operation',pharmacyId:'synthetic'};const start=performance.now();
  await c.api.save({directKnown,operation,payload:{kind:'KNOWN'},photos:{},scope:'scope',currentScope:()=> 'scope',persist:async()=>{},rpc:async(name)=>{
   calls.push(name);await new Promise(resolve=>setTimeout(resolve,30));
   return name.startsWith('reserve_')?{operation_id:operation.id,status:'RESERVED'}:{operation_id:operation.id,state_id:'state',event_id:'event'};
  }});
  times.push({directKnown,ms:Math.round(performance.now()-start),rpcCalls:calls.length});assert.equal(calls.length,directKnown?1:2);
 }
 console.log('Synthetic adapter latency, 30ms per RPC; not physical/network measurement:',JSON.stringify(times));
});

test('Optional identification note persists without becoming official identity, and an empty review draft may save',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';h.c.IdentifierService.resolve=async()=>({found:false});await h.c.resolveExpiryScannedValue('E0029-L');
 h.c.setExpiryControlValue(h.e('expiryMonth'),'8');h.c.setExpiryControlValue(h.e('expiryYear'),'2028');
 h.c.openExpiryNoteEditor();const form=h.c.document.body.children.at(-1).children[0];form.children[0].value='Panadol';await form.onsubmit({preventDefault(){}});
 assert.equal(h.c.engine.identificationNote,'Panadol');assert.notEqual(h.c.engine.currentItem.itemName,'Panadol');assert.equal(h.e('expiryEvidencePreviews').children?.length||0,0);
 await h.c.saveExpiryCapture();const request=h.calls.find(c=>c.name==='save_pharmflow_expiry_session_capture_v2').payload.p_capture;assert.equal(request.kind,'UNKNOWN');assert.equal(request.identification_note,'Panadol');assert.equal(request.product_photo_path,undefined);assert.equal(request.identifier_display,'E0029-L');assert.equal(h.c.engine.currentItem,null);
});
test('Unified accordion keeps one open operation and image viewer is layered over the unchanged History context',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';const rpc=h.c.authRpc;
 h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_session_v2'?Array.from({length:12},(_,i)=>({operation_id:'op-'+i,kind:i===0?'UNKNOWN':'KNOWN',identifier_display:'U0030',item_name:'Official',quantity:1,expiry_month:8,expiry_year:2028,status:'SAVED',identification_note:i===0?'Panadol':null})):rpc(name,p);
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),list=overlay.querySelector('.expiryCapturedList');assert.equal(list.children.length,10);assert.doesNotMatch(overlay.innerHTML,/role="tab"|Load More/);
 const first=list.children[0],second=list.children[1];first.open=true;await first.listeners.toggle[0]();second.open=true;await second.listeners.toggle[0]();assert.equal(first.open,false);assert.equal(second.open,true);
 h.c.openExpiryPhotoViewer('blob:synthetic');const viewer=h.c.document.body.children.at(-1);assert.equal(viewer.id,'expiryPhotoViewer');assert.equal(overlay.isConnected,true);viewer.children[0].children.find(b=>b.textContent==='Close').onclick();assert.equal(overlay.isConnected,true);
});
test('Representative warm adapter benchmark: known, unknown without photo, unknown with photo (synthetic delays only)',async()=>{
 const c={Blob,structuredClone,AbortController,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-operation.js','utf8')+'\nthis.api=ExpiryOperation;',c);const results=[];
 for(const [kind,photo] of [['KNOWN',false],['UNKNOWN',false],['UNKNOWN',true]]){
  const operation={id:kind+'-'+photo,pharmacyId:'synthetic'},calls=[];let uploads=0;const start=performance.now();
  await c.api.save({directKnown:!photo,operation,payload:{kind,identifier_display:'U0030'},photos:photo?{evidence:new Blob(['synthetic evidence'],{type:'image/jpeg'})}:{},scope:'scope',currentScope:()=> 'scope',persist:async()=>{},uuid:()=> 'synthetic-object',upload:async()=>{uploads++;await new Promise(r=>setTimeout(r,40));},rpc:async(name,p)=>{
   calls.push(name);await new Promise(r=>setTimeout(r,20));if(name.startsWith('reserve_'))return {operation_id:operation.id,status:'RESERVED'};
   return {operation_id:operation.id,pharmacy_id:operation.pharmacyId,confirmed_capture:structuredClone(p.p_capture),...(kind==='KNOWN'?{state_id:'state',event_id:'event'}:{review_id:'review',product_photo_path:p.p_capture.product_photo_path||null})};
  }});
  assert.equal(calls.length,photo?2:1);assert.equal(uploads,photo?1:0);results.push({kind,photo,rpcCalls:calls.length,uploads,ms:Math.round(performance.now()-start)});
 }
 console.log('Synthetic 20ms/RPC, 40ms/upload; excludes session acquisition, actual network and TC26:',JSON.stringify(results));
});
test('Ten-minute sleep owner is unchanged and the new session owner adds no heartbeat or operational timeout',()=>{
 const session=fs.readFileSync('js/expiry-active-session.js','utf8'),sleep=fs.readFileSync('cloud-workspace.js','utf8');assert.match(sleep,/IDLE_MS=10\*60\*1000/);assert.match(session,/pf-idle-sleep-active/);assert.doesNotMatch(session,/setInterval|setTimeout|heartbeat/);
});

test('History polish uses red active review, structured fields and omits empty optional values',async()=>{
 const h=harness(true),rpc=h.c.authRpc;
 h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_session_v2'?[{operation_id:'unknown',kind:'UNKNOWN',identifier_display:'E0029-L',quantity:2,expiry_month:8,expiry_year:2028,status:'PENDING',editable:true,revision:0,identification_note:'Long identification note',sample_serial:null}]:rpc(name,p);
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),row=overlay.querySelector('.expiryCapturedList').children[0],summary=row.children[0],body=row.children[1];
 assert.match(row.className,/expiryHistoryNeedsReview/);assert.equal(summary.children[0].children[0].textContent,'Item Not Recognized');assert.match(summary.children[1].className,/review/);
 const fields=body.children.filter(n=>n.className==='expiryHistoryField');assert.deepEqual(fields.map(n=>n.children[0].textContent),['Identifier','Expiry','Quantity','Status','Note']);assert.ok(fields.every(n=>n.children[1].className==='expiryHistoryValue'));
});
test('History Edit modal keeps rows stable, restores focus and traps keyboard navigation',async()=>{
 const h=harness(true),rpc=h.c.authRpc;h.c.authRpc=async(name,p)=>name==='list_pharmflow_expiry_session_v2'?[{operation_id:'op',kind:'KNOWN',item_name:'Specific operation',quantity:2,expiry_month:8,expiry_year:2028,status:'SAVED',editable:true,revision:0}]:rpc(name,p);
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),list=overlay.querySelector('.expiryCapturedList'),row=list.children[0],trigger=row.children[1].children.at(-1).children[0];trigger.onclick();const modal=overlay.children.at(-1),form=modal.children[0],buttons=form.children.at(-2);assert.equal(list.children.length,1);assert.equal(list.children[0],row);assert.match(modal.className,/expiryHistoryActionOverlay/);assert.equal(form.role,'dialog');assert.equal(form['aria-modal'],'true');
 assert.equal(form.children[1].children[1].inputMode,'numeric');assert.equal(form.children[3].children[1].inputMode,'numeric');assert.equal(h.c.document.activeElement,form.children[1].children[1]);
 let prevented=false;buttons.children[1].focus();form.listeners.keydown[0]({key:'Tab',preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(h.c.document.activeElement,form.children[1].children[1]);
 form.listeners.keydown[0]({key:'Escape',preventDefault(){}});assert.equal(modal.isConnected,false);assert.equal(h.c.document.activeElement,trigger);assert.equal(list.children[0],row);
});
test('Delete modal names exact operation, blocks repeated submit and retains row on rejection',async()=>{
 const h=harness(true),rpc=h.c.authRpc;let submissions=0,release;const gate=new Promise(r=>release=r);
 h.c.authRpc=async(name,p)=>{if(name==='list_pharmflow_expiry_session_v2')return [{operation_id:'exact-op',kind:'UNKNOWN',identifier_display:'U0030',quantity:3,expiry_month:8,expiry_year:2028,status:'PENDING',editable:true,revision:0}];if(name==='correct_pharmflow_expiry_session_v2'){submissions++;assert.equal(p.p_operation_id,'exact-op');assert.equal(p.p_correction.quantity,0);await gate;throw new Error('Server unavailable');}return rpc(name,p);};
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),list=overlay.querySelector('.expiryCapturedList'),row=list.children[0];row.children[1].children.at(-1).children[1].onclick();const modal=overlay.children.at(-1),form=modal.children[0],buttons=form.children.at(-2);assert.match(form.children[0].textContent,/U0030/);assert.equal(buttons.children[0].textContent,'Cancel');assert.equal(buttons.children[1].textContent,'Delete Operation');assert.equal(h.c.document.activeElement,buttons.children[0]);const saving=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(submissions,1);assert.equal(list.children[0],row);release();await saving;assert.equal(list.children[0],row);assert.match(form.children.at(-1).textContent,/Server unavailable/);assert.equal(modal.isConnected,true);
});
test('History selected row and modal styles are canonical, viewport bounded and have no animation',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8');assert.match(css,/details\[open\]\{background:#edf4fc;border-color:#6396cf/);assert.match(css,/expiryHistoryStatus\.review\{background:#fce9e9;color:#8f2020/);assert.match(css,/expiryHistoryField\{display:grid;grid-template-columns:82px minmax\(0,1fr\)/);assert.match(css,/expiryHistoryActionOverlay\{[^}]*height:var\(--handheld-visible-height,100dvh\)/);assert.match(css,/expiryHistoryDialog\{[^}]*overflow-y:auto/);assert.doesNotMatch(css.match(/body\.zebraDevice \.expiryRecentChevron\{[^}]*\}/)[0],/transition|animation/);
});
test('FIX6 blocker is explicit: existing authoritative RPC limits ten before excluding deleted; no backend change',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261012002022_expiry_final_handheld_signed_session_optional_evidence.sql','utf8');const query=sql.slice(sql.indexOf('create function public.list_pharmflow_expiry_session_v2'),sql.indexOf('create function public.correct_pharmflow_expiry_session_v2'));assert.match(query,/where c.session_id=p_session_id order by[^]*limit 10/);assert.doesNotMatch(query,/where c.session_id=p_session_id and c.quantity>0/);
});

test('Active Needs Review colors meet WCAG AA text contrast on collapsed and selected backgrounds',()=>{
 function lum(hex){const channels=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
 for(const [fg,bg] of [['a32222','ffffff'],['a32222','edf4fc'],['8f2020','fce9e9']]){const a=lum(fg),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);}
});
