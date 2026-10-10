/* PharmFlow Expiry Desktop Workspace V4
   Canonical desktop owner for Session Activity + Expiry Inventory.
   Handheld capture remains owned by js/expiry.js. */
(function(){
  if(typeof window==="undefined") return;

  const FILTERS={category:new Set(),expiry:new Set(),operator:new Set(),lastUpdated:new Set()};
  let lastUpdatedSort="NONE";
  let inventorySearchTimer=null;
  let inventoryRequestVersion=0;
  let recordDialog=null;
  let dialogBusy=false;
  let dialogReturnFocus=null;
  let viewportBound=false;
  let reviewCountBound=false;

  function esc(v){return typeof expiryEscapeHtml==="function"?expiryEscapeHtml(v):String(v??"");}
  function timeOnly(v){const d=new Date(v||"");return Number.isFinite(d.getTime())?d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—";}
  function dateKey(v){const d=new Date(v||"");if(!Number.isFinite(d.getTime()))return "";const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day;}
  function dateLabel(k){const d=new Date(k+"T12:00:00");return Number.isFinite(d.getTime())?d.toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"}):k;}
  function updatedAt(r){return r?.last_verified_at||r?.updated_at||r?.captured_at||r?.created_at||"";}
  function sessionRows(){return Array.isArray(ExpiryCaptureEngine.sessionRows)?ExpiryCaptureEngine.sessionRows:[];}
  function sessionKey(r){
    return [String(r?.item_code||""),String(r?.identifier_display||r?.gtin||""),String(r?.batch_no||""),Number(r?.expiry_month)||0,Number(r?.expiry_year)||0].join("|");
  }
  function currentFor(c){
    const rows=ExpiryCaptureEngine.currentRows||[];
    if(!c) return null;
    if(c.state_id){
      const exact=rows.find(r=>String(r.state_id||"")===String(c.state_id));
      if(exact) return exact;
    }
    return null;
  }
  function expiryKey(r){return String(Number(r?.expiry_month)||0).padStart(2,"0")+"|"+String(Number(r?.expiry_year)||0);}
  function expiryLabel(key){const [m,y]=String(key).split("|");return (typeof expiryMonthShortName==="function"?expiryMonthShortName(Number(m)):m)+" "+y;}
  function operatorName(r){return String(r?.verified_by_name||r?.operator_name||"Desktop");}
  function rowId(r){return String(r?.state_id||"");}
  function currentRowById(id){return (ExpiryCaptureEngine.currentRows||[]).find(r=>rowId(r)===String(id||""))||null;}
  function syncSessionAfterCorrection(stateId,v){
    ExpiryCaptureEngine.sessionRows=sessionRows().map(r=>String(r.state_id||"")===String(stateId||"")
      ?Object.assign({},r,{batch_no:v.batch||"",expiry_month:v.month,expiry_year:v.year,quantity:v.quantity,captured_quantity:v.quantity})
      :r);
  }

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
  function hasFilters(){return Object.values(FILTERS).some(s=>s.size)||lastUpdatedSort!=="NONE"||!!document.getElementById("expiryCurrentSearch")?.value;}
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
  async function clearAllFilters(){
    clearTimeout(inventorySearchTimer);inventorySearchTimer=null;
    const search=document.getElementById("expiryCurrentSearch");
    if(search)search.value="";
    Object.values(FILTERS).forEach(s=>s.clear());
    lastUpdatedSort="NONE";
    closeFilterMenus();updateFilterIndicators();
    await refreshExpiryCurrentState();
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
  async function refreshExpiryNeedsReviewCount(){
    const badge=document.getElementById("expiryNeedsReviewCount");
    if(!badge || typeof ExpiryReviewBackend==="undefined")return;
    await ExpiryReviewBackend.refresh();
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
    set("expiryWorkspaceSubtitle",e=>{e.textContent=inv?"All active verified expiry records":"";e.hidden=!inv;});
    set("btnExpirySessionView",e=>{e.hidden=false;e.style.display="";e.setAttribute("aria-selected",String(!inv));e.tabIndex=inv?-1:0;});
    set("btnOpenExpiryInventory",e=>{e.hidden=false;e.style.display="";e.setAttribute("aria-selected",String(inv));e.tabIndex=inv?0:-1;});
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
    return '<button type="button" class="expiryRowAction danger" data-delete-start="'+esc(id)+'" data-delete-scope="'+scope+'">Delete</button>';
  }

  function sessionRowHtml(r){
    const cur=currentFor(r),deleted=!!r.deleted||!cur,d=cur||r,fresh=(Date.now()-Date.parse(r.captured_at||""))<6000,id=String(cur?.state_id||r.state_id||"");
    return '<tr class="expiryActivityRow '+(fresh?'expiryRowSavedStrong ':'')+(deleted?'expiryActivityDeletedRow':'')+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(r.captured_at||r.created_at))+'">'+esc(timeOnly(r.captured_at||r.created_at))+'</td>'+
      '<td class="expiryGtinCell" title="'+esc(d.identifier_display||d.gtin||"")+'">'+esc(d.identifier_display||d.gtin||"—")+'</td>'+
      '<td class="expiryCodeCell"><strong>'+esc(d.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(d.item_name||"")+'"><strong>'+esc(d.item_name||"")+'</strong></td>'+
      '<td><span class="expiryCategoryChip">'+esc(d.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(d.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(d.expiry_month))+' '+esc(d.expiry_year)+'</td>'+
      '<td class="expiryQtyCell expiryActivityQty">'+esc(deleted?(Number(r.quantity)||0):(Number(cur.verified_quantity)||0))+'</td>'+
      '<td class="expiryOperatorCell">'+esc(cur?.verified_by_name||r.operator_name||"Desktop")+'</td>'+
      '<td class="expiryActionsCell">'+(deleted?'<span class="expiryActivityDeleted">Deleted</span>':'<button type="button" class="expiryRowAction" data-session-edit="'+esc(id)+'">Edit</button>'+deleteActions("session",id))+'</td></tr>';
  }
  window.renderExpirySessionActivity=function(){
    const visible=sessionRows(),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No items captured in this session</strong><span>Scan or search for an item above to start.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(sessionRowHtml).join("");bindDesktopRowActions();
  };

  function readEditValues(tr){
    return {
      quantity:Number(tr?.querySelector("[data-edit-qty]")?.value||0),
      month:Number(tr?.querySelector("[data-edit-month]")?.value||0),
      year:Number(tr?.querySelector("[data-edit-year]")?.value||0),
      batch:String(tr?.querySelector("[data-edit-batch]")?.value||"").trim()
    };
  }
  function validateEdit(v){
    if(!Number.isInteger(v.quantity)||v.quantity<=0)return "Quantity must be a whole number greater than 0.";
    if(!Number.isInteger(v.month)||v.month<1||v.month>12)return "Expiry month must be between 1 and 12.";
    if(!Number.isInteger(v.year)||v.year<2020||v.year>2200)return "Expiry year must be between 2020 and 2200.";
    return "";
  }
  function closeRecordDialog(){
    if(dialogBusy)return;
    recordDialog?.close();
  }
  function ensureRecordDialog(){
    if(recordDialog)return recordDialog;
    recordDialog=document.createElement("dialog");
    recordDialog.className="expiryRecordDialog";
    recordDialog.setAttribute("aria-labelledby","expiryRecordDialogTitle");
    document.body.appendChild(recordDialog);
    recordDialog.addEventListener("cancel",e=>{if(dialogBusy)e.preventDefault();});
    recordDialog.addEventListener("close",()=>{recordDialog.innerHTML="";dialogReturnFocus?.focus();dialogReturnFocus=null;});
    return recordDialog;
  }
  function identityHtml(row){
    return '<div class="expiryRecordIdentity"><strong>'+esc(row.item_name||"Expiry record")+'</strong><dl>'+[
      ["Item Code",row.item_code],["GTIN / Barcode",row.identifier_display||row.gtin],["Category",row.category||"Uncategorized"]
    ].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value||"—")+'</dd></div>').join("")+'</dl></div>';
  }
  function openRecordDialog(scope,id,kind,trigger){
    if(expiryIsHandheld()||dialogBusy)return;
    const row=currentRowById(id);if(!row)return;
    const dialog=ensureRecordDialog();dialogReturnFocus=trigger;
    dialog.classList.toggle("is-delete",kind==="delete");
    const months=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'"'+(Number(row.expiry_month)===i+1?' selected':'')+'>'+(i+1)+' · '+esc(expiryMonthShortName(i+1))+'</option>').join("");
    const fields=kind==="edit"?'<div class="expiryRecordFields"><label>Batch Number<input data-edit-batch value="'+esc(row.batch_no||"")+'"></label><label>Serial Number<input value="'+esc(row.sample_serial||row.serial||"")+'" readonly><small>Serial is unchanged by corrections</small></label><label>Expiry Month<select data-edit-month>'+months+'</select></label><label>Expiry Year<input data-edit-year type="number" min="2020" max="2200" value="'+(Number(row.expiry_year)||"")+'"></label><label>Quantity<input data-edit-qty type="number" min="1" step="1" value="'+(Number(row.verified_quantity)||1)+'"></label></div>':'<p>Remove this record from current expiry inventory?</p>';
    dialog.innerHTML='<form><header><h2 id="expiryRecordDialogTitle">'+(kind==="edit"?'Edit Expiry Record':'Delete Expiry Record?')+'</h2><span>'+esc(scope==="session"?'Session Activity':'Expiry Inventory')+'</span></header>'+identityHtml(row)+fields+'<p class="expiryRecordValidation" role="alert" hidden></p><footer><button type="button" data-record-cancel>Cancel</button><button type="submit" class="'+(kind==="delete"?'danger':'primary')+'">'+(kind==="delete"?'Delete':'Save Changes')+'</button></footer></form>';
    dialog.querySelector('[data-record-cancel]').onclick=closeRecordDialog;
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();if(dialogBusy)return;
      const v=kind==="edit"?readEditValues(dialog):null,error=kind==="edit"?validateEdit(v):"";
      const feedback=dialog.querySelector('.expiryRecordValidation');feedback.textContent=error;feedback.hidden=!error;
      if(error)return;
      dialogBusy=true;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
      try{
        if(kind==="delete"){
          await clearExpiryCurrentState(row);
          setExpiryStatus("success","REMOVED FROM CURRENT EXPIRY");
        }else{
          await saveExpiryCurrentCorrection(row,v);
          syncSessionAfterCorrection(row.state_id,v);
          setExpiryStatus("success",scope==="session"?"CURRENT STATE UPDATED":"UPDATED · TOTAL "+v.quantity);
        }
        dialogBusy=false;closeRecordDialog();await refreshExpiryCurrentState();
      }catch(error){
        console.error("Expiry record action failed",error);
        dialogBusy=false;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);
        feedback.textContent=kind==="delete"?"Unable to delete this record. Please retry.":"Unable to save this correction. Please retry.";feedback.hidden=false;
        setExpiryStatus("error",kind==="delete"?"DELETE FAILED":"UPDATE FAILED");
      }
    };
    dialog.showModal();
    dialog.querySelector(kind==="delete"?'[data-record-cancel]':'[data-edit-batch]').focus();
  }
  function inventoryRowHtml(r){
    return '<tr data-expiry-state-id="'+esc(rowId(r))+'">'+
      '<td class="expiryTimeCell" title="'+esc(expiryFormatVerifiedAt(updatedAt(r)))+'">'+esc(expiryFormatVerifiedAt(updatedAt(r)))+'</td>'+
      '<td class="expiryGtinCell">'+esc(r.identifier_display||"—")+'</td><td class="expiryCodeCell"><strong>'+esc(r.item_code||"—")+'</strong></td>'+
      '<td class="expiryProductCell" title="'+esc(r.item_name||"")+'"><strong>'+esc(r.item_name||"")+'</strong></td><td><span class="expiryCategoryChip">'+esc(r.category||"Uncategorized")+'</span></td>'+
      '<td>'+esc(r.batch_no||"—")+'</td><td>'+esc(expiryMonthShortName(r.expiry_month))+' '+esc(r.expiry_year)+'</td>'+
      '<td class="expiryQtyCell">'+esc(r.verified_quantity)+'</td><td class="expiryOperatorCell">'+esc(operatorName(r))+'</td><td class="expiryActionsCell"><button type="button" class="expiryRowAction" data-inventory-edit="'+esc(rowId(r))+'">Edit</button>'+deleteActions("inventory",rowId(r))+'</td></tr>';
  }
  function renderInventory(rows){
    const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);
    const visible=inventoryFiltered(safe),body=document.getElementById("expiryCurrentStateBody"),empty=document.getElementById("expiryCurrentStateEmpty"),count=document.getElementById("expiryCurrentStateCount");
    if(count)count.textContent=String(visible.length);if(!body)return;
    if(!visible.length){body.innerHTML="";if(empty){empty.hidden=false;empty.innerHTML="<strong>No matching expiry records</strong><span>Change the search or clear active filters.</span>";}return;}
    if(empty)empty.hidden=true;body.innerHTML=visible.map(inventoryRowHtml).join("");bindDesktopRowActions();
  }

  function bindDesktopRowActions(){
    const body=document.getElementById("expiryCurrentStateBody");if(!body)return;
    body.querySelectorAll("[data-delete-start]").forEach(b=>b.onclick=()=>openRecordDialog(b.dataset.deleteScope,b.dataset.deleteStart,"delete",b));
    body.querySelectorAll("[data-session-edit]").forEach(b=>b.onclick=()=>openRecordDialog("session",b.dataset.sessionEdit,"edit",b));
    body.querySelectorAll("[data-inventory-edit]").forEach(b=>b.onclick=()=>openRecordDialog("inventory",b.dataset.inventoryEdit,"edit",b));
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
  window.resetExpiryDesktopSession=function(){ExpiryCaptureEngine.sessionStartedAt=0;ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";closeRecordDialog();Object.values(FILTERS).forEach(s=>s.clear());lastUpdatedSort="NONE";};
  window.recordExpirySessionCapture=function(payload){
    if(expiryIsHandheld()||!payload)return;
    const incoming=Object.assign({},payload,{captured_at:new Date().toISOString(),capture_id:"session-"+Date.now()});
    const rows=sessionRows().slice(),key=sessionKey(incoming),index=rows.findIndex(r=>!r.deleted&&(
      (incoming.state_id&&String(r.state_id||"")===String(incoming.state_id)) || sessionKey(r)===key
    ));
    if(index>=0){
      const previous=rows[index];
      const merged=Object.assign({},previous,incoming,{
        quantity:(Number(previous.quantity)||0)+(Number(incoming.quantity)||0),
        captured_quantity:(Number(previous.captured_quantity)||0)+(Number(incoming.captured_quantity)||0)
      });
      rows.splice(index,1);rows.unshift(merged);
    }else rows.unshift(incoming);
    ExpiryCaptureEngine.sessionRows=rows;
    renderExpirySessionActivity();
  };
  window.renderExpiryCurrentState=function(rows){const safe=Array.isArray(rows)?rows:[];ExpiryCaptureEngine.currentRows=safe;renderExpiryKpis(safe);if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(safe);};
  window.refreshExpiryCurrentState=async function(){if(expiryIsHandheld())return[];try{const requestVersion=++inventoryRequestVersion;const search=ExpiryCaptureEngine.desktopView==="INVENTORY"?(document.getElementById("expiryCurrentSearch")?.value||""):"";const rows=await loadExpiryCurrentState(search);if(requestVersion!==inventoryRequestVersion)return[];ExpiryCaptureEngine.currentRows=rows;renderExpiryKpis(rows);updateMode();if(ExpiryCaptureEngine.desktopView==="SESSION")renderExpirySessionActivity();else renderInventory(rows);return rows;}catch(e){console.error("Unable to load expiry workspace",e);return[];}};

  const originalBind=window.bindExpiryCaptureUI;
  window.bindExpiryCaptureUI=function(){
    originalBind();bindViewport();
    if(!reviewCountBound){reviewCountBound=true;window.addEventListener("focus",refreshExpiryNeedsReviewCount);}
    const inv=document.getElementById("btnOpenExpiryInventory"),back=document.getElementById("btnExpirySessionView"),review=document.getElementById("btnExpiryNeedsReview"),clearSession=document.getElementById("btnClearExpirySession"),search=document.getElementById("expiryCurrentSearch"),clearFilters=document.getElementById("btnClearExpiryFilters"),exportBtn=document.getElementById("btnExportExpiryInventory");
    if(inv&&inv.dataset.v4!=="1"){inv.dataset.v4="1";inv.onclick=()=>{closeRecordDialog();ExpiryCaptureEngine.desktopView="INVENTORY";updateMode();refreshExpiryCurrentState();};}
    if(back&&back.dataset.v4!=="1"){back.dataset.v4="1";back.onclick=()=>{closeRecordDialog();ExpiryCaptureEngine.desktopView="SESSION";updateMode();refreshExpiryCurrentState();};}
    if(review&&review.dataset.v4!=="1"){review.dataset.v4="1";review.onclick=()=>openNeedsReviewPanel("EXPIRY");}
    [inv,back,review].forEach(button=>{if(button)button.onkeydown=e=>{
      if(expiryIsHandheld()||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
      e.preventDefault();const enabled=[back,inv,review].filter(x=>x&&!x.disabled),current=enabled.indexOf(button);const next=e.key==="Home"?enabled[0]:e.key==="End"?enabled.at(-1):enabled[(current+(e.key==="ArrowRight"?1:-1)+enabled.length)%enabled.length];next?.focus();next?.click();
    };});
    if(clearSession&&clearSession.dataset.v4!=="1"){clearSession.dataset.v4="1";clearSession.onclick=()=>{closeRecordDialog();ExpiryCaptureEngine.sessionRows=[];renderExpirySessionActivity();setExpiryStatus("success","SESSION ACTIVITY CLEARED");};}
    if(clearFilters&&clearFilters.dataset.v4!=="1"){clearFilters.dataset.v4="1";clearFilters.onclick=clearAllFilters;}
    if(exportBtn&&exportBtn.dataset.v4!=="1"){exportBtn.dataset.v4="1";exportBtn.onclick=exportCurrentInventory;}
    document.querySelectorAll("[data-expiry-filter-open]").forEach(b=>{if(b.dataset.v4!=="1"){b.dataset.v4="1";b.onclick=e=>{e.stopPropagation();openFilter(b.dataset.expiryFilterOpen,b);};}});
    if(search&&search.dataset.v4!=="1"){search.dataset.v4="1";search.oninput=()=>{clearTimeout(inventorySearchTimer);updateFilterIndicators();inventorySearchTimer=setTimeout(()=>{inventorySearchTimer=null;refreshExpiryCurrentState();},180);};}
    if(document.documentElement.dataset.expiryFilterDismiss!=="4"){document.documentElement.dataset.expiryFilterDismiss="4";document.addEventListener("click",e=>{if(!e.target.closest(".expiryHeaderFilterMenu")&&!e.target.closest(".expiryHeaderFilterButton"))closeFilterMenus();});}
  };

  const originalActivate=window.activateExpiryCapture;
  window.activateExpiryCapture=async function(){
    if(!expiryIsHandheld()){if(!Array.isArray(ExpiryCaptureEngine.sessionRows))ExpiryCaptureEngine.sessionRows=[];ExpiryCaptureEngine.desktopView="SESSION";ExpiryCaptureEngine.editingStateId="";closeRecordDialog();}
    updateMode();const result=await originalActivate();setTimeout(syncViewport,0);refreshExpiryNeedsReviewCount();return result;
  };
})();
