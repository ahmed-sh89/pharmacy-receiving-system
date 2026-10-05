/* PharmFlow Expiry Desktop Workspace V4
   Canonical desktop owner for Session Activity + Expiry Inventory.
   Handheld capture remains owned by js/expiry.js. */
(function(){
  if(typeof window==="undefined") return;

  const FILTERS={category:new Set(),expiry:new Set(),operator:new Set(),lastUpdated:new Set()};
  let lastUpdatedSort="NONE";
  let pendingDelete=null;
  let viewportBound=false;

  function esc(v){return typeof expiryEscapeHtml==="function"?expiryEscapeHtml(v):String(v??"");}
  function timeOnly(v){const d=new Date(v||"");return Number.isFinite(d.getTime())?d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—";}
  function dateKey(v){const d=new Date(v||"");if(!Number.isFinite(d.getTime()))return "";const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day;}
  function dateLabel(k){const d=new Date(k+"T12:00:00");return Number.isFinite(d.getTime())?d.toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"}):k;}
  function updatedAt(r){return r?.last_verified_at||r?.updated_at||r?.captured_at||r?.created_at||"";}
  function sessionRows(){return Array.isArray(ExpiryCaptureEngine.sessionRows)?ExpiryCaptureEngine.sessionRows:[];}
  function currentFor(c){
    const rows=ExpiryCaptureEngine.currentRows||[];
    if(c?.state_id){const exact=rows.find(r=>String(r.state_id||"")===String(c.state_id));if(exact)return exact;}
    return rows.find(r=>String(r.item_code||"")===String(c?.item_code||"")&&Number(r.expiry_month)===Number(c?.expiry_month)&&Number(r.expiry_year)===Number(c?.expiry_year)&&String(r.batch_no||"")===String(c?.batch_no||""))||null;
  }
  function expiryKey(r){return String(Number(r?.expiry_month)||0).padStart(2,"0")+"|"+String(Number(r?.expiry_year)||0);}
  function expiryLabel(key){const [m,y]=String(key).split("|");return (typeof expiryMonthShortName==="function"?expiryMonthShortName(Number(m)):m)+" "+y;}
  function operatorName(r){return String(r?.verified_by_name||r?.operator_name||"Desktop");}
  function rowId(r){return String(r?.state_id||"");}

  function inventoryFiltered(rows){
    let out=(rows||[]).filter(r=>
      (!FILTERS.category.size||FILTERS.category.has(String(r.category||"Uncategorized"))) &&
      (!FILTERS.expiry.size||FILTERS.expiry.has(expiryKey(r))) &&
      (!FILTERS.operator.size||FILTERS.operator.has(operatorName(r))) &&
      (!FILTERS.lastUpdated.size||FILTERS.lastUpdated.has(dateKey(updatedAt(r))))
    );
    if(lastUpdatedSort!=="NONE"){
      const dir=lastUpdatedSort==="DESC"?-1:1;
      out=out.slice().sort((a,b)=>dir*((Date.parse(updatedAt(a))||0)-(Date.parse(updatedAt(b))||0)));
    }
    return out;
  }
  function hasFilters(){return Object.values(FILTERS).some(s=>s.size)||lastUpdatedSort!=="NONE";}
  function filterOptions(type){
    const rows=ExpiryCaptureEngine.currentRows||[];
    if(type==="category")return [...new Set(rows.map(r=>String(r.category||"Uncategorized")))].sort().map(v=>[v,v]);
    if(type==="operator")return [...new Set(rows.map(operatorName))].sort().map(v=>[v,v]);
    if(type==="lastUpdated")return [...new Set(rows.map(r=>dateKey(updatedAt(r))).filter(Boolean))].sort().reverse().map(v=>[v,dateLabel(v)]);
    return [...new Set(rows.map(expiryKey))].sort((a,b)=>{const [am,ay]=a.split("|").map(Number),[bm,by]=b.split("|").map(Number);return ay-by||am-bm;}).map(v=>[v,expiryLabel(v)]);
  }
  function closeFilterMenus(){document.querySelectorAll("#zebraExpiryShell .expiryHeaderFilterMenu").forEach(e=>e.remove());}
  function updateFilterIndicators(){
    document.querySelectorAll("[data-expiry-filter-heading]").forEach(th=>{
      const type=th.dataset.expiryFilterHeading;
      const active=type==="lastUpdated"?(FILTERS.lastUpdated.size>0||lastUpdatedSort!=="NONE"):!!FILTERS[type]?.size;
      th.classList.toggle("is-filtered",active);
      const dot=th.querySelector(".expiryHeaderFilterDot");if(dot)dot.hidden=!active;
    });
    const clear=document.getElementById("btnClearExpiryFilters");
    if(clear)clear.classList.toggle("is-active",hasFilters());
  }
  function clearAllFilters(){
    Object.values(FILTERS).forEach(s=>s.clear());
    lastUpdatedSort="NONE";
    closeFilterMenus();updateFilterIndicators();
    renderInventory(ExpiryCaptureEngine.currentRows||[]);
  }
  function openFilter(type,button){
    closeFilterMenus();if(ExpiryCaptureEngine.desktopView!=="INVENTORY")return;
    const selected=FILTERS[type],menu=document.createElement("div");menu.className="expiryHeaderFilterMenu";
    const opts=filterOptions(type);
    const sort=type==="lastUpdated"?'<div class="expiryDateSort"><button type="button" data-sort="DESC" class="'+(lastUpdatedSort==="DESC"?"is-selected":"")+'">Newest first</button><button type="button" data-sort="ASC" class="'+(lastUpdatedSort==="ASC"?"is-selected":"")+'">Oldest first</button></div>':"";
    menu.innerHTML='<div class="expiryHeaderFilterMenuTitle">'+esc(type==="lastUpdated"?"Last Updated":type==="expiry"?"Expiry":type[0].toUpperCase()+type.slice(1))+'</div>'+sort+
      '<div class="expiryHeaderFilterOptions">'+opts.map(([value,label])=>'<button type="button" class="expiryHeaderFilterOption '+(selected.has(value)?"is-selected":"")+'" data-value="'+esc(value)+'"><span>'+esc(label)+'</span><b>✓</b></button>').join("")+'</div>'+
      '<div class="expiryHeaderFilterActions"><button type="button" data-clear>Clear</button><button type="button" data-done>Done</button></div>';
    button.closest("th").appendChild(menu);
    menu.querySelectorAll("[data-sort]").forEach(b=>b.onclick=e=>{e.stopPropagation();lastUpdatedSort=b.dataset.sort;updateFilterIndicators();renderInventory(ExpiryCaptureEngine.currentRows||[]);closeFilterMenus();});
    menu.querySelectorAll("[data-value]").forEach(b=>b.onclick=e=>{e.stopPropagation();const v=b.dataset.value;if(selected.has(v))selected.delete(v);else selected.add(v);b.classList.toggle("is-selected",selected.has(v));updateFilterIndicators();renderInventory(ExpiryCaptureEngine.currentRows||[]);});
    menu.querySelector("[data-clear]").onclick=e=>{e.stopPropagation();selected.clear();if(type==="lastUpdated")lastUpdatedSort="NONE";updateFilterIndicators();renderInventory(ExpiryCaptureEngine.currentRows||[]);closeFilterMenus();};
    menu.querySelector("[data-done]").onclick=e=>{e.stopPropagation();closeFilterMenus();};
  }

  function syncViewport(){
    if(expiryIsHandheld())return;
    const shell=document.getElementById("zebraExpiryShell");
    if(!shell?.classList.contains("active"))return;
    const top=Math.max(0,Math.round(shell.getBoundingClientRect().top));
    shell.style.setProperty("--expiry-viewport-height",Math.max(420,window.innerHeight-top)+"px");
    document.body.classList.add("expiryDesktopActive");
  }
  function bindViewport(){
    if(viewportBound)return;viewportBound=true;
    window.addEventListener("resize",syncViewport,{passive:true});
    if(typeof AppEvents!=="undefined"&&AppEvents?.on){
      AppEvents.on("route:changed",payload=>{
        if(payload?.routeName==="expiry")setTimeout(syncViewport,0);
        else document.body.classList.remove("expiryDesktopActive");
      });
    }
  }

  function updateMode(){
    const inv=ExpiryCaptureEngine.desktopView==="INVENTORY",shell=document.getElementById("zebraExpiryShell");
    const set=(id,fn)=>{const e=document.getElementById(id);if(e)fn(e);};
    set("expiryWorkspaceTitle",e=>e.textContent=inv?"Expiry Inventory":"Session Activity");
    set("expiryWorkspaceSubtitle",e=>e.textContent=inv?"All active verified expiry records":"Live captures from this Expiry session");
    set("btnExpirySessionView",e=>{e.hidden=!inv;e.style.display=inv?"":"none";});
    set("btnOpenExpiryInventory",e=>{e.hidden=inv;e.style.display=inv?"none":"";});
    set("btnClearExpirySession",e=>{e.hidden=inv;e.style.display=inv?"none":"";});
    set("expiryCurrentSearch",e=>{e.hidden=!inv;e.style.display=inv?"":"none";});
    set("btnClearExpiryFilters",e=>{e.hidden=!inv;e.style.display=inv?"":"none";});
    set("btnExportExpiryInventory",e=>{e.hidden=!inv;e.style.display=inv?"":"none";});
    set("expiryQuantityHeading",e=>e.textContent=inv?"Current Qty":"Quantity");
    set("expiryTimeHeading",e=>{const text=e.childNodes[0];if(text)text.nodeValue=inv?"Last Updated ":"Time ";});
    shell?.classList.toggle("expiryInventoryMode",inv);
    document.querySelectorAll("[data-expiry-filter-heading]").forEach(th=>th.classList.toggle("expiryFiltersEnabled",inv));
    closeFilterMenus();updateFilterIndicators();syncViewport();
  }

  function deleteActions(scope,id){
    const active=pendingDelete&&pendingDelete.scope===scope&&String(pendingDelete.id)===String(id);
    return active
      ? '<button type="button" class="expiryRowAction" data-delete-cancel>Cancel</button><button type="button" class="expiryRowAction danger confirm" data-delete-confirm="'+esc(id)+'" data-delete-scope="'+scope+'">Confirm</button>'
      : '<button type="button" class="expiryRowAction danger" data-delete-start="'+esc(id)+'" data-delete-scope="'+scope+'">Delete</button>';
  }
  function sessionRowHtml(r){
    const cur=currentFor(r),d=cur||r,fresh=(Date.now()-Date.parse(r.captured_at||""))<6000,id=cur?.state_id||r.state_id||"";
    return '<tr class="expiryActivityRow '+(fresh?'expiryRowSavedStrong':'')+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.captured_at||r.created_at))+'">'+esc(timeOnly(r.captured_at||r.created_at))+'</td>'+
      '<td class="expiryGtinCell" title="'+esc(d.identifier_display||d.gtin||"")+'">'+esc(d.identifier_display||d.gtin||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(d.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(d.item_name||"")+'"><strong>'+esc(d.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(d.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(d.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(d.expiry_month))+' '+esc(d.expiry_year)+'</td>'+
      '<td class="expiryQtyCell expiryActivityQty">'+esc(cur?cur.verified_quantity:(r.quantity||r.captured_quantity||0))+'</td>'+
      '<td class="expiryOperatorCell">'+esc(cur?.verified_by_name||r.operator_name||"Desktop")+'</td>'+
      '<td class="expiryActionsCell">'+(cur?'<button type="button" class="expiryRowAction" data-session-edit="'+esc(id)+'">Edit</button>'+deleteActions("session",id):(r.deleted?'<span class="expiryActivityDeleted">Deleted</span>':'<span class="expiryActivityResolved">Recorded</span>'))+'</td></tr>';
  }
  window.renderExpirySessionActivity=function(){
    const visible=sessionRows(),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No items captured in this session</strong><span>Scan or search for an item above to start.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(sessionRowHtml).join("");bindDesktopRowActions();
  };

  function renderSessionEditor(row){
    const body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty");if(empty)empty.hidden=true;if(!body)return;
    body.innerHTML='<tr class="expiryRowEditing"><td class="expiryTimeCell">—</td><td class="expiryGtinCell">'+esc(row.identifier_display||"—")+'</td><td class="expiryCodeCell"><strong>'+esc(row.item_code||"—")+'</strong></td><td class="expiryProductCell"><strong>'+esc(row.item_name||"")+'</strong></td><td><span class="expiryCategoryChip">'+esc(row.category||"Uncategorized")+'</span></td><td><input class="expiryInlineInput" data-edit-batch value="'+esc(row.batch_no||"")+'"></td><td><div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="'+(Number(row.expiry_month)||"")+'"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="'+(Number(row.expiry_year)||"")+'"></div></td><td><input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="'+(Number(row.verified_quantity)||1)+'"></td><td class="expiryOperatorCell">'+esc(row.verified_by_name||"Desktop")+'</td><td class="expiryActionsCell"><button type="button" class="expiryRowAction primary" data-session-save>Save</button><button type="button" class="expiryRowAction" data-session-cancel>Cancel</button></td></tr>';
    body.querySelector("[data-session-cancel]").onclick=()=>renderExpirySessionActivity();
    body.querySelector("[data-session-save]").onclick=async e=>{const tr=e.currentTarget.closest("tr"),v={quantity:Number(tr.querySelector("[data-edit-qty]").value||0),month:Number(tr.querySelector("[data-edit-month]").value||0),year:Number(tr.querySelector("[data-edit-year]").value||0),batch:String(tr.querySelector("[data-edit-batch]").value||"").trim()};if(!Number.isInteger(v.quantity)||v.quantity<=0||v.month<1||v.month>12||v.year<2020||v.year>2200){setExpiryStatus("error","CHECK QUANTITY AND EXPIRY");return;}e.currentTarget.disabled=true;try{await saveExpiryCurrentCorrection(row,v);setExpiryStatus("success","UPDATED · TOTAL "+v.quantity);await refreshExpiryCurrentState();}catch(err){setExpiryStatus("error","UPDATE FAILED");e.currentTarget.disabled=false;}};
  }

  function inventoryRowHtml(r){
    const editing=rowId(r)===String(ExpiryCaptureEngine.editingStateId||"");
    return '<tr data-expiry-state-id="'+esc(rowId(r))+'" class="'+(editing?"expiryRowEditing":"")+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(updatedAt(r)))+'">'+esc(expiryFormatVerifiedAt(updatedAt(r)))+'</td>'+
      '<td class="expiryGtinCell">'+esc(r.identifier_display||"—")+'</td><td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td><td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+(editing?'<input class="expiryInlineInput" data-edit-batch value="'+esc(r.batch_no||"")+'">':esc(r.batch_no||"—"))+'</td>'+
      '<td>'+(editing?'<div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="'+(Number(r.expiry_month)||"")+'"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="'+(Number(r.expiry_year)||"")+'"></div>':esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year))+'</td>'+
      '<td class="expiryQtyCell">'+(editing?'<input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="'+(Number(r.verified_quantity)||1)+'">':esc(r.verified_quantity))+'</td>'+
      '<td class="expiryOperatorCell">'+esc(operatorName(r))+'</td><td class="expiryActionsCell">'+(editing?'<button type="button" class="expiryRowAction primary" data-inventory-save="'+esc(rowId(r))+'">Save</button><button type="button" class="expiryRowAction" data-inventory-cancel>Cancel</button>':'<button type="button" class="expiryRowAction" data-inventory-edit="'+esc(rowId(r))+'">Edit</button>'+deleteActions("inventory",rowId(r)))+'</td></tr>';
  }
  function renderInventory(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);
    const visible=inventoryFiltered(safe),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No matching expiry records</strong><span>Change the search or clear active filters.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(inventoryRowHtml).join("");bindDesktopRowActions();
  }

  async function confirmDelete(scope,id,button){
    const row=expiryCurrentRowById(id);if(!row)return;
    button.disabled=true;
    try{
      await clearExpiryCurrentState(row);
      pendingDelete=null;
      setExpiryStatus("success","REMOVED FROM CURRENT EXPIRY");
      await refreshExpiryCurrentState();
    }catch(error){
      console.error("Expiry delete failed",error);setExpiryStatus("error","DELETE FAILED");button.disabled=false;
    }
  }
  function bindDesktopRowActions(){
    const body=document.getElementById("expiryCurrentStateBody");if(!body)return;
    body.querySelectorAll("[data-delete-start]").forEach(b=>b.onclick=()=>{pendingDelete={scope:b.dataset.deleteScope,id:b.dataset.deleteStart};ExpiryCaptureEngine.desktopView==="INVENTORY"?renderInventory(ExpiryCaptureEngine.currentRows||[]):renderExpirySessionActivity();});
    body.querySelectorAll("[data-delete-cancel]").forEach(b=>b.onclick=()=>{pendingDelete=null;ExpiryCaptureEngine.desktopView==="INVENTORY"?renderInventory(ExpiryCaptureEngine.currentRows||[]):renderExpirySessionActivity();});
    body.querySelectorAll("[data-delete-confirm]").forEach(b=>b.onclick=()=>confirmDelete(b.dataset.deleteScope,b.dataset.deleteConfirm,b));
    body.querySelectorAll("[data-session-edit]").forEach(b=>b.onclick=()=>{const row=expiryCurrentRowById(b.dataset.sessionEdit);if(row)renderSessionEditor(row);});
    body.querySelectorAll("[data-inventory-edit]").forEach(b=>b.onclick=()=>{pendingDelete=null;ExpiryCaptureEngine.editingStateId=b.dataset.inventoryEdit;renderInventory(ExpiryCaptureEngine.currentRows||[]);});
    body.querySelectorAll("[data-inventory-cancel]").forEach(b=>b.onclick=()=>{ExpiryCaptureEngine.editingStateId="";renderInventory(ExpiryCaptureEngine.currentRows||[]);});
    body.querySelectorAll("[data-inventory-save]").forEach(b=>b.onclick=async()=>{
      const row=expiryCurrentRowById(b.dataset.inventorySave);if(!row)return;
      const tr=b.closest("tr"),v={quantity:Number(tr.querySelector("[data-edit-qty]")?.value||0),month:Number(tr.querySelector("[data-edit-month]")?.value||0),year:Number(tr.querySelector("[data-edit-year]")?.value||0),batch:String(tr.querySelector("[data-edit-batch]")?.value||"").trim()};
      if(!Number.isInteger(v.quantity)||v.quantity<=0||v.month<1||v.month>12||v.year<2020||v.year>2200){setExpiryStatus("error","CHECK QUANTITY AND EXPIRY");return;}
      b.disabled=true;try{await saveExpiryCurrentCorrection(row,v);ExpiryCaptureEngine.editingStateId="";setExpiryStatus("success","UPDATED · TOTAL "+v.quantity);await refreshExpiryCurrentState();}catch(e){setExpiryStatus("error","UPDATE FAILED");b.disabled=false;}
    });
  }

  function exportCurrentInventory(){
    const rows=inventoryFiltered(ExpiryCaptureEngine.currentRows||[]);
    if(!rows.length){setExpiryStatus("action","NO INVENTORY ROWS TO EXPORT");return;}
    if(typeof XLSX==="undefined"){setExpiryStatus("error","XLSX EXPORT UNAVAILABLE");return;}
    const data=rows.map(r=>({
      "Last Updated":expiryFormatVerifiedAt(updatedAt(r)),
      "GTIN / Barcode":r.identifier_display||"",
      "Item Code":r.item_code||"",
      "Product Name":r.item_name||"",
      "Category":r.category||"Uncategorized",
      "Batch":r.batch_no||"",
      "Expiry":expiryMonthShortName(r.expiry_month)+" "+r.expiry_year,
      "Quantity":Number(r.verified_quantity)||0,
      "Operator":operatorName(r)
    }));
    const ws=XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:22},{wch:19},{wch:13},{wch:42},{wch:18},{wch:16},{wch:13},{wch:10},{wch:18}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Expiry Inventory");
    XLSX.writeFile(wb,"PharmFlow_Expiry_Inventory_"+new Date().toISOString().slice(0,10)+".xlsx");
  }

  window.markExpirySessionStateDeleted=function(stateId){ExpiryCaptureEngine.sessionRows=(ExpiryCaptureEngine.sessionRows||[]).map(r=>String(r.state_id||"")===String(stateId||"")?Object.assign({},r,{deleted:true}):r);};
  window.resetExpiryDesktopSession=function(){ExpiryCaptureEngine.sessionStartedAt=0;ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";pendingDelete=null;Object.values(FILTERS).forEach(s=>s.clear());lastUpdatedSort="NONE";};
  window.recordExpirySessionCapture=function(payload){if(expiryIsHandheld()||!payload)return;const incoming=Object.assign({},payload,{captured_at:new Date().toISOString(),capture_id:"session-"+Date.now()});ExpiryCaptureEngine.sessionRows=[incoming].concat(ExpiryCaptureEngine.sessionRows||[]);renderExpirySessionActivity();};
  window.renderExpiryCurrentState=function(rows){const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(safe);};
  window.refreshExpiryCurrentState=async function(){if(expiryIsHandheld())return[];try{const search=ExpiryCaptureEngine.desktopView==="INVENTORY"?(document.getElementById("expiryCurrentSearch")?.value||""):"";const rows=await loadExpiryCurrentState(search);ExpiryCaptureEngine.currentRows=rows;renderExpiryKpis(rows);updateMode();if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(rows);return rows;}catch(e){console.error("Unable to load expiry workspace",e);return[];}};

  const originalBind=window.bindExpiryCaptureUI;
  window.bindExpiryCaptureUI=function(){
    originalBind();bindViewport();
    const inv=document.getElementById("btnOpenExpiryInventory"),back=document.getElementById("btnExpirySessionView"),clearSession=document.getElementById("btnClearExpirySession"),search=document.getElementById("expiryCurrentSearch"),clearFilters=document.getElementById("btnClearExpiryFilters"),exportBtn=document.getElementById("btnExportExpiryInventory");
    if(inv&&inv.dataset.v4!=="1"){inv.dataset.v4="1";inv.onclick=()=>{pendingDelete=null;ExpiryCaptureEngine.desktopView="INVENTORY";updateMode();refreshExpiryCurrentState();};}
    if(back&&back.dataset.v4!=="1"){back.dataset.v4="1";back.onclick=()=>{pendingDelete=null;ExpiryCaptureEngine.desktopView="SESSION";updateMode();refreshExpiryCurrentState();};}
    if(clearSession&&clearSession.dataset.v4!=="1"){clearSession.dataset.v4="1";clearSession.onclick=()=>{pendingDelete=null;ExpiryCaptureEngine.sessionRows=[];renderExpirySessionActivity();setExpiryStatus("success","SESSION ACTIVITY CLEARED");};}
    if(clearFilters&&clearFilters.dataset.v4!=="1"){clearFilters.dataset.v4="1";clearFilters.onclick=clearAllFilters;}
    if(exportBtn&&exportBtn.dataset.v4!=="1"){exportBtn.dataset.v4="1";exportBtn.onclick=exportCurrentInventory;}
    document.querySelectorAll("[data-expiry-filter-open]").forEach(b=>{if(b.dataset.v4!=="1"){b.dataset.v4="1";b.onclick=e=>{e.stopPropagation();openFilter(b.dataset.expiryFilterOpen,b);};}});
    if(search&&search.dataset.v4!=="1"){search.dataset.v4="1";let t;search.oninput=()=>{clearTimeout(t);t=setTimeout(()=>refreshExpiryCurrentState(),180);};}
    if(document.documentElement.dataset.expiryFilterDismiss!=="4"){document.documentElement.dataset.expiryFilterDismiss="4";document.addEventListener("click",e=>{if(!e.target.closest(".expiryHeaderFilterMenu")&&!e.target.closest(".expiryHeaderFilterButton"))closeFilterMenus();});}
  };

  const originalActivate=window.activateExpiryCapture;
  window.activateExpiryCapture=async function(){
    if(!expiryIsHandheld()){if(!Array.isArray(ExpiryCaptureEngine.sessionRows))ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";pendingDelete=null;}
    updateMode();const result=await originalActivate();setTimeout(syncViewport,0);return result;
  };
})();