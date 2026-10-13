const fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
function harness(){
 const {document,window}=parseHTML(fs.readFileSync('index.html','utf8'));
 const timers=new Map(),intervals=new Map(),storage=new Map(),calls=[];let timer=0;
 window.HTMLElement.prototype.focus=function(){document.activeElement=this;};
 window.HTMLElement.prototype.showModal=function(){this.open=true;};
 window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const data=Array.from({length:73},(_,i)=>({row_id:'r'+i,state_id:'s'+i,item_code:'00'+i,item_name:'Product '+i,identifier_display:'000'+i,batch_no:i%2?'Lot A':null,department:i%2?'Medicine':'Mom & Baby',expiry_month:i%12+1,expiry_year:2027,quantity:i,updated_at:'2026-10-12T12:30:00Z',added_at:'2026-10-12T12:30:00Z',status:'ACTIVE',version:'version-'+i}));
 const receipts=[{kind:'KNOWN',operation_id:'op1',item_code:'001',item_name:'First',identifier_display:'000123',batch_no:null,expiry_month:11,expiry_year:2026,quantity:3,captured_at:'2026-10-13T01:00:00Z',status:'SAVED',editable:true,revision:0},{kind:'KNOWN',operation_id:'op2',item_code:'002',item_name:'Second',identifier_display:'000999',batch_no:'B',expiry_month:12,expiry_year:2026,quantity:7,captured_at:'2026-10-13T00:00:00Z',status:'SAVED',editable:true,revision:0}];
 const engine={sessionRows:[],currentRows:[],desktopView:'SESSION'};
 const c={document,console:{error(){}},ExpiryCaptureEngine:engine,expiryDraftScope:()=>c.account,expirySignedAuthIdentity:()=>c.authIdentity,expiryPharmacyId:()=>c.pharmacy,account:'employee/pharmacy',authIdentity:'auth1',pharmacy:'pharmacy1',expiryIsHandheld:()=>false,expiryEscapeHtml:v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),expiryFormatVerifiedAt:v=>String(v),ensureExpiryActiveSession:async()=>'session1',bindExpiryCaptureUI(){},activateExpiryCapture:async()=>{},addEventListener(){},AppEvents:{on(){}},innerHeight:900,crypto:require('node:crypto').webcrypto,setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++timer,fn);return timer;},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setExpiryStatus(kind,text){c.status={kind,text};},AuthState:{context:{pharmacy_code:'TEST'}},openNeedsReviewPanel(){},authRpc:async(name,p)=>{
  calls.push({name,p});
  if(name==='list_pharmflow_expiry_desktop_session_v1')return structuredClone(receipts);
  if(name==='summary_pharmflow_expiry_inventory_v1')return [{key:'EXPIRED',from:null,to:2026*12+10,count:4,units:20},{key:'NEXT1',from:2026*12+11,to:2026*12+11,count:5,units:50},{key:'NEXT2',from:2026*12+11,to:2026*12+12,count:6,units:60},{key:'NEXT6',from:2026*12+11,to:2027*12+4,count:7,units:70}];
  if(name==='query_pharmflow_expiry_inventory_v1'){const f=p.p_filters,rows=data.filter(r=>!f.search||r.item_name.includes(f.search));return {rows:structuredClone(rows.slice(p.p_offset,p.p_offset+p.p_limit)),count:rows.length,units:rows.reduce((n,r)=>n+r.quantity,0),departments:['Medicine','Mom & Baby'],months:['2027-01','2027-12']};}
  if(name==='select_pharmflow_expiry_inventory_v1'){const rows=p.p_ids?data.filter(r=>p.p_ids.includes(r.row_id)):data;return {count:rows.length,units:rows.reduce((n,r)=>n+r.quantity,0),selection:rows.map(r=>({id:r.row_id,version:r.version}))};}
  if(name==='mutate_pharmflow_expiry_inventory_v1')return {request_id:p.p_request_id,count:p.p_selection.length,action:p.p_action};
  if(name==='correct_pharmflow_expiry_desktop_session_v1')return {request_id:p.p_request_id,quantity:p.p_correction.quantity};
  if(name==='export_pharmflow_expiry_inventory_v1')return structuredClone(data);
  throw Error('Unexpected RPC '+name);
 }};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/expiry-desktop-v2.js','utf8'),c);
 c.bindExpiryCaptureUI();
 return {c,document,window,engine,data,receipts,calls,timers,intervals,storage,e:id=>document.getElementById(id),async refresh(){return c.refreshExpiryCurrentState();},async click(id){await this.e(id).onclick({target:this.e(id)});await new Promise(r=>setImmediate(r));},async flush(){for(const [id,fn] of [...timers]){timers.delete(id);await fn();}await new Promise(r=>setImmediate(r));},async submit(){await document.querySelector('dialog form').onsubmit({preventDefault(){}});}};
}
module.exports={harness};
