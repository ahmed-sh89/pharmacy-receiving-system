const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-capture-review.test.cjs');
test('Handheld responds before asynchronous saving, skips projection waits and keeps an unresolved draft',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.resolveExpiryScannedValue('(01)04065272072977(17)270831');
 const rpc=h.c.authRpc;let release;const pending=new Promise(resolve=>release=resolve);
 h.c.authRpc=async(name,p)=>{if(name==='save_pharmflow_expiry_session_capture_v1')await pending;return rpc(name,p);};
 h.c.refreshExpiryCurrentState=()=>{throw new Error('Must not delay Handheld readiness');};
 const started=h.c.saveExpiryCapture();assert.equal(h.c.engine.busy,true);assert.match(h.e('btnSaveExpiryCapture').textContent,/SAVING/);
 await new Promise(setImmediate);assert.ok(h.c.engine.currentItem);assert.equal(h.c.engine.busy,true);
 await h.c.saveExpiryCapture();release();await started;
 assert.equal(h.c.engine.currentItem,null);assert.equal(h.c.engine.busy,false);
 assert.equal(h.calls.filter(x=>x.name==='save_pharmflow_expiry_session_capture_v1').length,1);
 assert.equal(h.calls.some(x=>x.name==='reserve_pharmflow_expiry_capture_v1'||x.name==='list_pharmflow_expiry_capture_receipts_v1'),false);
});
test('Active Session Edit Quantity preserves selected earlier operation and durable retry identity',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';const rpc=h.c.authRpc;
 const rows=[{operation_id:'earlier',pharmacy_id:'isolated-test',created_by:'user1',item_name:'Earlier',identifier_display:'U0030',quantity:1,revision:0,editable:true},{operation_id:'later',pharmacy_id:'isolated-test',created_by:'user1',item_name:'Later',quantity:3,revision:0,editable:true}];
 let attempts=0,id;
 h.c.authRpc=async(name,p)=>{
  if(name==='list_pharmflow_expiry_session_v1')return rows;
  if(name==='correct_pharmflow_expiry_session_v1'){
   attempts++;if(id)assert.equal(p.p_request_id,id);id=p.p_request_id;assert.equal(p.p_operation_id,'earlier');
   if(attempts===1)throw new Error('Network reply lost');
   rows[0].quantity=p.p_quantity;rows[0].revision++;
   return {operation_id:p.p_operation_id,request_id:p.p_request_id,quantity:p.p_quantity,revision:1};
  }return rpc(name,p);
 };
 await h.c.openExpiryHandheldHistory();const overlay=h.c.document.body.children.at(-1),list=overlay.querySelector('.expiryCapturedList');
 list.children[0].children[1].children[0].onclick();const editor=list.children[0];editor.children[1].value='2';
 await editor.onsubmit({preventDefault(){}});assert.equal(attempts,1);assert.ok([...h.session.keys()].some(k=>k.startsWith('pharmflow_expiry_correction_')));
 await editor.onsubmit({preventDefault(){}});assert.equal(attempts,2);assert.equal(rows[0].quantity,2);assert.equal(rows[1].quantity,3);
 assert.equal([...h.session.keys()].some(k=>k.startsWith('pharmflow_expiry_correction_')),false);
});
test('Session closure is acknowledged before Back; a new local identity cannot revive a closed one',async()=>{
 const h=harness(true);h.c.engine.selectedWorkerId='worker1';await h.c.ensureExpiryActiveSession();const original=h.c.expiryHandheldSession().session.id;
 let navigated=false;h.c.setZebraHomeMode=()=>navigated=true;
 assert.equal(await h.c.leaveExpiryHandheld(),true);assert.equal(navigated,true);
 assert.equal(h.calls.some(x=>x.name==='close_pharmflow_expiry_session_v1'&&x.payload.p_session_id===original),true);
 assert.notEqual(h.c.expiryHandheldSession().session.id,original);
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
