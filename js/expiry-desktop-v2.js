/* PharmFlow Expiry Desktop Workspace V2
   Session Activity = capture events from this route session.
   Expiry Inventory = authoritative current state. */
(function(){
  if(typeof window==="undefined") return;
  function esc(v){return typeof expiryEscapeHtml==="function"?expiryEscapeHtml(v):String(v??"");}
  function sessionRows(rows){const started=Number(ExpiryCaptureEngine.sessionStartedAt||0);return (rows||[]).filter(r=>expiryCapturedAt(r)>=started).sort((a,b)=>expiryCapturedAt(b)-expiryCapturedAt(a));}
  function timeOnly(v){const d=new Date(v||"");return Number.isFinite(d.getTime())?d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—";}
  function currentFor(c){return (ExpiryCaptureEngine.currentRows||[]).find(r=>String(r.item_code||"")===String(c.item_code||"")&&Number(r.expiry_month)===Number(c.expiry_month)&&Number(r.expiry_year)===Number(c.expiry_year)&&String(r.batch_no||"")===String(c.batch_no||""))||null;}
  window.updateExpiryWorkspaceMode=function(){
    const inventory=ExpiryCaptureEngine.desktopView==="INVENTORY";
    const set=(id,fn)=>{const e=document.getElementById(id);if(e)fn(e);};
    set("expiryWorkspaceTitle",e=>e.textContent=inventory?"Expiry Inventory":"Session Activity");
    set("expiryWorkspaceSubtitle",e=>e.textContent=inventory?"All active verified expiry records":"Live captures from this Expiry session");
    set("btnExpiryInventoryView",e=>e.hidden=inventory);set("btnExpirySessionView",e=>e.hidden=!inventory);
    set("expiryCategoryFilter",e=>e.hidden=!inventory);set("expiryCurrentSearch",e=>e.hidden=!inventory);
    set("expiryQuantityHeading",e=>e.textContent=inventory?"Current Qty":"Count");set("expiryTimeHeading",e=>e.textContent=inventory?"Last Updated":"Time");
  };
  window.renderExpirySessionActivity=function(rows){
    const visible=sessionRows(rows);ExpiryCaptureEngine.sessionRows=visible;
    const body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No items captured in this session</strong><span>Scan or search for an item above to start.</span>";}return;}
    if(empty)empty.hidden=true;
    body.innerHTML=visible.map(r=>{const cur=currentFor(r);return '<tr class="expiryActivityRow">'+
      '<td class="expiryGtinCell" title="'+esc(r.identifier_display||r.gtin||"")+'">'+esc(r.identifier_display||r.gtin||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(r.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year)+'</td>'+
      '<td class="expiryQtyCell expiryActivityQty">+'+esc(r.quantity||r.captured_quantity||0)+'</td>'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.captured_at||r.created_at))+'">'+esc(timeOnly(r.captured_at||r.created_at))+'</td>'+
      '<td class="expiryActionsCell">'+(cur?'<button type="button" class="expiryRowAction" data-expiry-manage="'+esc(cur.state_id||"")+'">Manage</button>':'<span class="expiryActivityResolved">Recorded</span>')+'</td></tr>';}).join("");
    body.querySelectorAll("[data-expiry-manage]").forEach(b=>b.onclick=()=>{ExpiryCaptureEngine.desktopView="INVENTORY";ExpiryCaptureEngine.editingStateId=b.dataset.expiryManage;updateExpiryWorkspaceMode();renderExpiryCurrentState(ExpiryCaptureEngine.currentRows);});
  };
  const originalRender=window.renderExpiryCurrentState;
  window.renderExpiryCurrentState=function(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);expiryPopulateCategoryFilter(safe);
    if(ExpiryCaptureEngine.desktopView==="SESSION"){renderExpirySessionActivity(ExpiryCaptureEngine.sessionRows||[]);return;}
    originalRender(safe);
  };
  window.refreshExpiryCurrentState=async function(){
    if(expiryIsHandheld())return[];
    try{
      const search=ExpiryCaptureEngine.desktopView==="INVENTORY"?(document.getElementById("expiryCurrentSearch")?.value||""):"";
      const results=await Promise.all([loadExpiryCurrentState(search),loadExpiryCapturedRecords()]);
      ExpiryCaptureEngine.currentRows=results[0];ExpiryCaptureEngine.sessionRows=sessionRows(results[1]);renderExpiryKpis(results[0]);updateExpiryWorkspaceMode();
      if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity(ExpiryCaptureEngine.sessionRows);else originalRender(results[0]);
      return results[0];
    }catch(e){console.error("Unable to load expiry workspace",e);return[];}
  };
  const originalBind=window.bindExpiryCaptureUI;
  window.bindExpiryCaptureUI=function(){
    originalBind();
    const inv=document.getElementById("btnExpiryInventoryView"),back=document.getElementById("btnExpirySessionView"),clear=document.getElementById("btnClearExpiryActive");
    if(inv&&inv.dataset.v2!=="1"){inv.dataset.v2="1";inv.onclick=()=>{ExpiryCaptureEngine.desktopView="INVENTORY";ExpiryCaptureEngine.editingStateId="";updateExpiryWorkspaceMode();refreshExpiryCurrentState();};}
    if(back&&back.dataset.v2!=="1"){back.dataset.v2="1";back.onclick=()=>{ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";updateExpiryWorkspaceMode();refreshExpiryCurrentState();};}
    if(clear&&clear.dataset.v2!=="1"){clear.dataset.v2="1";clear.onclick=()=>resetExpiryCaptureForm({focus:true});}
  };
  const originalActivate=window.activateExpiryCapture;
  window.activateExpiryCapture=async function(){
    if(!expiryIsHandheld()){ExpiryCaptureEngine.sessionStartedAt=Date.now();ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";}
    updateExpiryWorkspaceMode();return originalActivate();
  };
})();