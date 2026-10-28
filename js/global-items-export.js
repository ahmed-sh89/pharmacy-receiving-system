"use strict";
/* Read-only Owner export: pin a server revision and stream pages to a chunked OOXML Worker. */
window.PharmFlowGlobalItemsExport=(()=>{
 let busy=false;
 async function collect(rpc,guard=()=>{},onPage=null){
  let version=null,counts=null;const items=[],identifiers=[],associations=new Map();
  const totals={Items:0,Identifiers:0};
  for(const kind of ['Items','Identifiers']){
   let after='';
   for(;;){
    guard();const page=await rpc('owner_export_global_items_page_v2',{p_kind:kind,p_after:after,p_limit:750,p_version:version});guard();
    if(!page || !Array.isArray(page.rows) || typeof page.version!=='string' || !page.version)throw Error('Invalid export response');
    if(version===null){
     if(!Number.isSafeInteger(page.items)||page.items<0||!Number.isSafeInteger(page.identifiers)||page.identifiers<0)throw Error('Invalid export counts');
     counts={items:page.items,identifiers:page.identifiers};version=page.version;
    }else if(page.version!==version || page.items!==undefined && page.items!==counts.items || page.identifiers!==undefined && page.identifiers!==counts.identifiers)throw Error('Global Items changed during export. Please download again.');
    for(const row of page.rows){
     const key=String(kind==='Items'?row.item_code:row.id);
     if(!key || key===after || kind==='Identifiers' && key<after)throw Error('Invalid export cursor');after=key;
     if(kind==='Items'){
      if(typeof row.item_code!=='string'||!Number.isSafeInteger(row.identifier_count)||row.identifier_count<0||associations.has(row.item_code))throw Error('Invalid item count');
      associations.set(row.item_code,{expected:row.identifier_count,count:0});
     }else{
      if(typeof row.identifier_display!=='string')throw Error('Identifier text required');
      const item=associations.get(row.item_code);if(!item)throw Error('Export identifier association mismatch');item.count++;
     }
    }
    totals[kind]+=page.rows.length;
    if(totals[kind]>(kind==='Items'?counts.items:counts.identifiers))throw Error('Export count mismatch');
    if(!page.rows.length)break;
    if(onPage){await onPage(kind,page.rows);guard();}
    else (kind==='Items'?items:identifiers).push(...page.rows);
   }
  }
  if(totals.Items!==counts.items || totals.Identifiers!==counts.identifiers || [...associations.values()].some(i=>i.count!==i.expected))throw Error('Export count mismatch');
  return {items,identifiers,itemCount:totals.Items,identifierCount:totals.Identifiers};
 }
 async function download(button){
  if(busy || !isSystemOwner())return;
  busy=true;button.disabled=true;const original=button.textContent;
  const identity=AuthState.identityEpoch,user=AuthState.user?.id;
  const guard=()=>{if(!isSystemOwner()||!AuthState.session||identity!==AuthState.identityEpoch||user!==AuthState.user?.id)throw Error('Account changed. Download cancelled.');};
  let worker;const pending=new Map();let sequence=0;
  try{
   button.textContent='Exporting...';worker=new Worker(new URL('js/global-items-export-worker.js',document.baseURI));
   const request=(type,payload={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Excel generation timed out. Please retry.'));},60000);
    pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...payload});
   });
   worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.buffer);};
   worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Unable to generate Excel file. Please retry.'));}pending.clear();};
   await request('start');
   const data=await collect(authRpc,guard,(kind,rows)=>request('page',{kind,rows}));
   const buffer=await request('finish');guard();
   const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const link=document.createElement('a');link.href=url;link.download='PharmFlow_Global_Items_'+new Date().toISOString().slice(0,10)+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   showToast(`${data.itemCount} items / ${data.identifierCount} identifiers exported`,'success');
  }catch(error){showToast(error.message||'Export failed','error');}
  finally{for(const p of pending.values())clearTimeout(p.timer);pending.clear();worker?.terminate();busy=false;button.disabled=false;button.textContent=original;}
 }
 function bind(){const button=document.getElementById('btnOwnerExportGlobalItems');button?.addEventListener('click',()=>download(button));}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
 return {collect,download};
})();
