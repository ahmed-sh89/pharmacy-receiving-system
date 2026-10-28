"use strict";
/* On-demand Owner export. The paged server contract authorizes every read. */
window.PharmFlowGlobalItemsExport=(()=>{
 let busy=false;
 async function collect(rpc,guard=()=>{}){
  let version=null,counts=null;const items=[],identifiers=[];
  for(const kind of ['Items','Identifiers']){
   let after='';
   for(;;){
    guard();const page=await rpc('owner_export_global_items_page_v1',{p_kind:kind,p_after:after,p_limit:750});guard();
    if(!page || !Array.isArray(page.rows) || !Number.isSafeInteger(page.items) || !Number.isSafeInteger(page.identifiers) || !page.version)throw Error('Invalid export response');
    if(version!==null && (page.version!==version || page.items!==counts.items || page.identifiers!==counts.identifiers))throw Error('Global Items changed during export. Please download again.');
    version=page.version;counts={items:page.items,identifiers:page.identifiers};
    const target=kind==='Items'?items:identifiers;
    for(const row of page.rows){
     const key=String(kind==='Items'?row.item_code:row.id);
     if(!key || key<=after)throw Error('Invalid export cursor');
     after=key;target.push(row);
    }
    if(!page.rows.length)break;
    if(target.length>(kind==='Items'?counts.items:counts.identifiers))throw Error('Export count mismatch');
   }
  }
  if(items.length!==counts.items || identifiers.length!==counts.identifiers)throw Error('Export count mismatch');
  const associations=new Map(items.map(i=>[i.item_code,{expected:i.identifier_count,count:0}]));
  for(const row of identifiers){const item=associations.get(row.item_code);if(!item)throw Error('Export identifier association mismatch');item.count++;}
  if([...associations.values()].some(x=>x.count!==x.expected))throw Error('Export identifier count mismatch');
  return {items,identifiers};
 }
 async function download(button){
  if(busy || !isSystemOwner())return;
  busy=true;button.disabled=true;const original=button.textContent;
  const identity=AuthState.identityEpoch,user=AuthState.user?.id;
  const guard=()=>{if(!isSystemOwner() || !AuthState.session || identity!==AuthState.identityEpoch || user!==AuthState.user?.id)throw Error('Account changed. Download cancelled.');};
  let worker;
  try{
   button.textContent='Exporting...';
   const data=await collect(authRpc,guard);
   const buffer=await new Promise((resolve,reject)=>{
    worker=new Worker(new URL('js/global-items-export-worker.js',document.baseURI));
    worker.onmessage=event=>event.data.error?reject(Error(event.data.error)):resolve(event.data.buffer);
    worker.onerror=()=>reject(Error('Unable to generate Excel file. Please retry.'));
    worker.postMessage(data);
   });
   guard();
   const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const link=document.createElement('a');link.href=url;link.download='PharmFlow_Global_Items_'+new Date().toISOString().slice(0,10)+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   showToast(`${data.items.length} items / ${data.identifiers.length} identifiers exported`,'success');
  }catch(error){showToast(error.message||'Export failed','error');}
  finally{worker?.terminate();busy=false;button.disabled=false;button.textContent=original;}
 }
 function bind(){const button=document.getElementById('btnOwnerExportGlobalItems');button?.addEventListener('click',()=>download(button));}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
 return {collect,download};
})();
