/* PharmFlow Expiry Desktop Workspace V3
   Desktop-only owner: session activity, inventory filters and workspace actions.
   Handheld capture remains owned by js/expiry.js. */
(function(){
  if(typeof window==="undefined") return;
  const FILTERS={category:new Set(),expiry:new Set(),operator:new Set()};
  function esc(v){return typeof expiryEscapeHtml==="function"?expiryEscapeHtml(v):String(v??"");}
  function timeOnly(v){const d=new Date(v||"");return Number.isFinite(d.getTime())?d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—";}
  function sessionRows(){return Array.isArray(ExpiryCaptureEngine.sessionRows)?ExpiryCaptureEngine.sessionRows:[];}
  function currentFor(c){
    const rows=ExpiryCaptureEngine.currentRows||[];
    if(c?.state_id){const exact=rows.find(r=>String(r.state_id||"")===String(c.state_id));if(exact)return exact;}
    return rows.find(r=>String(r.item_code||"")===String(c?.item_code||"")&&Number(r.expiry_month)===Number(c?.expiry_month)&&Number(r.expiry_year)===Number(c?.expiry_year)&&String(r.batch_no||"")===String(c?.batch_no||""))||null;
  }
  function expiryKey(r){return String(Number(r?.expiry_month)||0).padStart(2,"0")+"|"+String(Number(r?.expiry_year)||0);}
  function expiryLabel(key){const [m,y]=String(key).split("|");return (typeof expiryMonthShortName==="function"?expiryMonthShortName(Number(m)):m)+" "+y;}
  function operatorName(r){return String(r?.verified_by_name||r?.operator_name||"Desktop");}
  function inventoryFiltered(rows){
    return (rows||[]).filter(r=>
      (!FILTERS.category.size||FILTERS.category.has(String(r.category||"Uncategorized"))) &&
      (!FILTERS.expiry.size||FILTERS.expiry.has(expiryKey(r))) &&
      (!FILTERS.operator.size||FILTERS.operator.has(operatorName(r)))
    );
  }
  function hasFilters(){return Object.values(FILTERS).some(s=>s.size);}
  function filterOptions(type){
    const rows=ExpiryCaptureEngine.currentRows||[];
    if(type==="category")return [...new Set(rows.map(r=>String(r.category||"Uncategorized")))].sort().map(v=>[v,v]);
    if(type==="operator")return [...new Set(rows.map(operatorName))].sort().map(v=>[v,v]);
    return [...new Set(rows.map(expiryKey))].sort((a,b)=>{const [am,ay]=a.split("|").map(Number),[bm,by]=b.split("|").map(Number);return ay-by||am-bm;}).map(v=>[v,expiryLabel(v)]);
  }
  function closeFilterMenus(){document.querySelectorAll("#zebraExpiryShell .expiryHeaderFilterMenu").forEach(e=>e.remove());}
  function updateFilterIndicators(){
    document.querySelectorAll("[data-expiry-filter-heading]").forEach(th=>{
      const type=th.dataset.expiryFilterHeading,active=FILTERS[type]?.size>0;
      th.classList.toggle("is-filtered",active);
      const dot=th.querySelector(".expiryHeaderFilterDot");if(dot)dot.hidden=!active;
    });
  }
  function openFilter(type,button){
    closeFilterMenus();if(ExpiryCaptureEngine.desktopView!=="INVENTORY")return;
    const selected=FILTERS[type],menu=document.createElement("div");menu.className="expiryHeaderFilterMenu";
    const opts=filterOptions(type);
    menu.innerHTML='<div class="expiryHeaderFilterMenuTitle">Filter '+esc(type==="expiry"?"Expiry":type[0].toUpperCase()+type.slice(1))+'</div>'+
      '<div class="expiryHeaderFilterOptions">'+opts.map(([value,label])=>'<button type="button" class="expiryHeaderFilterOption '+(selected.has(value)?"is-selected":"")+'" data-value="'+esc(value)+'"><span>'+esc(label)+'</span><b>✓</b></button>').join("")+'</div>'+
      '<div class="expiryHeaderFilterActions"><button type="button" data-clear>Clear</button><button type="button" data-done>Done</button></div>';
    button.closest("th").appendChild(menu);
    menu.querySelectorAll("[data-value]").forEach(b=>b.onclick=e=>{e.stopPropagation();const v=b.dataset.value;if(selected.has(v))selected.delete(v);else selected.add(v);b.classList.toggle("is-selected",selected.has(v));updateFilterIndicators();renderInventory(ExpiryCaptureEngine.currentRows||[]);});
    menu.querySelector("[data-clear]").onclick=e=>{e.stopPropagation();selected.clear();updateFilterIndicators();renderInventory(ExpiryCaptureEngine.currentRows||[]);closeFilterMenus();};
    menu.querySelector("[data-done]").onclick=e=>{e.stopPropagation();closeFilterMenus();};
  }
  function updateMode(){
    const inv=ExpiryCaptureEngine.desktopView==="INVENTORY",shell=document.getElementById("zebraExpiryShell");
    const set=(id,fn)=>{const e=document.getElementById(id);if(e)fn(e);};
    set("expiryWorkspaceTitle",e=>e.textContent=inv?"Expiry Inventory":"Session Activity");
    set("expiryWorkspaceSubtitle",e=>e.textContent=inv?"All active verified expiry records":"Live captures from this Expiry session");
    set("btnExpirySessionView",e=>e.hidden=!inv);
    set("btnOpenExpiryInventory",e=>e.hidden=inv);
    set("btnClearExpirySession",e=>e.hidden=inv);
    set("expiryCurrentSearch",e=>e.hidden=!inv);
    set("expiryQuantityHeading",e=>e.textContent=inv?"Current Qty":"Quantity");
    set("expiryTimeHeading",e=>e.textContent=inv?"Last Updated":"Time");
    shell?.classList.toggle("expiryInventoryMode",inv);
    document.querySelectorAll("[data-expiry-filter-heading]").forEach(th=>th.classList.toggle("expiryFiltersEnabled",inv));
    closeFilterMenus();updateFilterIndicators();
  }
  function sessionRowHtml(r){
    const cur=currentFor(r),d=cur||r,fresh=(Date.now()-Date.parse(r.captured_at||""))<6000;
    return '<tr class="expiryActivityRow '+(fresh?'expiryRowSavedStrong':'')+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.captured_at||r.created_at))+'">'+esc(timeOnly(r.captured_at||r.created_at))+'</td>'+
      '<td class="expiryGtinCell" title="'+esc(d.identifier_display||d.gtin||"")+'">'+esc(d.identifier_display||d.gtin||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(d.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(d.item_name||"")+'"><strong>'+esc(d.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(d.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(d.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(d.expiry_month))+' '+esc(d.expiry_year)+'</td>'+
      '<td class="expiryQtyCell expiryActivityQty">'+esc(cur?cur.verified_quantity:(r.quantity||r.captured_quantity||0))+'</td>'+
      '<td class="expiryOperatorCell">'+esc(cur?.verified_by_name||r.operator_name||"Desktop")+'</td>'+
      '<td class="expiryActionsCell">'+(cur?'<button type="button" class="expiryRowAction" data-expiry-session-edit="'+esc(cur.state_id||"")+'">Edit</button><button type="button" class="expiryRowAction danger" data-expiry-session-delete="'+esc(cur.state_id||"")+'">Delete</button>':(r.deleted?'<span class="expiryActivityDeleted">Deleted</span>':'<span class="expiryActivityResolved">Recorded</span>'))+'</td></tr>';
  }
  window.renderExpirySessionActivity=function(){
    const visible=sessionRows(),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No items captured in this session</strong><span>Scan or search for an item above to start.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(sessionRowHtml).join("");
    body.querySelectorAll("[data-expiry-session-edit]").forEach(b=>b.onclick=()=>{const row=expiryCurrentRowById(b.dataset.expirySessionEdit);if(row)renderSessionEditor(row);});
    body.querySelectorAll("[data-expiry-session-delete]").forEach(b=>b.onclick=async()=>{const row=expiryCurrentRowById(b.dataset.expirySessionDelete);if(!row)return;if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="Confirm";setTimeout(()=>{if(b.isConnected&&b.dataset.confirm==="1"){b.dataset.confirm="";b.textContent="Delete";}},3000);return;}b.disabled=true;try{await clearExpiryCurrentState(row);setExpiryStatus("success","REMOVED FROM CURRENT EXPIRY");await refreshExpiryCurrentState();}catch(e){setExpiryStatus("error","DELETE FAILED");b.disabled=false;}});
  };
  function renderSessionEditor(row){
    const body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty");if(empty)empty.hidden=true;if(!body)return;
    body.innerHTML='<tr class="expiryRowEditing"><td class="expiryTimeCell">—</td><td class="expiryGtinCell">'+esc(row.identifier_display||"—")+'</td><td class="expiryCodeCell"><strong>'+esc(row.item_code||"—")+'</strong></td><td class="expiryProductCell"><strong>'+esc(row.item_name||"")+'</strong></td><td><span class="expiryCategoryChip">'+esc(row.category||"Uncategorized")+'</span></td><td><input class="expiryInlineInput" data-edit-batch value="'+esc(row.batch_no||"")+'"></td><td><div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="'+(Number(row.expiry_month)||"")+'"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="'+(Number(row.expiry_year)||"")+'"></div></td><td><input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="'+(Number(row.verified_quantity)||1)+'"></td><td class="expiryOperatorCell">'+esc(row.verified_by_name||"Desktop")+'</td><td class="expiryActionsCell"><button type="button" class="expiryRowAction primary" data-session-save>Save</button><button type="button" class="expiryRowAction" data-session-cancel>Cancel</button></td></tr>';
    body.querySelector("[data-session-cancel]").onclick=()=>renderExpirySessionActivity();
    body.querySelector("[data-session-save]").onclick=async e=>{const tr=e.currentTarget.closest("tr"),v={quantity:Number(tr.querySelector("[data-edit-qty]").value||0),month:Number(tr.querySelector("[data-edit-month]").value||0),year:Number(tr.querySelector("[data-edit-year]").value||0),batch:String(tr.querySelector("[data-edit-batch]").value||"").trim()};if(!Number.isInteger(v.quantity)||v.quantity<=0||v.month<1||v.month>12||v.year<2020||v.year>2200){setExpiryStatus("error","CHECK QUANTITY AND EXPIRY");return;}e.currentTarget.disabled=true;try{await saveExpiryCurrentCorrection(row,v);setExpiryStatus("success","UPDATED · TOTAL "+v.quantity);await refreshExpiryCurrentState();}catch(err){setExpiryStatus("error","UPDATE FAILED");e.currentTarget.disabled=false;}};
  }
  function inventoryRowHtml(r){
    const editing=String(r.state_id||"")===String(ExpiryCaptureEngine.editingStateId||"");
    return '<tr data-expiry-state-id="'+esc(r.state_id||"")+'" class="'+(editing?"expiryRowEditing":"")+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.last_verified_at||r.updated_at))+'">'+esc(expiryFormatVerifiedAt(r.last_verified_at||r.updated_at))+'</td>'+
      '<td class="expiryGtinCell">'+esc(r.identifier_display||"—")+'</td><td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td><td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+(editing?'<input class="expiryInlineInput" data-edit-batch value="'+esc(r.batch_no||"")+'">':esc(r.batch_no||"—"))+'</td>'+
      '<td>'+(editing?'<div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="'+(Number(r.expiry_month)||"")+'"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="'+(Number(r.expiry_year)||"")+'"></div>':esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year))+'</td>'+
      '<td class="expiryQtyCell">'+(editing?'<input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="'+(Number(r.verified_quantity)||1)+'">':esc(r.verified_quantity))+'</td>'+
      '<td class="expiryOperatorCell">'+esc(operatorName(r))+'</td><td class="expiryActionsCell">'+(editing?'<button type="button" class="expiryRowAction primary" data-expiry-save-edit="'+esc(r.state_id||"")+'">Save</button><button type="button" class="expiryRowAction" data-expiry-cancel-edit>Cancel</button>':'<button type="button" class="expiryRowAction" data-expiry-edit="'+esc(r.state_id||"")+'">Edit</button><button type="button" class="expiryRowAction danger" data-expiry-clear="'+esc(r.state_id||"")+'">Delete</button>')+'</td></tr>';
  }
  function renderInventory(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);
    const visible=inventoryFiltered(safe),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No matching expiry records</strong><span>Change the search or clear active filters.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(inventoryRowHtml).join("");bindExpiryCurrentRowActions();
  }
  window.markExpirySessionStateDeleted=function(stateId){ExpiryCaptureEngine.sessionRows=(ExpiryCaptureEngine.sessionRows||[]).map(r=>String(r.state_id||"")===String(stateId||"")?Object.assign({},r,{deleted:true}):r);};
  window.resetExpiryDesktopSession=function(){ExpiryCaptureEngine.sessionStartedAt=0;ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";Object.values(FILTERS).forEach(s=>s.clear());};
  window.recordExpirySessionCapture=function(payload){
    if(expiryIsHandheld()||!payload)return;const incoming=Object.assign({},payload,{captured_at:new Date().toISOString(),capture_id:"session-"+Date.now()});
    ExpiryCaptureEngine.sessionRows=[incoming].concat(ExpiryCaptureEngine.sessionRows||[]);renderExpirySessionActivity();
  };
  window.renderExpiryCurrentState=function(rows){const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(safe);};
  window.refreshExpiryCurrentState=async function(){
    if(expiryIsHandheld())return[];try{const search=ExpiryCaptureEngine.desktopView==="INVENTORY"?(document.getElementById("expiryCurrentSearch")?.value||""):"";const rows=await loadExpiryCurrentState(search);ExpiryCaptureEngine.currentRows=rows;renderExpiryKpis(rows);updateMode();if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(rows);return rows;}catch(e){console.error("Unable to load expiry workspace",e);return[];}
  };
  const originalBind=window.bindExpiryCaptureUI;
  window.bindExpiryCaptureUI=function(){
    originalBind();
    const inv=document.getElementById("btnOpenExpiryInventory"),back=document.getElementById("btnExpirySessionView"),clearSession=document.getElementById("btnClearExpirySession"),search=document.getElementById("expiryCurrentSearch");
    if(inv&&inv.dataset.v3!=="1"){inv.dataset.v3="1";inv.onclick=()=>{ExpiryCaptureEngine.desktopView="INVENTORY";updateMode();refreshExpiryCurrentState();};}
    if(back&&back.dataset.v3!=="1"){back.dataset.v3="1";back.onclick=()=>{ExpiryCaptureEngine.desktopView="SESSION";updateMode();refreshExpiryCurrentState();};}
    if(clearSession&&clearSession.dataset.v3!=="1"){clearSession.dataset.v3="1";clearSession.onclick=()=>{ExpiryCaptureEngine.sessionRows=[];renderExpirySessionActivity();setExpiryStatus("success","SESSION ACTIVITY CLEARED");};}
    document.querySelectorAll("[data-expiry-filter-open]").forEach(b=>{if(b.dataset.bound!=="1"){b.dataset.bound="1";b.onclick=e=>{e.stopPropagation();openFilter(b.dataset.expiryFilterOpen,b);};}});
    if(search&&search.dataset.v3!=="1"){search.dataset.v3="1";let t;search.oninput=()=>{clearTimeout(t);t=setTimeout(()=>refreshExpiryCurrentState(),180);};}
    document.addEventListener("click",e=>{if(!e.target.closest(".expiryHeaderFilterMenu")&&!e.target.closest(".expiryHeaderFilterButton"))closeFilterMenus();});
  };
  const originalActivate=window.activateExpiryCapture;
  window.activateExpiryCapture=async function(){
    if(!expiryIsHandheld()){if(!Array.isArray(ExpiryCaptureEngine.sessionRows))ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";}
    updateMode();return originalActivate();
  };
})();