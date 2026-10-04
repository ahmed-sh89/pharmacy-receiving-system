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
    body.innerHTML=visible.map(r=>{const cur=currentFor(r);const fresh=(Date.now()-expiryCapturedAt(r))<6000;return '<tr class="expiryActivityRow '+(fresh?'expiryRowSavedStrong':'')+'">'+
      '<td class="expiryGtinCell" title="'+esc(r.identifier_display||r.gtin||"")+'">'+esc(r.identifier_display||r.gtin||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(r.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year)+'</td>'+
      '<td class="expiryQtyCell expiryActivityQty">+'+esc(r.quantity||r.captured_quantity||0)+'</td>'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.captured_at||r.created_at))+'">'+esc(timeOnly(r.captured_at||r.created_at))+'</td>'+
      '<td class="expiryActionsCell">'+(cur?'<button type="button" class="expiryRowAction" data-expiry-manage="'+esc(cur.state_id||"")+'">Manage</button>':'<span class="expiryActivityResolved">Recorded</span>')+'</td></tr>';}).join("");
    body.querySelectorAll("[data-expiry-manage]").forEach(b=>b.onclick=()=>{ExpiryCaptureEngine.desktopView="INVENTORY";ExpiryCaptureEngine.editingStateId=b.dataset.expiryManage;updateExpiryWorkspaceMode();renderInventory(ExpiryCaptureEngine.currentRows);});
  };
  function renderInventory(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);expiryPopulateCategoryFilter(safe);
    const visible=expiryFilteredCurrentRows(safe),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No matching expiry records</strong><span>Try another search or category.</span>";}return;}
    if(empty)empty.hidden=true;
    body.innerHTML=visible.map(r=>{const editing=String(r.state_id||"")===String(ExpiryCaptureEngine.editingStateId||"");return '<tr data-expiry-state-id="'+esc(r.state_id||"")+'" class="'+(String(r.state_id||"")===String(ExpiryCaptureEngine.highlightedStateId||"")?"expiryRowUpdated ":"")+(editing?"expiryRowEditing":"")+'">'+
      '<td class="expiryGtinCell" title="'+esc(r.identifier_display||"")+'">'+esc(r.identifier_display||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+(editing?'<input class="expiryInlineInput" data-edit-batch value="'+esc(r.batch_no||"")+'" placeholder="Batch">':esc(r.batch_no||"—"))+'</td>'+
      '<td>'+(editing?'<div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="'+(Number(r.expiry_month)||"")+'"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="'+(Number(r.expiry_year)||"")+'"></div>':esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year))+'</td>'+
      '<td class="expiryQtyCell">'+(editing?'<input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="'+(Number(r.verified_quantity)||1)+'">':esc(r.verified_quantity))+'</td>'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.last_verified_at||r.updated_at))+'">'+esc(expiryFormatVerifiedAt(r.last_verified_at||r.updated_at))+'</td>'+
      '<td class="expiryActionsCell">'+(editing?'<button type="button" class="expiryRowAction primary" data-expiry-save-edit="'+esc(r.state_id||"")+'">Save</button><button type="button" class="expiryRowAction" data-expiry-cancel-edit>Cancel</button>':'<button type="button" class="expiryRowAction" data-expiry-edit="'+esc(r.state_id||"")+'">Edit</button><button type="button" class="expiryRowAction danger" data-expiry-clear="'+esc(r.state_id||"")+'">Delete</button>')+'</td></tr>';}).join("");
    bindExpiryCurrentRowActions();
  }
  const originalRender=window.renderExpiryCurrentState;
  window.renderExpiryCurrentState=function(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);expiryPopulateCategoryFilter(safe);
    if(ExpiryCaptureEngine.desktopView==="SESSION"){renderExpirySessionActivity(ExpiryCaptureEngine.sessionRows||[]);return;}
    renderInventory(safe);
  };
  window.recordExpirySessionCapture=function(payload){
    if(expiryIsHandheld()||!payload)return;
    const row=Object.assign({},payload,{captured_at:new Date().toISOString(),capture_id:"session-"+Date.now()});
    ExpiryCaptureEngine.sessionRows=[row].concat(ExpiryCaptureEngine.sessionRows||[]);
  };
  window.refreshExpiryCurrentState=async function(){
    if(expiryIsHandheld())return[];
    try{
      const search=ExpiryCaptureEngine.desktopView==="INVENTORY"?(document.getElementById("expiryCurrentSearch")?.value||""):"";
      const rows=await loadExpiryCurrentState(search);
      ExpiryCaptureEngine.currentRows=rows;renderExpiryKpis(rows);updateExpiryWorkspaceMode();
      if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity(ExpiryCaptureEngine.sessionRows||[]);else renderInventory(rows);
      return rows;
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