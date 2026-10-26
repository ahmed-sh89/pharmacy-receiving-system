const fs=require('node:fs');
async function mount(page){
 const html=fs.readFileSync('index.html','utf8'),css=[...html.matchAll(/href="(css\/[^"?]+)/g)].map(m=>fs.readFileSync(m[1],'utf8')).join('\n');
 await page.route('**/*',r=>r.request().url()==='https://offline.pharmflow.test/'?r.fulfill({body:'<!doctype html>'}):r.abort());await page.goto('https://offline.pharmflow.test/');
 await page.setContent(html.replace('src="assets/pharmflow-mark.svg"','src="data:image/svg+xml;base64,'+fs.readFileSync('assets/pharmflow-mark.svg').toString('base64')+'"').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));await page.addStyleTag({content:css});
 const release=fs.readFileSync('js/receiving-release.js','utf8'),a=release.indexOf('window.PharmFlowClassificationFilters='),b=release.indexOf('\n\n\n/* Retired device-local',a);await page.addScriptTag({content:release.slice(a,b)});
 await page.evaluate(()=>{
  document.body.className='pfNextMode pfnCleanReceiving expiryDesktopActive';document.querySelectorAll('#authGate,#authBootPanel,#workspaceBootOverlay,.appBootOverlay').forEach(e=>e.remove());document.querySelectorAll('.appPage').forEach(e=>e.classList.remove('active'));document.getElementById('zebraExpiryShell').classList.add('active');document.getElementById('pageTitle').textContent='Expiry';document.querySelectorAll('[data-page]').forEach(e=>e.classList.toggle('active',e.dataset.page==='expiry'));
  window.AuthState={identityEpoch:1,user:{id:'fixture-user'},context:{pharmacy_id:'fixture-pharmacy',pharmacy_code:'OFFLINE FIXTURE'}};window.ExpiryCaptureEngine={currentRows:[],sessionRows:[]};window.expiryDraftScope=()=>AuthState.user.id+'/'+AuthState.context.pharmacy_id;window.expirySignedAuthIdentity=()=> 'fixture-auth';window.expiryPharmacyId=()=>AuthState.context.pharmacy_id;window.expiryIsHandheld=()=>false;window.expiryEscapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.expiryFormatVerifiedAt=v=>String(v);window.ensureExpiryActiveSession=async()=> 'fixture-session';window.bindExpiryCaptureUI=()=>{};window.activateExpiryCapture=async()=>{};window.AppEvents={on(){}};window.focusExpiryScanner=()=>{};window.setExpiryStatus=()=>{};
  window.rpcLog=[];window.fixtureWrites=new Map();window.fixtureFailSave=false;window.kpiOverride=null;window.fixtureOffset=0;const RealDate=Date;window.Date=class extends RealDate{static now(){return RealDate.now()+window.fixtureOffset;}};window.serverDelay=5;window.serverMonth=2026*12+10;window.fixtureRows=Array.from({length:73},(_,i)=>{const n=2026*12+10+(i%9-1);return {row_id:'r'+i,state_id:'s'+i,pharmacy_id:'fixture-pharmacy',item_code:String(i).padStart(4,'0'),item_name:'Product '+i,identifier_display:'0000'+i,batch_no:'Lot '+i,group_name:i%2?'Medicine':'Beauty',expiry_year:Math.floor((n-1)/12),expiry_month:(n-1)%12+1,quantity:i+1,first_operator_name:'Desktop',updated_at:'2026-10-12T12:00:00Z',added_at:'2026-10-12T12:00:00Z',status:'ACTIVE',version:'v'+i};});
  const match=(r,f)=>{const n=r.expiry_year*12+r.expiry_month,m=r.expiry_year+'-'+String(r.expiry_month).padStart(2,'0');return (!f.search||[r.item_name,r.item_code,r.identifier_display,r.batch_no].some(v=>v.toLowerCase().includes(f.search.toLowerCase())))&&(!(f.groups?.length||f.include_unassigned)||(f.groups||[]).includes(r.group_name)||f.include_unassigned&&!r.group_name)&&(!f.operators?.length||f.operators.includes(r.first_operator_name))&&(!f.months?.length||f.months.includes(m))&&(f.from==null||n>=f.from)&&(f.to==null||n<=f.to);};
  window.authRpc=async(name,p)=>{rpcLog.push({name,p});if(p.p_pharmacy_id!==AuthState.context.pharmacy_id)throw Error('pharmacy isolation');await new Promise(r=>setTimeout(r,serverDelay));
   if(name==='mutate_pharmflow_expiry_inventory_v1'){
    if(fixtureFailSave){const e=Error('Fixture save rejected');e.serverRejected=true;throw e;}
    if(!fixtureWrites.has(p.p_request_id)){
     if(p.p_action!=='QUANTITY'||p.p_selection.length!==1)throw Error('Unexpected mutation');
     const selected=p.p_selection[0],row=fixtureRows.find(r=>r.row_id===selected.id);
     if(!row||row.version!==selected.version)throw Error('Stale version');
     row.quantity=p.p_quantity;row.version+='x';fixtureWrites.set(p.p_request_id,{request_id:p.p_request_id,count:1,action:'QUANTITY'});
    }
    return fixtureWrites.get(p.p_request_id);
   }
   if(name==='list_pharmflow_expiry_desktop_session_v1')return [];
   if(name==='summary_pharmflow_expiry_inventory_v1')return [{key:'EXPIRED',from:null,to:serverMonth},{key:'NEXT1',from:serverMonth+1,to:serverMonth+1}].map(p=>{const rows=fixtureRows.filter(r=>(p.from==null||r.expiry_year*12+r.expiry_month>=p.from)&&r.expiry_year*12+r.expiry_month<=p.to);return {...p,count:kpiOverride??rows.length,units:kpiOverride??rows.reduce((n,r)=>n+r.quantity,0)};});
   if(name==='query_pharmflow_expiry_inventory_v1'){const rows=fixtureRows.filter(r=>match(r,p.p_filters));return {rows:rows.slice(p.p_offset,p.p_offset+p.p_limit),count:p.p_limit===1?(kpiOverride??rows.length):rows.length,units:p.p_limit===1?(kpiOverride??rows.reduce((n,r)=>n+r.quantity,0)):rows.reduce((n,r)=>n+r.quantity,0),groups:PharmFlowClassificationFilters.approvedGroups.slice(),has_unassigned_group:false,months:[...new Set(fixtureRows.map(r=>r.expiry_year+'-'+String(r.expiry_month).padStart(2,'0')))],operators:['Desktop']};}
   if(name==='export_pharmflow_expiry_inventory_v1')return fixtureRows.filter(r=>match(r,p.p_filters));
   if(name==='select_pharmflow_expiry_inventory_v1')return {count:1,units:1,selection:[]};throw Error('Unexpected RPC '+name);
  };
 });
 for(const p of ['js/expiry-inventory-filters.js','js/expiry-inventory-report.js','js/expiry-desktop-v2.js'])await page.addScriptTag({content:fs.readFileSync(p,'utf8')});
 await page.evaluate(async()=>{bindExpiryCaptureUI();await refreshExpiryCurrentState();document.getElementById('btnOpenExpiryInventory').click();});await page.waitForFunction(()=>document.querySelectorAll('[data-period]').length===8&&document.querySelector('[data-period="ALL"]').disabled===false&&document.getElementById('expiryCurrentStateCount').textContent==='73');
}
module.exports={mount};
