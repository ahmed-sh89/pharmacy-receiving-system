
/* =========================================================
   PHARMFLOW — PHASE 2C.9.1
   HANDHELD NEAR EXPIRY + CAPTURED BY
========================================================= */

const ExpiryCaptureEngine = {
    workers: [],
    selectedWorkerId: "",
    currentItem: null,
    busy: false,
    resolving: false,
    draftReady: false,
    pendingDraft: null,
    saveUncertain: false,
    draftScope: "",
    reviewPhotos: {product:null, expiry:null},
    operation:null,
    scanTimer: null,
    lastResolvedRaw: "",
    scannedGS1: null,
    dateSource: "NONE",
    savedClearTimer: null,
    scanClearTimer: null,
    formDirty: false,
    currentRows: [],
    highlightedStateId: "",
    desktopSearchTimer: null,
    desktopSearchRows: [],
    desktopSearchGeneration: 0,
    editingStateId: "",
    desktopView: "RECENT",
    storageKey(){
        const pharmacy = (typeof AuthState !== "undefined" && AuthState.context?.pharmacy_id) || "none";
        const user=(typeof AuthState!=="undefined" && AuthState.user?.id)||"none";
        return `pharmflow_expiry_worker_${user}_${pharmacy}`;
    }
};

function expiryPharmacyId(){
    return (typeof AuthState !== "undefined" && AuthState.context?.pharmacy_id) || null;
}

function expiryMonthShortName(month){
    const names=["","Jan","Feb","Mar","Apr","May","Jun",
                 "Jul","Aug","Sep","Oct","Nov","Dec"];
    return names[Number(month)] || "";
}

function expiryMonthName(month){
    const names = ["","January","February","March","April","May","June",
                   "July","August","September","October","November","December"];
    return names[Number(month)] || "";
}

function expiryEscapeHtml(value){
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function expiryControlValue(el){
    if(!el) return "";
    return el.dataset?.expirySelect ? String(el.dataset.value || "") : String(el.value || "");
}
function expirySelectPlaceholder(el){
    const type=el?.dataset?.expirySelect;
    return type==="month" ? "Month" : type==="year" ? "Year" : type==="category" ? "All Categories" : "Desktop";
}
function setExpiryControlValue(el,value,emit=false){
    if(!el) return;
    const v=String(value ?? "");
    if(!el.dataset?.expirySelect){ el.value=v; if(emit) el.dispatchEvent(new Event("change",{bubbles:true})); return; }
    el.dataset.value=v;
    const options=[...el.querySelectorAll(".pfSelectOption")];
    const selected=options.find(o=>String(o.dataset.value||"")===v);
    const label=el.querySelector(".pfSelectValue");
    if(label) label.textContent=selected?.dataset.label || selected?.textContent || expirySelectPlaceholder(el);
    options.forEach(o=>{
        const on=String(o.dataset.value||"")===v;
        o.classList.toggle("is-selected",on);
        o.setAttribute("aria-selected",String(on));
    });
    if(emit) el.dispatchEvent(new Event("change",{bubbles:true}));
}
function closeExpirySelect(el,restoreFocus=false){
    if(!el?.dataset?.expirySelect) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-expanded","false");
    const menu=el.querySelector(".pfSelectMenu");
    if(menu) menu.hidden=true;
    if(restoreFocus) el.focus();
}
function closeAllExpirySelects(except=null){
    document.querySelectorAll("#zebraExpiryShell .pfSelect.is-open").forEach(el=>{if(el!==except) closeExpirySelect(el);});
}
function openExpirySelect(el){
    if(!el?.dataset?.expirySelect || el.dataset.disabled==="true") return;
    closeAllExpirySelects(el);
    el.classList.add("is-open");
    el.setAttribute("aria-expanded","true");
    const menu=el.querySelector(".pfSelectMenu");
    if(menu) menu.hidden=false;
    const selected=menu?.querySelector(".pfSelectOption.is-selected") || menu?.querySelector(".pfSelectOption:not([data-value=''])");
    selected?.scrollIntoView?.({block:"nearest"});
}
function toggleExpirySelect(el){
    if(el?.classList.contains("is-open")) closeExpirySelect(el,true); else openExpirySelect(el);
}
function buildExpirySelectOptions(el,options){
    if(!el?.dataset?.expirySelect) return;
    const menu=el.querySelector(".pfSelectMenu");
    if(!menu) return;
    const current=expiryControlValue(el);
    menu.innerHTML=options.map(o=>`<button type="button" class="pfSelectOption" role="option" aria-selected="false" data-value="${expiryEscapeHtml(o.value)}" data-label="${expiryEscapeHtml(o.label)}"><span>${expiryEscapeHtml(o.label)}</span><span class="pfSelectCheck" aria-hidden="true">✓</span></button>`).join("");
    menu.querySelectorAll(".pfSelectOption").forEach(btn=>btn.addEventListener("click",e=>{
        e.stopPropagation();
        setExpiryControlValue(el,btn.dataset.value,true);
        closeExpirySelect(el,true);
    }));
    setExpiryControlValue(el,current);
}
function setExpirySelectDisabled(el,disabled){
    if(!el?.dataset?.expirySelect){ if(el) el.disabled=!!disabled; return; }
    el.dataset.disabled=disabled?"true":"false";
    el.setAttribute("aria-disabled",String(!!disabled));
    el.tabIndex=disabled?-1:0;
    el.querySelector(".pfSelectTrigger")?.toggleAttribute("disabled",!!disabled);
    if(disabled) closeExpirySelect(el);
}
function initExpirySelects(){
    document.querySelectorAll("#zebraExpiryShell .pfSelect").forEach(el=>{
        if(el.dataset.selectBound==="1") return;
        el.dataset.selectBound="1";
        el.querySelector(".pfSelectTrigger")?.addEventListener("click",e=>{e.stopPropagation();toggleExpirySelect(el);});
        el.addEventListener("keydown",e=>{
            if(e.key==="Enter"||e.key===" "||e.key==="ArrowDown"){e.preventDefault();openExpirySelect(el);}
            else if(e.key==="Escape"){e.preventDefault();closeExpirySelect(el,true);}
        });
    });
    if(document.documentElement.dataset.expirySelectDismiss!=="2"){
        document.documentElement.dataset.expirySelectDismiss="2";
        document.addEventListener("click",()=>closeAllExpirySelects());
    }
}
function populateExpiryDateDropdowns(){
    const month = document.getElementById("expiryMonth");
    const year = document.getElementById("expiryYear");
    if(month?.dataset?.expirySelect){
        buildExpirySelectOptions(month,[{value:"",label:"Month"},...Array.from({length:12},(_,i)=>({value:String(i+1),label:`${i+1} · ${expiryMonthShortName(i+1)}`}))]);
    }else if(month && month.tagName === "SELECT"){
        const selected=month.value; month.innerHTML=`<option value="">Month</option>`+Array.from({length:12},(_,i)=>{const n=i+1;return `<option value="${n}">${n} · ${expiryMonthShortName(n)}</option>`}).join(""); if(selected)month.value=selected;
    }
    const current=new Date().getFullYear();
    if(year?.dataset?.expirySelect){
        buildExpirySelectOptions(year,[{value:"",label:"Year"},...Array.from({length:11},(_,i)=>({value:String(current+i),label:String(current+i)}))]);
    }else if(year && year.tagName === "SELECT"){
        const selected=year.value; year.innerHTML=`<option value="">Year</option>`+Array.from({length:11},(_,i)=>current+i).map(y=>`<option value="${y}">${y}</option>`).join(""); if(selected)year.value=selected;
    }
    initExpirySelects();
}

async function loadExpiryWorkers(){
    const pharmacyId = expiryPharmacyId();
    if(!pharmacyId || typeof authRpc !== "function") return [];

    const rows = await authRpc("list_pharmacy_expiry_workers", {
        p_pharmacy_id: pharmacyId
    });

    ExpiryCaptureEngine.workers = Array.isArray(rows) ? rows : [];

    let saved = "";
    try{ saved = (expiryIsHandheld()?sessionStorage:localStorage).getItem(ExpiryCaptureEngine.storageKey()) || ""; }catch(_){}

    if(ExpiryCaptureEngine.currentItem && ExpiryCaptureEngine.selectedWorkerId){renderExpiryWorkerSelects();return ExpiryCaptureEngine.workers;}
    if(saved && ExpiryCaptureEngine.workers.some(w => w.worker_id === saved)){
        ExpiryCaptureEngine.selectedWorkerId = saved;
    }else if(ExpiryCaptureEngine.workers.length === 1){
        ExpiryCaptureEngine.selectedWorkerId = ExpiryCaptureEngine.workers[0].worker_id;
    }else{
        ExpiryCaptureEngine.selectedWorkerId = "";
    }

    renderExpiryWorkerSelects();
    renderExpiryWorkerSettingsList();
    return ExpiryCaptureEngine.workers;
}

function renderExpiryWorkerSelects(){
    const selects = [
        document.getElementById("expiryWorkerSelect"),
        document.getElementById("expiryWorkerSettingsSelect")
    ].filter(Boolean);

    selects.forEach(select => {
        const current = ExpiryCaptureEngine.selectedWorkerId || "";
        if(select.dataset?.expirySelect){
            buildExpirySelectOptions(select,[{value:"",label:expiryIsHandheld()?"Select operator":"Desktop"},...ExpiryCaptureEngine.workers.map(w=>({value:String(w.worker_id),label:String(w.worker_name)}))]);
            setExpiryControlValue(select,current);
        }else{
            select.innerHTML=`<option value="">${expiryIsHandheld() ? "Select operator" : "Desktop"}</option>`+ExpiryCaptureEngine.workers.map(w=>`<option value="${expiryEscapeHtml(w.worker_id)}">${expiryEscapeHtml(w.worker_name)}</option>`).join("");
            select.value=current;
        }
    });

    const label = document.getElementById("expiryActiveWorkerName");
    const selected = ExpiryCaptureEngine.workers.find(w => w.worker_id === ExpiryCaptureEngine.selectedWorkerId);
    if(label) label.textContent = selected ? selected.worker_name : expiryIsHandheld()?"Select operator":"Select worker";

    renderExpiryWorkerCompactState?.();
}

function selectExpiryWorker(workerId){
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain || ExpiryCaptureEngine.pendingDraft || ExpiryCaptureEngine.operation?.payload){renderExpiryWorkerSelects();return;}
    if(expiryIsHandheld() && ExpiryCaptureEngine.selectedWorkerId)expiryHandheldSession();
    ExpiryCaptureEngine.selectedWorkerId = String(workerId || "");
    try{
        if(ExpiryCaptureEngine.selectedWorkerId){
            (expiryIsHandheld()?sessionStorage:localStorage).setItem(ExpiryCaptureEngine.storageKey(), ExpiryCaptureEngine.selectedWorkerId);
        }else{
            (expiryIsHandheld()?sessionStorage:localStorage).removeItem(ExpiryCaptureEngine.storageKey());
        }
    }catch(_){}
    renderExpiryWorkerSelects();
    if(expiryIsHandheld() && ExpiryCaptureEngine.currentItem)markExpiryFormDirty();
}

function setExpiryStatus(kind, text){
    const box = document.getElementById("expiryScanStatus");
    if(box){
        const displayKind=expiryIsHandheld() && text==="SAVE FOR REVIEW" ? "error" : kind;
        box.className = `expiryScanStatus ${displayKind || "ready"}`;
        const handheldLabels={
            "FINISH CURRENT CAPTURE — SCAN AGAIN AFTER SAVE":"Save current item first",
            "SELECT WORKER":"Select operator", "READY TO SCAN":"Ready to scan",
            "ITEM FOUND · DATE AUTO READ":"Recognized · date read",
            "ITEM FOUND · SELECT EXPIRY":"Recognized · select expiry",
            "SAVE FOR REVIEW":"Unrecognized · add photos",
            "WAIT FOR DRAFT RECOVERY":"Restoring draft",
            "CAPTURE RETAINED — WORKER LOOKUP OFFLINE":"Draft kept · operator offline",
            "WORKER LOOKUP FAILED — DO NOT SCAN":"Operator unavailable"
        };
        box.textContent = (expiryIsHandheld() && handheldLabels[text]) || text || "READY TO SCAN";
    }
    if(!expiryIsHandheld()){
        const scan=document.querySelector("#zebraExpiryShell .expiryScanBox");
        const input=document.getElementById("expiryBarcodeInput");
        if(scan){
            scan.dataset.feedback=kind||"ready";
            clearTimeout(scan._expiryFeedbackTimer);
            if(kind && kind!=="ready"){
                scan._expiryFeedbackTimer=setTimeout(()=>{scan.dataset.feedback="ready";},1200);
            }
        }
        if(input){
            const base="Scan barcode or search by Item Code / Item Name";
            input.placeholder=(kind && kind!=="ready" && text) ? text : base;
            if(kind && kind!=="ready"){
                clearTimeout(input._expiryPlaceholderTimer);
                input._expiryPlaceholderTimer=setTimeout(()=>{if(input.isConnected) input.placeholder=base;},1200);
            }
        }
    }
}

// Desktop validation presentation only; acceptance conditions remain in saveExpiryCapture.
function showExpiryCaptureValidation(invalidIds,message){
    if(expiryIsHandheld()) return;
    ["expiryMonth","expiryYear","expiryQuantity"].forEach(id=>{
        const field=document.getElementById(id);
        if(!field) return;
        const invalid=invalidIds.includes(id);
        field.classList.toggle("expiryFieldError",invalid);
        if(invalid){field.setAttribute("aria-invalid","true");field.setAttribute("aria-describedby","expiryCaptureValidation");}
        else{field.removeAttribute("aria-invalid");field.removeAttribute("aria-describedby");}
    });
    const feedback=document.getElementById("expiryCaptureValidation");
    if(feedback){feedback.textContent=message||"";feedback.hidden=!message;}
    if(message) setExpiryStatus("error",message);
}
function clearCorrectedExpiryValidation(){
    if(expiryIsHandheld()) return;
    const remaining=[];
    ["expiryMonth","expiryYear","expiryQuantity"].forEach(id=>{
        const field=document.getElementById(id);
        if(!field?.classList.contains("expiryFieldError")) return;
        let value=Number(expiryControlValue(field)||0);
        if(id==="expiryYear" && value>0 && value<100) value+=2000;
        const invalid=id==="expiryMonth"?(value<1||value>12):id==="expiryYear"?(value<2020||value>2200):(!Number.isInteger(value)||value<=0);
        if(invalid) remaining.push(id);
    });
    const feedback=document.getElementById("expiryCaptureValidation");
    if(!feedback || feedback.hidden) return;
    const message=remaining.includes("expiryQuantity")?"Enter quantity":remaining.length===2?"Enter expiry month and year":remaining.includes("expiryMonth")?"Enter expiry month":remaining.includes("expiryYear")?"Enter expiry year":"";
    showExpiryCaptureValidation(remaining,message);
    if(!message) setExpiryStatus("ready","READY TO SCAN");
}

function cancelExpiryScanAutoClear(){
    clearTimeout(ExpiryCaptureEngine.scanClearTimer);
    ExpiryCaptureEngine.scanClearTimer=null;
}

function markExpiryFormDirty(){
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain)return;
    ExpiryCaptureEngine.formDirty=true;
    cancelExpiryScanAutoClear();
    persistExpiryDraft().catch(()=>setExpiryStatus("error","DRAFT NOT STORED — KEEP THIS SCREEN OPEN"));
}

function scheduleExpiryScanAutoClear(){
    // An unsaved capture is never an idle-screen decoration.
    cancelExpiryScanAutoClear();
    renderExpiryEvidence();
    persistExpiryDraft().catch(error=>{
        console.error("Expiry draft persistence failed",error);
        setExpiryStatus("error","DRAFT NOT STORED — KEEP THIS SCREEN OPEN");
    });
}

function expiryDraftScope(){
    const user=typeof AuthState!=="undefined" ? (AuthState.user?.id||AuthState.context?.user_id) : null;
    const pharmacy=expiryPharmacyId();
    return user && pharmacy ? `${user}/${pharmacy}` : "";
}
// Session storage contains receipt IDs only; capture facts always come from the server.
function expiryDeviceId(){
    const id=typeof ensureDeviceId==="function" ? String(ensureDeviceId()||"") : "";
    if(!id)throw new Error("Handheld device identity unavailable");
    return id;
}
function expiryHandheldSession(){
    const scope=expiryDraftScope(),deviceId=expiryDeviceId(),workerId=ExpiryCaptureEngine.selectedWorkerId;
    if(!scope || !workerId)throw new Error("Operator and pharmacy required");
    const key=`pharmflow_expiry_recent_${scope}/${deviceId}`;
    let session;
    try{session=JSON.parse(sessionStorage.getItem(key)||"null");}catch(_){throw new Error("Session history metadata unreadable");}
    if(!session){
        const prior=JSON.parse(sessionStorage.getItem(`${key}/${workerId}`)||"null");
        session={id:prior?.id||crypto.randomUUID(),scope,deviceId,operations:prior?.operations||[],operators:{}};
        for(const id of session.operations)session.operators[id]=workerId;
        sessionStorage.setItem(key,JSON.stringify(session));
    }
    if(session.scope!==scope || session.deviceId!==deviceId || !Array.isArray(session.operations) || !session.operators)throw new Error("Session history scope mismatch");
    return {key,session};
}
function rememberExpiryReceipt(receipt){
    const {key,session}=expiryHandheldSession();
    if(receipt.pharmacy_id!==expiryPharmacyId() || receipt.created_by!==AuthState.user?.id || receipt.device_id!==session.deviceId || receipt.worker_id!==ExpiryCaptureEngine.selectedWorkerId)throw new Error("Capture receipt scope mismatch");
    session.operations=[receipt.operation_id,...session.operations.filter(id=>id!==receipt.operation_id)].slice(0,15);
    session.operators[receipt.operation_id]=receipt.worker_id;
    session.operators=Object.fromEntries(session.operations.map(id=>[id,session.operators[id]]));
    sessionStorage.setItem(key,JSON.stringify(session));
}
async function loadExpirySessionReceipts(){
    if(!ExpiryCaptureEngine.selectedWorkerId)return [];
    const {key,session}=expiryHandheldSession(),scope=expiryDraftScope();
    if(!session.operations.length)return [];
    const workers=[...new Set(session.operations.map(id=>session.operators[id]))];
    const groups=await Promise.all(workers.map(worker=>authRpc("list_pharmflow_expiry_capture_receipts_v1",{
        p_pharmacy_id:expiryPharmacyId(),p_device_id:session.deviceId,p_worker_id:worker,
        p_operation_ids:session.operations.filter(id=>session.operators[id]===worker)
    })));
    if(groups.some(rows=>!Array.isArray(rows)))throw new Error("Session receipt unavailable");
    const rows=groups.flat();
    if(scope!==expiryDraftScope() || key!==expiryHandheldSession().key)throw new Error("Capture account changed");
    if(rows.length!==session.operations.length || new Set(rows.map(row=>row.operation_id)).size!==rows.length || rows.some(row=>!session.operations.includes(row.operation_id) || row.pharmacy_id!==expiryPharmacyId() || row.created_by!==AuthState.user?.id || row.device_id!==session.deviceId || row.worker_id!==session.operators[row.operation_id]))throw new Error("Session receipt scope mismatch");
    return rows.sort((a,b)=>String(b.captured_at).localeCompare(String(a.captured_at))||String(b.operation_id).localeCompare(String(a.operation_id))).slice(0,15);
}
function clearExpirySessionHistory(){
    const {key,session}=expiryHandheldSession();
    session.operations=[];session.operators={};sessionStorage.setItem(key,JSON.stringify(session));
}
async function openExpiryRecentScans(){
    document.getElementById("expiryCapturedOverlay")?.remove();
    const scope=expiryDraftScope();let rows=[],error="";
    try{rows=await loadExpirySessionReceipts();}catch(_){error="Recent scans unavailable. Saved records are retained.";}
    if(scope!==expiryDraftScope())return;
    const overlay=document.createElement("div");overlay.id="expiryCapturedOverlay";overlay.className="expiryCapturedOverlay";
    overlay.innerHTML=`<section class="expiryCapturedPanel expiryRecentScans" role="dialog" aria-modal="true" aria-label="Recent Scans">
      <header><div><span>CURRENT SESSION · LATEST 15</span><strong>Recent Scans</strong></div><button type="button" data-close aria-label="Close recent scans">✕</button></header>
      <div class="expiryCapturedList">${error?`<div role="alert" class="expiryCapturedEmpty">${error}</div>`:rows.length?rows.map(row=>`<details class="expiryCapturedRow" data-operation="${expiryEscapeHtml(row.operation_id)}" data-state="${expiryEscapeHtml(row.acknowledgement?.state_id||"")}" data-review="${expiryEscapeHtml(row.acknowledgement?.review_id||"")}">
       <summary><div class="expiryCapturedMain"><strong>${expiryEscapeHtml(row.item_name||"Unrecognized item")}</strong>
       <span>${expiryEscapeHtml(expiryMonthShortName(row.expiry_month))} ${Number(row.expiry_year)} · Qty ${Number(row.quantity)}</span>
       <small>Operator: ${expiryEscapeHtml(row.operator_name||"Attribution unavailable")}</small></div>
       <span class="expiryHistoryViewOnly">${expiryEscapeHtml(row.kind==="UNKNOWN"?row.status||"Needs Review":"Saved")}</span></summary>
       <div class="expiryRecentDetails"><span>Identifier: ${expiryEscapeHtml(row.identifier_display)}</span><span>Item code: ${expiryEscapeHtml(row.item_code||"—")}</span>
       ${row.batch_no?`<span>Batch: ${expiryEscapeHtml(row.batch_no)}</span>`:""}<span>Expiry: ${String(row.expiry_month).padStart(2,"0")}/${Number(row.expiry_year)}</span>
       <span>Quantity: ${Number(row.quantity)}</span><span>Operator: ${expiryEscapeHtml(row.operator_name||"Attribution unavailable")}</span><span>Status: ${expiryEscapeHtml(row.status||"Saved")}</span></div></details>`).join(""):`<div class="expiryCapturedEmpty">No saved scans in this session.</div>`}</div>
      <button type="button" class="expiryRecentClear" data-clear ${!rows.length?'disabled':''}>Clear History</button>
      <small class="expiryRecentNote">Clears this list only. Saved inventory and review records remain.</small></section>`;
    overlay.querySelector("[data-close]")?.addEventListener("click",()=>{overlay.remove();focusExpiryScanner();});
    overlay.querySelector("[data-clear]")?.addEventListener("click",()=>{
        if(scope!==expiryDraftScope())return;
        try{clearExpirySessionHistory();overlay.remove();openExpiryRecentScans();}catch(_){setExpiryStatus("error","History scope could not be reset");}
    });
    document.body.appendChild(overlay);
}

function expiryDraftSnapshot(status="DRAFT"){
    if(ExpiryCaptureEngine.currentItem && !ExpiryCaptureEngine.operation && !ExpiryCaptureEngine.saveUncertain){
        ExpiryCaptureEngine.operation={id:crypto.randomUUID(),pharmacyId:expiryPharmacyId()};
    }
    const session=expiryIsHandheld()?expiryHandheldSession().session:null;
    return {deviceId:session?.deviceId||null,sessionId:session?.id||null,sourceKey:ExpiryCaptureEngine.draftSourceKey||null,
        scope:expiryDraftScope(),status,item:ExpiryCaptureEngine.currentItem,
        gs1:ExpiryCaptureEngine.scannedGS1,workerId:ExpiryCaptureEngine.selectedWorkerId,
        quantity:document.getElementById("expiryQuantity")?.value||"",
        month:expiryControlValue(document.getElementById("expiryMonth")),
        year:expiryControlValue(document.getElementById("expiryYear")),
        batch:document.getElementById("expiryBatchInput")?.value||"",
        serial:document.getElementById("expirySerialInput")?.value||"",
        operation:ExpiryCaptureEngine.operation,photos:ExpiryCaptureEngine.reviewPhotos,dateSource:ExpiryCaptureEngine.dateSource
    };
}
async function persistExpiryDraft(status){
    if(!expiryIsHandheld() || !ExpiryCaptureEngine.currentItem) return;
    const scope=expiryDraftScope();
    if(!scope || (ExpiryCaptureEngine.draftScope && scope!==ExpiryCaptureEngine.draftScope)) throw new Error("Capture account changed");
    if(typeof ExpiryDraftStore==="undefined") throw new Error("Durable draft store unavailable");
    const snapshot=expiryDraftSnapshot(status||(ExpiryCaptureEngine.saveUncertain?"UNCERTAIN":"DRAFT"));
    await claimExpiryOperation(snapshot.operation?.id);
    await ExpiryDraftStore.put(scope,snapshot);
    ExpiryCaptureEngine.draftScope=scope;
}
async function setExpiryEvidencePhoto(role,file){
    if(!expiryIsHandheld() || !ExpiryCaptureEngine.currentItem?.needsReview || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain) throw new Error("Capture is not editable");
    if(!["product","expiry"].includes(role) || !(file instanceof Blob) || !["image/jpeg","image/png","image/webp"].includes(file.type) || !file.size || file.size>5*1024*1024) throw new Error("Invalid review photo");
    if(ExpiryCaptureEngine.operation?.payload)throw new Error("Submitted evidence is locked");
    if(ExpiryCaptureEngine.operation?.uploaded)delete ExpiryCaptureEngine.operation.uploaded[role];
    ExpiryCaptureEngine.reviewPhotos[role]=file;
    markExpiryFormDirty();
    await persistExpiryDraft();
}
async function restoreExpiryDraft(){
    if(!expiryIsHandheld() || typeof ExpiryDraftStore==="undefined") return false;
    const scope=expiryDraftScope();
    if(!scope) return false;
    const draft=await ExpiryDraftStore.get(scope);
    if(scope!==expiryDraftScope() || !draft?.item || draft.scope!==scope) return false;
    const device=draft.deviceId||draft.operation?.payload?.device_id;
    if(device && device!==expiryDeviceId())throw new Error("Draft belongs to another device");
    if(ExpiryCaptureEngine.workers.length && !ExpiryCaptureEngine.workers.some(w=>w.worker_id===draft.workerId))throw new Error("Draft operator unavailable");
    await claimExpiryOperation(draft.operation?.id);
    if(scope!==expiryDraftScope())throw new Error("Capture account changed");
    ExpiryCaptureEngine.draftScope=scope;
    ExpiryCaptureEngine.currentItem=draft.item;
    ExpiryCaptureEngine.scannedGS1=draft.gs1;
    ExpiryCaptureEngine.selectedWorkerId=draft.workerId;
    sessionStorage.setItem(ExpiryCaptureEngine.storageKey(),draft.workerId);
    const {key,session}=expiryHandheldSession();
    if(draft.sessionId && draft.sessionId!==session.id){session.id=draft.sessionId;session.operations=[];session.operators={};sessionStorage.setItem(key,JSON.stringify(session));}
    ExpiryCaptureEngine.pendingDraft=null;
    const recovery=document.getElementById("expiryRecoverableDrafts");if(recovery){recovery.replaceChildren();recovery.hidden=true;}
    ExpiryCaptureEngine.draftReady=true;
    renderExpiryWorkerSelects();
    ExpiryCaptureEngine.reviewPhotos=draft.photos||{product:null,expiry:null};
    ExpiryCaptureEngine.operation=draft.operation||null;
    ExpiryCaptureEngine.draftSourceKey=draft.sourceKey||null;
    ExpiryCaptureEngine.saveUncertain=!!draft.operation?.payload || ["SENDING","UNCERTAIN","ACKNOWLEDGED"].includes(draft.status);
    for(const [id,value] of Object.entries({expiryQuantity:draft.quantity,expiryBatchInput:draft.batch,expirySerialInput:draft.serial})){
        const el=document.getElementById(id);if(el)el.value=value||"";
    }
    setExpiryControlValue(document.getElementById("expiryMonth"),draft.month);
    setExpiryControlValue(document.getElementById("expiryYear"),draft.year);
    setExpiryDateMode(draft.dateSource);
    for(const [id,value] of Object.entries({expiryItemName:draft.item.itemName,expiryItemCode:draft.item.itemCode||"Needs Review",expiryItemGTIN:draft.item.identifierDisplay,expiryItemCategory:draft.item.category||"Pending",expiryItemBatch:draft.batch||draft.gs1?.lot,expiryItemSerial:draft.serial||draft.gs1?.serial})){
        const el=document.getElementById(id);if(el)el.textContent=value||"—";
    }
    const button=document.getElementById("btnSaveExpiryCapture");if(button){button.disabled=ExpiryCaptureEngine.saveUncertain && !ExpiryCaptureEngine.operation?.payload;button.textContent=ExpiryCaptureEngine.saveUncertain && ExpiryCaptureEngine.operation?"CHECK / RETRY SAVE":"SAVE & NEXT";}
    renderExpiryEvidence();
    if(ExpiryCaptureEngine.saveUncertain){
        ["expiryQuantity","expiryBatchInput","expirySerialInput"].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=true;});
        ["expiryMonth","expiryYear","expiryWorkerSelect"].forEach(id=>setExpirySelectDisabled(document.getElementById(id),true));
    }
    setExpiryStatus("action",ExpiryCaptureEngine.saveUncertain?(ExpiryCaptureEngine.operation?"CHECK / RETRY SAME OPERATION — DRAFT RETAINED":"LEGACY SAVE REQUIRES RECONCILIATION — DO NOT RESEND"):"UNSAVED CAPTURE RESTORED");
    return true;
}

function expiryWorkerIsEditing(){
    const active=document.activeElement;
    if(!active || active===document.body) return false;

    if(active.id==="expiryBarcodeInput") return false;

    return !!(
        ["INPUT","SELECT","TEXTAREA"].includes(String(active.tagName||"").toUpperCase()) ||
        active.closest?.(".pfSelect") ||
        active.isContentEditable
    );
}

function setExpiryDateMode(mode){
    const month=document.getElementById("expiryMonth");
    const year=document.getElementById("expiryYear");
    const label=document.getElementById("expiryMonthName");

    ExpiryCaptureEngine.dateSource=mode==="AUTO" ? "AUTO" : "MANUAL";

    if(mode==="AUTO"){
        setExpirySelectDisabled(month,expiryIsHandheld());
        setExpirySelectDisabled(year,expiryIsHandheld());
        if(label){
            const selected=Number(expiryControlValue(month)||0);
            label.textContent=selected
                ? `${expiryMonthName(selected)} · AUTO READ ✓`
                : "AUTO READ ✓";
        }
    }else{
        setExpirySelectDisabled(month,false);
        setExpirySelectDisabled(year,false);
        if(label){
            const selected=Number(expiryControlValue(month)||0);
            label.textContent=selected ? expiryMonthName(selected) : "";
        }
    }
}

function clearExpirySavedConfirmation(){
    clearTimeout(ExpiryCaptureEngine.savedClearTimer);
    ExpiryCaptureEngine.savedClearTimer=null;

    const saved=document.getElementById("expiryLastSaved");
    if(saved) saved.innerHTML="";
}

function scheduleExpirySavedAutoClear(){
    clearTimeout(ExpiryCaptureEngine.savedClearTimer);

    ExpiryCaptureEngine.savedClearTimer=setTimeout(()=>{
        /*
           2C.11.3.1 — real 30-second CLEAR SCREEN after a successful save.
           Saved database data is untouched. If the worker has started a new
           unsaved item or is editing a field, defer instead of clearing work.
        */
        if(ExpiryCaptureEngine.currentItem || expiryWorkerIsEditing()){
            scheduleExpirySavedAutoClear();
            return;
        }

        clearExpiryScreen({
            clearSaved:true,
            savedOnly:true
        });
    },30000);
}

async function clearExpiryHandheldCapture(){
    const engine=ExpiryCaptureEngine;
    if(engine.busy || engine.resolving || engine.saveUncertain || engine.operation?.payload || (engine.pendingDraft && !expiryDraftDiscardable(engine.pendingDraft.draft))){setExpiryStatus("action","Save pending — check or retry first");return false;}
    if(!expiryDraftScope() || !engine.draftReady && !engine.pendingDraft)return false;
    const draft=engine.pendingDraft?.draft || (engine.currentItem?expiryDraftSnapshot():null);
    if(draft && (draft.scope!==expiryDraftScope() || !expiryDraftDiscardable(draft))){setExpiryStatus("action","Draft requires reconciliation");return false;}
    if(draft && !window.confirm("Discard the current unsaved capture?"))return false;
    const scope=expiryDraftScope();
    engine.busy=true;
    try{
        if(draft){
            await claimExpiryOperation(draft.operation?.id);
            const stored=await ExpiryDraftStore.get(scope);
            if(scope!==expiryDraftScope())throw new Error("Capture account changed");
            if(stored && (!expiryDraftDiscardable(stored) || stored.operation?.id!==draft.operation?.id))throw new Error("Draft changed");
            await ExpiryDraftStore.remove(scope);
        }
        clearTimeout(engine.scanTimer);engine.lastResolvedRaw="";
        if(typeof HandheldRuntime!=="undefined")clearTimeout(HandheldRuntime.expiryInputTimer);
        const input=document.getElementById("expiryBarcodeInput");if(input)input.value="";
        resetExpiryCaptureForm({focus:true});clearExpirySavedConfirmation();engine.draftReady=true;
        return true;
    }catch(_){setExpiryStatus("error","Clear blocked — draft retained");return false;}
    finally{engine.busy=false;}
}
async function leaveExpiryHandheld(){
    const engine=ExpiryCaptureEngine;
    if(engine.busy || engine.resolving || engine.saveUncertain || engine.operation?.payload || (engine.pendingDraft && !expiryDraftDiscardable(engine.pendingDraft.draft))){setExpiryStatus("action","Save pending — check or retry first");return false;}
    if(engine.currentItem){
        if(!window.confirm("Keep this unsaved capture and return to workspaces?"))return false;
        engine.busy=true;
        try{const scope=expiryDraftScope();await persistExpiryDraft();if(scope!==expiryDraftScope())throw new Error("Capture account changed");resetExpiryCaptureForm({focus:false});engine.draftReady=false;}
        catch(_){setExpiryStatus("error","Draft not stored — stay on this screen");return false;}
        finally{engine.busy=false;}
    }
    if(typeof setZebraHomeMode==="function")setZebraHomeMode();
    return true;
}

function clearExpiryScreen(options={}){
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain){setExpiryStatus("action","CAPTURE LOCKED — WAIT OR RECONCILE SAVE");return;}
    if(expiryIsHandheld() && options.savedOnly!==true && ExpiryCaptureEngine.currentItem){
        setExpiryStatus("action","UNSAVED CAPTURE — SAVE BEFORE CLEAR");return;
    }
    try{ document.activeElement?.blur?.(); }catch(_){}

    clearTimeout(ExpiryCaptureEngine.scanTimer);
    cancelExpiryScanAutoClear();
    ExpiryCaptureEngine.formDirty=false;
    ExpiryCaptureEngine.lastResolvedRaw="";

    /*
       CLEAR SCREEN is UI-only:
       - never deletes a saved expiry capture,
       - never changes quantity/history,
       - never touches Needs Review data.
       Manual Clear may abandon the current unsaved visual form.
       Auto Clear runs only after Save and therefore uses savedOnly.
    */
    if(options.savedOnly!==true){
        resetExpiryCaptureForm({focus:false});
    }

    if(options.clearSaved!==false){
        clearExpirySavedConfirmation();
    }

    setExpiryStatus("ready","READY TO SCAN");

    setTimeout(()=>{
        focusExpiryScanner();
        window.hhRepairScannerFocus?.("expiry-clear-screen");
    },40);
}

function renderExpiryActiveItem(item,gs1={}){
    const shell=document.getElementById("expiryActiveItem");
    if(!shell || expiryIsHandheld()) return;
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value||"—";};
    shell.hidden=false;
    shell.classList.toggle("is-empty",!item);
    if(!item){
        set("expiryActiveItemName","Ready for next item");
        set("expiryActiveItemCode","—");set("expiryActiveItemGTIN","—");set("expiryActiveItemCategory","—");
        return;
    }
    set("expiryActiveItemName",item.itemName||"Item not recognized");
    set("expiryActiveItemCode",item.itemCode||"Needs Review");
    set("expiryActiveItemGTIN",item.identifierDisplay||item.gtin||"—");
    set("expiryActiveItemCategory",item.category||"Uncategorized");
    const batch=document.getElementById("expiryBatchInput"),serial=document.getElementById("expirySerialInput");
    if(batch)batch.value=gs1?.lot||"";
    if(serial)serial.value=gs1?.serial||"";
    shell.hidden=false;
}

function resetExpiryCaptureForm(options = {}){
    cancelExpiryScanAutoClear();
    ExpiryCaptureEngine.formDirty=false;
    showExpiryCaptureValidation([],"");
    ExpiryCaptureEngine.currentItem = null;
    ExpiryCaptureEngine.pendingDraft=null;
    const recovery=document.getElementById("expiryRecoverableDrafts");if(recovery){recovery.replaceChildren();recovery.hidden=true;}
    ExpiryCaptureEngine.scannedGS1 = null;
    ExpiryCaptureEngine.reviewPhotos={product:null,expiry:null};
    releaseExpiryOperation();
    ExpiryCaptureEngine.operation=null;
    ExpiryCaptureEngine.draftSourceKey=null;
    renderExpiryEvidence();
    const saveButton=document.getElementById("btnSaveExpiryCapture");if(saveButton)saveButton.textContent="SAVE & NEXT";
    ExpiryCaptureEngine.draftScope="";
    renderExpiryActiveItem(null);
    ["expiryBatchInput","expirySerialInput"].forEach(id=>{const field=document.getElementById(id);if(field)field.value="";});

    ["expiryItemName","expiryItemCode","expiryItemGTIN","expiryItemCategory","expiryItemBatch","expiryItemSerial"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = "—";
    });

    const qty = document.getElementById("expiryQuantity");
    const month = document.getElementById("expiryMonth");
    const year = document.getElementById("expiryYear");
    const monthName = document.getElementById("expiryMonthName");

    if(qty){
        qty.value = "";
        qty.disabled=false;
        qty.readOnly=expiryIsHandheld();
        qty.dataset.intentionalEdit="0";
    }
    if(month){
        setExpirySelectDisabled(month,false);
        setExpiryControlValue(month,"",true);
    }
    if(year){
        setExpirySelectDisabled(year,false);
        setExpiryControlValue(year,"",true);
    }
    if(monthName) monthName.textContent = "";

    ExpiryCaptureEngine.dateSource="NONE";

    document.getElementById("btnSaveExpiryCapture")?.setAttribute("disabled","disabled");

    setExpiryStatus("ready","READY TO SCAN");

    if(options.focus !== false){
        setTimeout(()=>focusExpiryScanner(),40);
    }
}

function focusExpiryScanner(){
    const input = document.getElementById("expiryBarcodeInput");
    if(!input) return;
    input.setAttribute("inputmode",expiryIsHandheld()?"none":"text");
    input.setAttribute("autocomplete","off");
    try{ input.focus({preventScroll:true}); }catch(_){ input.focus(); }
}

function expiryIdentifierFromScan(cleaned, parsed){
    const raw=toSafeString(cleaned).trim();
    const parsedIdentifier=toSafeString(
        parsed?.identifierDisplay || parsed?.gtin || parsed?.raw || parsed?.original || ""
    ).trim();

    /* Exact Identifier V2 semantics:
       - GS1 resolves by its parsed GTIN while preserving Batch/Expiry/Serial.
       - Plain/alphanumeric identifiers remain byte-for-byte display values
         after scanner trimming; never collapse them to numeric fragments. */
    if(/[A-Za-z]/.test(raw) && !(typeof looksLikeStrongBarcode==="function" && looksLikeStrongBarcode(raw))){
        return raw;
    }

    return parsedIdentifier || raw;
}

async function expirySearchGlobalItems(query){
    if(expiryIsHandheld() || typeof authRpc!=="function") return [];
    const q=toSafeString(query).trim();
    if(q.length<2) return [];
    const response=await authRpc("search_pharmflow_global_items_v3",{p_query:q,p_limit:8});
    const rows=Array.isArray(response)
        ? response
        : (Array.isArray(response?.data) ? response.data : []);
    return rows;
}
function closeExpirySearchResults(invalidate=false){
    if(invalidate) ExpiryCaptureEngine.desktopSearchGeneration++;
    const box=document.getElementById("expirySearchResults");
    if(box){box.hidden=true;box.innerHTML="";}
    ExpiryCaptureEngine.desktopSearchRows=[];
}
function renderExpirySearchResults(rows){
    const box=document.getElementById("expirySearchResults");
    if(!box) return;
    ExpiryCaptureEngine.desktopSearchRows=Array.isArray(rows)?rows:[];
    if(!ExpiryCaptureEngine.desktopSearchRows.length){
        box.innerHTML='<div class="expirySearchEmpty"><strong>Item not found</strong><span>No matching item was found.</span></div>';
        box.hidden=false;
        return;
    }
    box.innerHTML=ExpiryCaptureEngine.desktopSearchRows.map((row,index)=>{
        const identifier=toSafeString(row.identifier_display).trim();
        return '<button type="button" class="smartSearchResult expirySearchResult" data-expiry-search-index="'+index+'">'+
            '<div class="smartSearchResultMain expirySearchResultMain">'+
                '<strong>'+expiryEscapeHtml(row.item_name||"Unnamed item")+'</strong>'+
                (identifier?'<span>GTIN / Barcode: <b>'+expiryEscapeHtml(identifier)+'</b></span>':'')+
            '</div>'+
            '<div class="expirySearchResultMeta">'+
                '<strong>'+expiryEscapeHtml(row.item_code||"—")+'</strong>'+
                '<span>'+expiryEscapeHtml(row.category||row.group_name||"Uncategorized")+'</span>'+
            '</div>'+
        '</button>';
    }).join("");
    box.hidden=false;
    box.querySelectorAll("[data-expiry-search-index]").forEach(button=>button.onclick=()=>selectExpirySearchResult(Number(button.dataset.expirySearchIndex)));
}
async function selectExpirySearchResult(index){
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || (ExpiryCaptureEngine.saveUncertain && !ExpiryCaptureEngine.operation?.payload)) return;
    const row=ExpiryCaptureEngine.desktopSearchRows[index];
    if(!row) return;
    closeExpirySearchResults();
    setExpiryStatus("busy","LOADING ITEM...");
    try{
        const identifiers=await authRpc("list_pharmflow_global_item_identifiers_v2",{p_item_code:row.item_code})||[];
        const identifier=toSafeString(identifiers?.[0]?.identifier_display).trim();
        if(!identifier) throw new Error("No identifier mapped");
        ExpiryCaptureEngine.scannedGS1={identifierDisplay:identifier,gtin:identifier};
        ExpiryCaptureEngine.currentItem={itemCode:row.item_code||"",itemName:row.item_name||"",identifierDisplay:identifier,gtin:identifier,category:row.category||row.group_name||"",identifierSource:"GLOBAL_SEARCH"};
        renderExpiryActiveItem(ExpiryCaptureEngine.currentItem,{});
        const values={expiryItemName:row.item_name||"Unnamed item",expiryItemCode:row.item_code||"—",expiryItemGTIN:identifier,expiryItemCategory:row.category||row.group_name||"Uncategorized"};
        Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
        const qty=document.getElementById("expiryQuantity");if(qty){qty.value="1";qty.readOnly=expiryIsHandheld();qty.dataset.intentionalEdit="0";}
        setExpiryDateMode("MANUAL");
        document.getElementById("btnSaveExpiryCapture")?.removeAttribute("disabled");
        const input=document.getElementById("expiryBarcodeInput");if(input)input.value="";
        setExpiryStatus("success","✓ "+toSafeString(row.item_name||"ITEM FOUND").toUpperCase()+" · SELECT EXPIRY");
    }catch(error){
        console.error("Expiry manual item selection failed",error);
        setExpiryStatus("error","ITEM HAS NO USABLE IDENTIFIER");
    }
}

async function resolveExpiryScannedValue(rawValue){
    const cleaned = typeof cleanScannerInput === "function"
        ? cleanScannerInput(rawValue)
        : String(rawValue || "").trim();

    if(!cleaned) return false;
    if(expiryIsHandheld() && !ExpiryCaptureEngine.draftReady){setExpiryStatus("action","WAIT FOR DRAFT RECOVERY");return false;}
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain || (expiryIsHandheld() && ExpiryCaptureEngine.currentItem)){
        setExpiryStatus("action","FINISH CURRENT CAPTURE — SCAN AGAIN AFTER SAVE");
        return false;
    }

    if(expiryIsHandheld() && !ExpiryCaptureEngine.selectedWorkerId){
        setExpiryStatus("action","SELECT WORKER");
        try{ document.activeElement?.blur?.(); }catch(_){}
        return false;
    }

    ExpiryCaptureEngine.resolving=true;
    const lookupScope=expiryDraftScope();
    setExpiryStatus("busy","READING...");

    let parsed;
    try{
        parsed=typeof parseGS1Barcode==="function" ? parseGS1Barcode(cleaned) : {gtin:cleaned,identifierDisplay:cleaned};
    }catch(error){
        ExpiryCaptureEngine.resolving=false;
        setExpiryStatus("error","SCAN PARSE FAILED — SCAN AGAIN");return false;
    }

    let identifierDisplay=expiryIdentifierFromScan(cleaned,parsed);
    if(typeof ExpiryOperation!=="undefined"){
        try{
            const facts=ExpiryOperation.scanFacts(rawValue);
            parsed={...parsed,identifierDisplay:facts.identifier,gtin:facts.identifier,lot:facts['10']||"",serial:facts['21']||""};
            if(facts['17'])parsed.expiry=`20${facts['17'].slice(0,2)}-${facts['17'].slice(2,4)}-${facts['17'].slice(4,6)}`;
        }catch(error){ExpiryCaptureEngine.resolving=false;setExpiryStatus("error",error.message);return false;}
    }
    identifierDisplay=parsed?.identifierDisplay||identifierDisplay;
    ExpiryCaptureEngine.scannedGS1 = parsed || null;

    if(!identifierDisplay){
        ExpiryCaptureEngine.resolving=false;
        setExpiryStatus("error","IDENTIFIER NOT READ");
        setTimeout(()=>setExpiryStatus("ready","READY TO SCAN"),1000);
        return false;
    }

    let record = null;
    try{
        if(typeof IdentifierService==="undefined" || typeof IdentifierService.resolve!=="function"){
            throw new Error("Authoritative identifier service is unavailable");
        }

        record = await Promise.race([
            Promise.resolve(IdentifierService.resolve(identifierDisplay)),
            new Promise((_,reject)=>setTimeout(
                ()=>reject(new Error("Identifier lookup timed out")),
                5000
            ))
        ]);
    }catch(error){
        ExpiryCaptureEngine.resolving=false;
        console.error("Expiry identifier lookup failed",error);

        const input=document.getElementById("expiryBarcodeInput");
        if(input) input.value="";

        if(String(error?.message || "").toLowerCase().includes("timed out")){
            setExpiryStatus("error","LOOKUP TIMEOUT — SCAN AGAIN");
        }else{
            setExpiryStatus("error","LOOKUP FAILED — SCAN AGAIN");
        }

        setTimeout(()=>{
            setExpiryStatus("ready","READY TO SCAN");
            focusExpiryScanner();
        },1200);

        return false;
    }

    ExpiryCaptureEngine.resolving=false;
    if(lookupScope!==expiryDraftScope()) return false;
    const found=record?.found===true;
    const resolvedIdentifier=identifierDisplay;

    if(!found){
        ExpiryCaptureEngine.currentItem={
            itemCode:"",
            itemName:"Item not recognized",
            identifierDisplay,
            gtin:identifierDisplay,
            category:"",
            needsReview:true,
            rawBarcode:String(rawValue??"")
        };

        document.getElementById("expiryItemName").textContent="Item not recognized";
        document.getElementById("expiryItemCode").textContent="Needs Review";
        document.getElementById("expiryItemGTIN").textContent=identifierDisplay;
        document.getElementById("expiryItemCategory").textContent="Pending";
        renderExpiryActiveItem(ExpiryCaptureEngine.currentItem,parsed||{});

        const batch=toSafeString(parsed?.lot||"").trim();
        const serial=toSafeString(parsed?.serial||"").trim();
        const batchEl=document.getElementById("expiryItemBatch");
        const serialEl=document.getElementById("expiryItemSerial");
        if(batchEl) batchEl.textContent=batch||"—";
        if(serialEl) serialEl.textContent=serial||"—";

        const qty=document.getElementById("expiryQuantity");
        if(qty){
            qty.value="1";
            qty.disabled=false;
            qty.readOnly=expiryIsHandheld();
            qty.dataset.intentionalEdit="0";
        }

        const autoExpiry=toSafeString(parsed?.expiry||"");
        const autoMatch=autoExpiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if(autoMatch){
            setExpiryControlValue(document.getElementById("expiryMonth"),String(Number(autoMatch[2])),true);
            setExpiryControlValue(document.getElementById("expiryYear"),String(Number(autoMatch[1])),true);
            setExpiryDateMode("AUTO");
        }else{
            setExpiryDateMode("MANUAL");
        }

        document.getElementById("btnSaveExpiryCapture").disabled=false;
        // The capture retains its exact raw scan; the input is transport only.
        const input=document.getElementById("expiryBarcodeInput");
        if(input) input.value="";
        setExpiryStatus("action","SAVE FOR REVIEW");

        try{ document.activeElement?.blur?.(); }catch(_){}
        setTimeout(()=>{
            focusExpiryScanner();
            window.hhRepairScannerFocus?.("expiry-unknown-resolved");
        },40);

        scheduleExpiryScanAutoClear();
        return true;
    }

    ExpiryCaptureEngine.currentItem = {
        itemCode: record.itemCode || "",
        itemName: record.itemName || record.name || "",
        identifierDisplay:resolvedIdentifier,
        gtin:resolvedIdentifier,
        category: record.category || "",
        identifierSource:record.source||"",
        rawBarcode:String(rawValue??"")
    };

    document.getElementById("expiryItemName").textContent = ExpiryCaptureEngine.currentItem.itemName || "Unnamed item";
    document.getElementById("expiryItemCode").textContent = ExpiryCaptureEngine.currentItem.itemCode || "—";
    document.getElementById("expiryItemGTIN").textContent = resolvedIdentifier;
    document.getElementById("expiryItemCategory").textContent = ExpiryCaptureEngine.currentItem.category || "Uncategorized";
    renderExpiryActiveItem(ExpiryCaptureEngine.currentItem,parsed||{});

    const batch = toSafeString(parsed?.lot || "").trim();
    const serial = toSafeString(parsed?.serial || "").trim();
    const batchEl=document.getElementById("expiryItemBatch");
    const serialEl=document.getElementById("expiryItemSerial");
    if(batchEl) batchEl.textContent=batch || "—";
    if(serialEl) serialEl.textContent=serial || "—";

    const autoExpiry=toSafeString(parsed?.expiry || "");
    const m=autoExpiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if(m){
        const month=document.getElementById("expiryMonth");
        const year=document.getElementById("expiryYear");
        if(month) setExpiryControlValue(month,String(Number(m[2])),true);
        if(year) setExpiryControlValue(year,String(Number(m[1])),true);
        setExpiryDateMode("AUTO");
    }else{
        setExpiryDateMode("MANUAL");
    }

    const qty = document.getElementById("expiryQuantity");
    if(qty){
        qty.value = "1";
        qty.readOnly=expiryIsHandheld();
        qty.dataset.intentionalEdit="0";
    }

    document.getElementById("btnSaveExpiryCapture")?.removeAttribute("disabled");

    setExpiryStatus(
        "success",
        m ? "ITEM FOUND · DATE AUTO READ" : "ITEM FOUND · SELECT EXPIRY"
    );

    const input = document.getElementById("expiryBarcodeInput");
    if(input) input.value = "";

    try{ document.activeElement?.blur?.(); }catch(_){}
    setTimeout(()=>{
        focusExpiryScanner();
        window.hhRepairScannerFocus?.("expiry-known-resolved");
    },40);

    scheduleExpiryScanAutoClear();
    return true;
}

async function saveExpiryCapture(options={}){
    if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || (ExpiryCaptureEngine.saveUncertain && !ExpiryCaptureEngine.operation?.payload)) return;

    cancelExpiryScanAutoClear();

    const item = ExpiryCaptureEngine.currentItem;
    const workerId = ExpiryCaptureEngine.selectedWorkerId;
    const quantity = Number(document.getElementById("expiryQuantity")?.value || 0);
    const month = Number(expiryControlValue(document.getElementById("expiryMonth")) || 0);
    let year = Number(expiryControlValue(document.getElementById("expiryYear")) || 0);

    if(year > 0 && year < 100) year += 2000;

    if(expiryIsHandheld() && !workerId){
        setExpiryStatus("action","SELECT WORKER");
        return;
    }
    if(!item){
        setExpiryStatus("action","SCAN ITEM FIRST");
        focusExpiryScanner();
        return;
    }
    if(!Number.isInteger(quantity) || quantity <= 0){
        if(!expiryIsHandheld()) showExpiryCaptureValidation(["expiryQuantity"],"Enter quantity");
        else setExpiryStatus("action","ENTER QUANTITY");
        document.getElementById("expiryQuantity")?.focus();
        return;
    }
    if(month < 1 || month > 12){
        if(!expiryIsHandheld()){
            const invalidYear=year < 2020 || year > 2200;
            showExpiryCaptureValidation(invalidYear?["expiryMonth","expiryYear"]:["expiryMonth"],invalidYear?"Enter expiry month and year":"Enter expiry month");
        }else setExpiryStatus("action","SELECT MONTH");
        document.getElementById("expiryMonth")?.focus();
        return;
    }
    if(year < 2020 || year > 2200){
        if(!expiryIsHandheld()) showExpiryCaptureValidation(["expiryYear"],"Enter expiry year");
        else setExpiryStatus("action","SELECT YEAR");
        document.getElementById("expiryYear")?.focus();
        return;
    }

    showExpiryCaptureValidation([],"");
    ExpiryCaptureEngine.busy = true;
    const button = document.getElementById("btnSaveExpiryCapture");
    if(button) button.disabled = true;
    renderExpiryEvidence();
    setExpiryStatus("busy","SAVING...");
    const captureControls=["expiryQuantity","expiryBatchInput","expirySerialInput"].map(id=>document.getElementById(id)).filter(Boolean);
    const controlStates=captureControls.map(el=>[el,el.disabled]);
    captureControls.forEach(el=>el.disabled=true);
    const selects=["expiryMonth","expiryYear","expiryWorkerSelect"].map(id=>document.getElementById(id)).filter(Boolean);
    const selectStates=selects.map(el=>[el,el.dataset.disabled==="true"]);
    selects.forEach(el=>setExpirySelectDisabled(el,true));

    let submitted=false,acknowledged=false;
    const saveScope=expiryDraftScope();
    try{
        const pharmacyId = expiryPharmacyId();
        const deviceId = (typeof ensureDeviceId === "function") ? ensureDeviceId() : "";

        if(!pharmacyId || (ExpiryCaptureEngine.draftScope && ExpiryCaptureEngine.draftScope!==expiryDraftScope())) throw new Error("Capture account changed");
        await persistExpiryDraft();
        const facts=ExpiryOperation.scanFacts(item.rawBarcode ?? item.identifierDisplay);
        const gs1={lot:facts['10'] || document.getElementById("expiryBatchInput")?.value.trim() || "",serial:facts['21'] || document.getElementById("expirySerialInput")?.value.trim() || ""};
        if(item.needsReview && (!ExpiryCaptureEngine.reviewPhotos.product || !ExpiryCaptureEngine.reviewPhotos.expiry))throw new Error("PRODUCT AND EXPIRY PHOTOS REQUIRED");
        if(!ExpiryCaptureEngine.operation){
            ExpiryCaptureEngine.operation={id:crypto.randomUUID(),pharmacyId};
            await persistExpiryDraft();
        }
        const payload={kind:item.needsReview?"UNKNOWN":"KNOWN",identifier_display:facts.identifier,
            raw_scan:item.rawBarcode ?? item.identifierDisplay,scan_format:facts.format,
            quantity,expiry_month:month,expiry_year:year,worker_id:workerId||null,
            batch_no:gs1.lot||null,sample_serial:gs1.serial||null,device_id:deviceId,source:expiryCurrentSource(),
            item_code:item.itemCode,item_name:item.itemName,category:item.category||""};
        const saveResult=await ExpiryOperation.save({rpc:authRpc,upload:ExpiryOperation.upload,
            persist:persistExpiryDraft,scope:saveScope,currentScope:expiryDraftScope,
            operation:ExpiryCaptureEngine.operation,payload,photos:ExpiryCaptureEngine.reviewPhotos,uuid:()=>crypto.randomUUID()});
        submitted=true;

        if(expiryIsHandheld()){
            const receipt=await ExpiryOperation.readReceipt(ExpiryCaptureEngine.operation,authRpc);
            if(!receipt)throw new Error("Committed receipt unavailable — capture retained");
            if(saveScope!==expiryDraftScope())throw new Error("Capture account changed");
            rememberExpiryReceipt(receipt);
        }
        acknowledged=true;
        if(saveScope!==expiryDraftScope()) return;
        await persistExpiryDraft("ACKNOWLEDGED");
        if(expiryIsHandheld()) await ExpiryDraftStore.remove(saveScope);

        if(!expiryIsHandheld() && !item.needsReview && typeof window.recordExpirySessionCapture==="function"){
            window.recordExpirySessionCapture({
                item_code:item.itemCode,item_name:item.itemName,identifier_display:item.identifierDisplay || item.gtin,
                category:item.category || "",quantity:quantity,captured_quantity:quantity,
                expiry_month:month,expiry_year:year,batch_no:toSafeString(gs1.lot||""),
                sample_serial:toSafeString(gs1.serial||""),source:expiryCurrentSource(),
                state_id:Array.isArray(saveResult)?saveResult[0]?.state_id:saveResult?.state_id,
                operator_name:(Array.isArray(saveResult)?saveResult[0]?.verified_by_name:saveResult?.verified_by_name) || (ExpiryCaptureEngine.workers.find(w=>w.worker_id===workerId)?.worker_name) || "Desktop"
            });
        }

        const worker = ExpiryCaptureEngine.workers.find(w => w.worker_id === workerId);
        const saved = document.getElementById("expiryLastSaved");
        if(saved && !expiryIsHandheld()){
            saved.innerHTML =
                `<strong>${expiryEscapeHtml(item.itemName)}</strong>` +
                `<span>Qty ${quantity} • ${expiryEscapeHtml(expiryMonthName(month))} ${year} • ${expiryEscapeHtml(worker?.worker_name || "")}</span>`;
        }

        ExpiryCaptureEngine.saveUncertain=false;
        resetExpiryCaptureForm({focus:true});
        setExpiryStatus("success",expiryIsHandheld()?"Saved · Ready to Scan":options.auto?"✓ AUTO SAVED — NEXT ITEM":"✓ SAVED — NEXT ITEM");
        scheduleExpirySavedAutoClear();
        // Commit has succeeded. Projection refresh must never become a write failure.
        try{
        refreshExpiryCapturedCount();
        const savedRows=await refreshExpiryCurrentState();
        if(Array.isArray(savedRows)){
            const match=savedRows.find(row=>String(row.item_code||"")===String(item.itemCode||"") && Number(row.expiry_month)===month && Number(row.expiry_year)===year && String(row.batch_no||"")===String(toSafeString(gs1.lot||"")));
            if(match){
                ExpiryCaptureEngine.highlightedStateId=match.state_id;
                renderExpiryCurrentState(savedRows);
                const savedRow=document.querySelector('[data-expiry-state-id="'+String(match.state_id).replace(/"/g,'\\\"')+'"]');
                if(savedRow){
                    savedRow.classList.remove("expiryRowSavedStrong");
                    void savedRow.offsetWidth;
                    savedRow.classList.add("expiryRowSavedStrong");
                    setTimeout(()=>savedRow.classList.remove("expiryRowSavedStrong"),5000);
                }
            }
        }

        }catch(error){
            console.warn("Expiry saved; display refresh failed",error);
        }

    }catch(error){
        console.error("Unable to save expiry capture",error);
        if(submitted || error.uncertain || ExpiryCaptureEngine.operation?.payload){
            ExpiryCaptureEngine.saveUncertain=true;
            captureControls.forEach(el=>el.disabled=true);
            selects.forEach(el=>setExpirySelectDisabled(el,true));
            try{await persistExpiryDraft(acknowledged?"ACKNOWLEDGED":"UNCERTAIN");}catch(_){}
            setExpiryStatus("error",acknowledged?"SAVED — LOCAL CLEANUP FAILED; DO NOT RESEND":"SAVE RESULT UNKNOWN — CHECK / RETRY SAME OPERATION; DRAFT RETAINED");
            if(button){button.disabled=!ExpiryCaptureEngine.operation;button.textContent=ExpiryCaptureEngine.operation?"CHECK / RETRY SAVE":"SAVE & NEXT";}
        }else{
            setExpiryStatus("error",String(error.message||"SAVE BLOCKED")+" — DRAFT RETAINED");
            if(button)button.disabled=false;
        }
    }finally{
        ExpiryCaptureEngine.busy = false;
        renderExpiryEvidence();
        if(!ExpiryCaptureEngine.saveUncertain){
            controlStates.forEach(([el,disabled])=>el.disabled=ExpiryCaptureEngine.currentItem?disabled:false);
            selectStates.forEach(([el,disabled])=>setExpirySelectDisabled(el,ExpiryCaptureEngine.currentItem?disabled:false));
        }
    }
}


function expiryIsHandheld(){
    try{
        return typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice();
    }catch(_){
        return false;
    }
}

function expiryCurrentSource(){
    return expiryIsHandheld() ? "HANDHELD" : "PC";
}

async function loadExpiryCurrentState(search=""){
    const pharmacyId=expiryPharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return [];
    const rows=await authRpc("list_pharmacy_expiry_current_state_v1",{
        p_pharmacy_id:pharmacyId,
        p_include_cleared:false,
        p_search:toSafeString(search)||null
    });
    return Array.isArray(rows)?rows:[];
}

function expiryFormatVerifiedAt(value){
    const d=new Date(value||"");
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

function expiryCurrentMonthIndex(){
    const now=new Date();
    return (now.getFullYear()*12)+now.getMonth();
}

function expiryRowMonthIndex(row){
    const year=Number(row?.expiry_year);
    const month=Number(row?.expiry_month);
    if(!Number.isInteger(year) || !Number.isInteger(month) || month<1 || month>12) return null;
    return (year*12)+(month-1);
}

function renderExpiryKpis(rows){
    const safeRows=Array.isArray(rows)?rows:[];
    const currentMonth=expiryCurrentMonthIndex();
    let totalUnits=0;
    let expired=0;
    let upcoming=0;

    safeRows.forEach(row=>{
        const qty=Number(row?.verified_quantity);
        if(Number.isFinite(qty) && qty>0) totalUnits+=qty;
        const expiryIndex=expiryRowMonthIndex(row);
        if(expiryIndex===null) return;
        if(expiryIndex<currentMonth) expired+=1;
        else upcoming+=1;
    });

    const values={
        expiryKpiActiveItems:safeRows.length,
        expiryKpiTotalUnits:totalUnits,
        expiryKpiExpired:expired,
        expiryKpiUpcoming:upcoming
    };
    Object.entries(values).forEach(([id,value])=>{
        const el=document.getElementById(id);
        if(el) el.textContent=String(value);
    });
}

function expiryPopulateCategoryFilter(rows){ return rows||[]; }
function expiryFilteredCurrentRows(rows){ return rows||[]; }
// Desktop workspace rendering is owned by js/expiry-desktop-v2.js.
async function saveExpiryCurrentCorrection(row,values){
    await authRpc("correct_pharmacy_expiry_current_state_v1",{
        p_pharmacy_id:expiryPharmacyId(),p_state_id:row.state_id,p_quantity:values.quantity,
        p_expiry_month:values.month,p_expiry_year:values.year,p_batch_no:values.batch||null,
        p_worker_id:ExpiryCaptureEngine.selectedWorkerId||null,p_device_id:(typeof ensureDeviceId==="function"?ensureDeviceId():"")
    });
}
async function clearExpiryCurrentState(row){
    await authRpc("save_pharmacy_expiry_verified_state_v2",{
        p_pharmacy_id:expiryPharmacyId(),p_item_code:row.item_code,p_item_name:row.item_name,p_identifier_display:row.identifier_display,
        p_category:row.category||"",p_quantity:0,p_expiry_month:Number(row.expiry_month),p_expiry_year:Number(row.expiry_year),
        p_worker_id:ExpiryCaptureEngine.selectedWorkerId||null,p_batch_no:row.batch_no||"",p_sample_serial:row.sample_serial||"",
        p_device_id:(typeof ensureDeviceId==="function"?ensureDeviceId():""),p_source:"PC",p_event_type:"CLEARED"
    });
    if(typeof window.markExpirySessionStateDeleted==="function")window.markExpirySessionStateDeleted(row.state_id);
}
// Desktop workspace actions are owned by js/expiry-desktop-v2.js.
async function refreshExpiryCurrentState(){
    if(expiryIsHandheld()) return [];
    try{
        const search=document.getElementById("expiryCurrentSearch")?.value||"";
        const rows=await loadExpiryCurrentState(search);
        renderExpiryCurrentState(rows);
        return rows;
    }catch(error){
        console.error("Unable to load current expiry state",error);
        return [];
    }
}

function expiryCapturedAt(row){
    const raw=row?.captured_at || row?.created_at || row?.date_time || "";
    const time=Date.parse(raw);
    return Number.isFinite(time) ? time : 0;
}

function expiryIsToday(row){
    const time=expiryCapturedAt(row);
    if(!time) return false;

    const d=new Date(time);
    const now=new Date();

    return (
        d.getFullYear()===now.getFullYear() &&
        d.getMonth()===now.getMonth() &&
        d.getDate()===now.getDate()
    );
}

function filterExpiryCapturedRows(rows,options={}){
    const source=String(options.source||"ALL").toUpperCase();
    const range=String(options.range||"TODAY").toUpperCase();
    const now=Date.now();

    return (rows||[]).filter(row=>{
        const rowSource=String(row?.source||"PC").toUpperCase();

        if(source!=="ALL" && rowSource!==source){
            return false;
        }

        if(range==="TODAY"){
            return expiryIsToday(row);
        }

        if(range==="7D"){
            const time=expiryCapturedAt(row);
            return !!time && (now-time)<=7*24*60*60*1000;
        }

        return true;
    });
}

function renderExpiryWorkerCompactState(){
    const bar=document.querySelector(".expiryWorkerBar");
    const select=document.getElementById("expiryWorkerSelect");
    if(!bar || !select) return;
    bar.dataset.selected=ExpiryCaptureEngine.selectedWorkerId ? "1" : "0";
}

async function loadExpiryCapturedRecords(){
    const pharmacyId = expiryPharmacyId();
    if(!pharmacyId || typeof authRpc !== "function") return [];

    const rows = await authRpc("list_pharmacy_expiry_captures",{
        p_pharmacy_id:pharmacyId,
        p_expiry_year:null,
        p_expiry_months:null,
        p_categories:null,
        p_worker_ids:null,
        p_search:null
    }) || [];

    /* Captured review always shows the most recently saved item first. */
    return [...rows].sort((a,b)=>{
        const aTime = Date.parse(a?.captured_at || "") || 0;
        const bTime = Date.parse(b?.captured_at || "") || 0;
        return bTime - aTime;
    });
}

async function refreshExpiryCapturedCount(){
    if(expiryIsHandheld())return []; // Handheld has no counter; its panel reads committed session receipts.
    try{
        const rows = await loadExpiryCapturedRecords();
        const btn = document.getElementById("btnExpiryCaptured");
        const count = document.getElementById("expiryCapturedCount");

        const operational=filterExpiryCapturedRows(rows,{
            source:expiryCurrentSource(),
            range:"TODAY"
        });

        if(count) count.textContent=String(operational.length);

        if(btn){
            btn.dataset.loaded="1";

            const label="RECENT";

            /* Avoid mutating anonymous text nodes around the counter. That
               produced duplicate visible CAPTURED labels on some builds. */
            if(!expiryIsHandheld()) btn.innerHTML=`
                <span class="expiryCapturedButtonLabel">${label}</span>
                <strong id="expiryCapturedCount">${operational.length}</strong>
            `;

            btn.setAttribute(
                "aria-label",
                expiryIsHandheld()?"Recent scans":"Recent expiry captures"
            );
        }

        return rows;
    }catch(error){
        console.warn("Unable to refresh expiry captured count",error);
        return [];
    }
}

async function deleteAllExpiryHistoryProtected(){
    const pharmacyId=expiryPharmacyId();

    if(!pharmacyId){
        throw new Error("Pharmacy context unavailable");
    }

    /*
       Protected destructive action.
       Scope: Expiry Capture History for CURRENT pharmacy only.
       It must not touch Receiving, Orders, Global GTIN, Returns, or other
       historical domains.
    */
    if(typeof authRpc!=="function"){
        throw new Error("Expiry History API unavailable");
    }

    const result=await authRpc(
        "delete_all_pharmacy_expiry_captures",
        {
            p_pharmacy_id:pharmacyId
        }
    );

    return result;
}


async function openExpiryCapturedPanel(){
    if(expiryIsHandheld())return openExpiryRecentScans();
    document.getElementById("expiryCapturedOverlay")?.remove();

    let allRows=[];

    try{
        allRows=await loadExpiryCapturedRecords();
    }catch(error){
        setExpiryStatus("error","UNABLE TO LOAD CAPTURED");
        return;
    }

    const overlay=document.createElement("div");
    overlay.id="expiryCapturedOverlay";
    overlay.className="expiryCapturedOverlay";

    const state={
        source:expiryCurrentSource(),
        range:"TODAY"
    };

    const sourceLabel=source=>{
        if(source==="HANDHELD") return "Handheld";
        if(source==="PC") return "PC";
        return "All Devices";
    };

    const rangeLabel=range=>{
        if(range==="TODAY") return "Today";
        if(range==="7D") return "Last 7 Days";
        return "All History";
    };

    const render=()=>{
        const rows=filterExpiryCapturedRows(allRows,state).slice(0,50);

        overlay.innerHTML=`
          <section class="expiryCapturedPanel">
            <header>
              <div>
                <span>NEAR EXPIRY</span>
                <strong>Recent Expiry</strong>
                <small>${expiryEscapeHtml(sourceLabel(state.source))} · ${expiryEscapeHtml(rangeLabel(state.range))}</small>
              </div>
              <button type="button" data-close>✕</button>
            </header>

            <div class="expiryHistorySourceTabs">
              <button type="button" data-source="HANDHELD" class="${state.source==="HANDHELD"?"active":""}">HANDHELD</button>
              <button type="button" data-source="PC" class="${state.source==="PC"?"active":""}">PC</button>
              <button type="button" data-source="ALL" class="${state.source==="ALL"?"active":""}">ALL DEVICES</button>
            </div>

            <div class="expiryHistoryRangeTabs">
              <button type="button" data-range="TODAY" class="${state.range==="TODAY"?"active":""}">TODAY</button>
              <button type="button" data-range="7D" class="${state.range==="7D"?"active":""}">7 DAYS</button>
              <button type="button" data-range="ALL" class="${state.range==="ALL"?"active":""}">ALL HISTORY</button>
            </div>

            <div class="expiryCapturedList">
              ${rows.length ? rows.map(row=>`
                <div class="expiryCapturedRow" data-capture="${expiryEscapeHtml(row.capture_id)}">
                  <div class="expiryCapturedMain">
                    <strong>${expiryEscapeHtml(row.item_name || "Item")}</strong>
                    <span>Qty ${Number(row.quantity||0)} • ${expiryEscapeHtml(expiryMonthName(row.expiry_month))} ${Number(row.expiry_year||0)}</span>
                    <small>
                        ${expiryEscapeHtml(row.captured_by_name || "")}
                        ${row.category ? " • "+expiryEscapeHtml(row.category) : ""}
                        • ${expiryEscapeHtml(sourceLabel(String(row.source||"PC").toUpperCase()))}
                    </small>
                  </div>
                  ${expiryIsHandheld()
                      ? `<span class="expiryHistoryViewOnly">View only</span>`
                      : `<button class="expiryDeleteRecord" type="button" data-delete="${expiryEscapeHtml(row.capture_id)}">Delete</button>`}
                </div>`).join("") :
                `<div class="expiryCapturedEmpty">No expiry captures in this view.</div>`}
            </div>

            ${filterExpiryCapturedRows(allRows,state).length>50
                ? `<div class="expiryHistoryLimitNote">Showing latest 50. Use Expiry Reports for full historical review.</div>`
                : ""}

            ${!expiryIsHandheld() && state.source==="ALL" && state.range==="ALL"
                ? `<div class="expiryHistoryDangerZone">
                     <div>
                       <strong>Expiry History</strong>
                       <span>Deletes all captured expiry records for this pharmacy only.</span>
                     </div>
                     <button type="button" id="btnDeleteAllExpiryHistory">DELETE ALL EXPIRY HISTORY</button>
                   </div>`
                : ""}

            <button class="expiryCapturedDone" type="button" data-close>Done</button>
          </section>`;

        overlay.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{
            overlay.remove();
            if(expiryIsHandheld()){
                setTimeout(()=>{
                    focusExpiryScanner();
                    window.hhRepairScannerFocus?.("expiry-history-close");
                },30);
            }
        });

        overlay.querySelectorAll("[data-source]").forEach(button=>{
            button.onclick=()=>{
                state.source=button.dataset.source||"ALL";
                render();
            };
        });

        overlay.querySelectorAll("[data-range]").forEach(button=>{
            button.onclick=()=>{
                state.range=button.dataset.range||"TODAY";
                render();
            };
        });

        const deleteAllButton=overlay.querySelector("#btnDeleteAllExpiryHistory");

        if(deleteAllButton){
            deleteAllButton.onclick=async()=>{
                if(expiryIsHandheld()){
                    return;
                }
                const stage=Number(deleteAllButton.dataset.stage||0);

                if(stage===0){
                    deleteAllButton.dataset.stage="1";
                    deleteAllButton.textContent="CONFIRM DELETE ALL";
                    deleteAllButton.classList.add("confirming");

                    setTimeout(()=>{
                        if(
                            deleteAllButton.isConnected &&
                            Number(deleteAllButton.dataset.stage||0)===1
                        ){
                            deleteAllButton.dataset.stage="0";
                            deleteAllButton.textContent="DELETE ALL EXPIRY HISTORY";
                            deleteAllButton.classList.remove("confirming");
                        }
                    },5000);

                    return;
                }

                if(stage===1){
                    deleteAllButton.dataset.stage="2";
                    deleteAllButton.textContent="FINAL CONFIRM — DELETE";
                    deleteAllButton.classList.add("finalConfirm");

                    setTimeout(()=>{
                        if(
                            deleteAllButton.isConnected &&
                            Number(deleteAllButton.dataset.stage||0)===2
                        ){
                            deleteAllButton.dataset.stage="0";
                            deleteAllButton.textContent="DELETE ALL EXPIRY HISTORY";
                            deleteAllButton.classList.remove("confirming","finalConfirm");
                        }
                    },5000);

                    return;
                }

                deleteAllButton.disabled=true;

                try{
                    await deleteAllExpiryHistoryProtected();

                    allRows=[];

                    await refreshExpiryCapturedCount();
                    render();

                    if(typeof showToast==="function"){
                        showToast("Expiry History deleted successfully","success");
                    }
                }catch(error){
                    deleteAllButton.disabled=false;
                    deleteAllButton.dataset.stage="0";
                    deleteAllButton.textContent="DELETE ALL EXPIRY HISTORY";
                    deleteAllButton.classList.remove("confirming","finalConfirm");

                    if(typeof showToast==="function"){
                        showToast(
                            error?.message || "Unable to delete Expiry History",
                            "error"
                        );
                    }
                }
            };
        }

        overlay.querySelectorAll("[data-delete]").forEach(button=>{
            button.onclick=async()=>{
                if(expiryIsHandheld()){
                    return;
                }
                const id=button.getAttribute("data-delete");

                if(button.dataset.confirm!=="1"){
                    button.dataset.confirm="1";
                    button.textContent="Confirm";

                    setTimeout(()=>{
                        if(button.isConnected && button.dataset.confirm==="1"){
                            button.dataset.confirm="";
                            button.textContent="Delete";
                        }
                    },3000);

                    return;
                }

                button.disabled=true;

                try{
                    await authRpc("delete_pharmacy_expiry_capture",{
                        p_pharmacy_id:expiryPharmacyId(),
                        p_capture_id:id
                    });

                    allRows=allRows.filter(row=>String(row.capture_id)!==String(id));

                    await refreshExpiryCapturedCount();
                    render();

                }catch(error){
                    button.disabled=false;
                    button.dataset.confirm="";
                    button.textContent="Delete";

                    if(typeof showToast==="function"){
                        showToast(error?.message || "Unable to delete expiry record","error");
                    }
                }
            };
        });
    };

    document.body.appendChild(overlay);
    render();
}

function bindExpiryCaptureUI(){
    populateExpiryDateDropdowns();

    const modesButton = document.getElementById("btnExpiryBackToModes");
    if(modesButton && modesButton.dataset.bound !== "1"){
        modesButton.dataset.bound = "1";
        modesButton.addEventListener("click",()=>{
            if(expiryIsHandheld()){
                leaveExpiryHandheld();
            }else if(typeof navigateTo === "function"){
                navigateTo("dashboard");
            }
        });
    }

    if(!expiryIsHandheld()){
        ["expiryMonth","expiryYear","expiryQuantity"].forEach(id=>{
            const field=document.getElementById(id);
            if(field && field.dataset.validationBound!=="1"){
                field.dataset.validationBound="1";
                field.addEventListener("input",clearCorrectedExpiryValidation);
                field.addEventListener("change",clearCorrectedExpiryValidation);
            }
        });
        ["expiryBatchInput","expirySerialInput","expiryQuantity"].forEach(id=>{
            const field=document.getElementById(id);
            if(field && field.dataset.reviewBound!=="1"){
                field.dataset.reviewBound="1";
                field.addEventListener("input",markExpiryFormDirty);
            }
        });
    }

    [["btnExpiryQtyMinus",-1],["btnExpiryQtyPlus",1]].forEach(([id,delta])=>{
        const button=document.getElementById(id);
        if(button && button.dataset.bound!=="1"){
            button.dataset.bound="1";
            button.addEventListener("click",()=>{
                if(!ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy) return;
                const quantity=document.getElementById("expiryQuantity");
                quantity.value=String(Math.max(1,(Number(quantity.value)||1)+delta));
                markExpiryFormDirty();
                clearCorrectedExpiryValidation();
            });
        }
    });

    const qtyInput = document.getElementById("expiryQuantity");
    if(qtyInput && qtyInput.dataset.intentBound!=="1"){
        qtyInput.dataset.intentBound="1";

        const unlockQuantity=()=>{
            if(!ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.busy || ExpiryCaptureEngine.saveUncertain) return;

            markExpiryFormDirty();
            qtyInput.readOnly=false;
            qtyInput.dataset.intentionalEdit="1";

            setTimeout(()=>{
                try{
                    qtyInput.focus();
                    qtyInput.select();
                }catch(_){}
            },0);
        };

        qtyInput.addEventListener("pointerdown",unlockQuantity);
        qtyInput.addEventListener("click",unlockQuantity);
    }

    if(qtyInput && qtyInput.dataset.enterBound !== "1"){
        qtyInput.dataset.enterBound="1";
        qtyInput.addEventListener("keydown",event=>{
            if(event.key==="Enter"){
                event.preventDefault();

                qtyInput.blur();
                qtyInput.readOnly=expiryIsHandheld();
                qtyInput.dataset.intentionalEdit="0";

                try{ document.activeElement?.blur?.(); }catch(_){}

                if(ExpiryCaptureEngine.dateSource!=="AUTO"){
                    setTimeout(()=>document.getElementById("expiryMonth")?.focus(),30);
                }
            }
        });
    }

    const monthSelect=document.getElementById("expiryMonth");
    if(monthSelect && monthSelect.dataset.bound !== "1"){
        monthSelect.dataset.bound="1";
        monthSelect.addEventListener("change",()=>{
            markExpiryFormDirty();
            const label=document.getElementById("expiryMonthName");
            if(label) label.textContent=expiryMonthName(expiryControlValue(monthSelect));
        });
    }

    const capturedButton=document.getElementById("btnExpiryCaptured");
    if(capturedButton && capturedButton.dataset.bound !== "1"){
        capturedButton.dataset.bound="1";
        capturedButton.addEventListener("click",openExpiryCapturedPanel);
    }

    const barcode = document.getElementById("expiryBarcodeInput");
    if(barcode && barcode.dataset.bound !== "1"){
        barcode.dataset.bound = "1";
        barcode.setAttribute("inputmode",expiryIsHandheld()?"none":"text");
        if(expiryIsHandheld()) barcode.placeholder="Scan Barcode";
        barcode.setAttribute("autocomplete","off");
        barcode.setAttribute("autocapitalize","off");
        barcode.setAttribute("spellcheck","false");

        const commitHardwareScan = () => {
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            ExpiryCaptureEngine.scanTimer=null;
            closeExpirySearchResults(true);
            const value=String(barcode.value||"");
            if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain || (expiryIsHandheld() && (!ExpiryCaptureEngine.draftReady || ExpiryCaptureEngine.currentItem))){
                setExpiryStatus("action","FINISH CURRENT CAPTURE — SCAN AGAIN AFTER SAVE");return;
            }
            if(!value.trim() || value===ExpiryCaptureEngine.lastResolvedRaw) return;
            closeExpirySearchResults();
            ExpiryCaptureEngine.lastResolvedRaw=value;
            barcode.value="";
            Promise.resolve(resolveExpiryScannedValue(value)).finally(()=>setTimeout(()=>{ExpiryCaptureEngine.lastResolvedRaw="";},250));
        };

        barcode.addEventListener("keydown",event=>{
            if(event.key==="Escape"){closeExpirySearchResults();return;}
            if(event.key==="Enter" || event.key==="Tab"){event.preventDefault();commitHardwareScan();}
        });

        const looksLikeExpiryIdentifier = value => {
            const raw=String(value||"").trim();
            if(!raw) return false;
            if(/[()\u001d]/.test(raw)) return true;
            return /^\d{8,18}$/.test(raw);
        };

        /* Desktop paste is intentionally NOT committed on the paste event.
           Paste + Enter follows the exact same authoritative scan path as a
           hardware Enter suffix. This prevents the paste timer and Enter from
           racing each other and leaving a stale "Item not found" search panel. */
        barcode.addEventListener("paste",()=>{
            if(expiryIsHandheld()) return;
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            closeExpirySearchResults(true);
        });

        barcode.addEventListener("input",()=>{
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            const value=String(barcode.value||"");
            if(expiryIsHandheld()){
                ExpiryCaptureEngine.scanTimer=setTimeout(commitHardwareScan,90);
                return;
            }
            if(value.length<2){closeExpirySearchResults();return;}
            if(looksLikeExpiryIdentifier(value)){
                closeExpirySearchResults();
                ExpiryCaptureEngine.scanTimer=setTimeout(commitHardwareScan,120);
                return;
            }
            const generation=++ExpiryCaptureEngine.desktopSearchGeneration;
            ExpiryCaptureEngine.desktopSearchTimer=setTimeout(async()=>{
                try{
                    const rows=await expirySearchGlobalItems(value);
                    if(generation!==ExpiryCaptureEngine.desktopSearchGeneration) return;
                    if(String(barcode.value||"").trim()!==value) return;
                    renderExpirySearchResults(rows);
                }
                catch(error){console.warn("Expiry manual search failed",error);if(generation===ExpiryCaptureEngine.desktopSearchGeneration)closeExpirySearchResults();}
            },220);
        });

        barcode.addEventListener("change",()=>{if(expiryIsHandheld()) commitHardwareScan();});
    }

    const worker = document.getElementById("expiryWorkerSelect");
    if(worker && worker.dataset.workerBound !== "1"){
        worker.dataset.workerBound = "1";
        worker.addEventListener("change", () => {
            selectExpiryWorker(expiryControlValue(worker));

            /* Desktop operator is optional. Always return focus to Scan after
               changing or clearing it so hardware input never remains trapped
               in the operator select. Handheld keeps its required-worker guard. */
            if(!expiryIsHandheld() || expiryControlValue(worker)){
                setTimeout(()=>{
                    focusExpiryScanner();
                    window.hhRepairScannerFocus?.("expiry-worker-change");
                },40);
            }
        });
    }

    ["expiryMonth","expiryYear"].forEach(id => {
        const el = document.getElementById(id);
        if(!el || el.dataset.bound === "1") return;
        el.dataset.bound = "1";

        el.addEventListener("input", () => {
            markExpiryFormDirty();
            if(id === "expiryMonth"){
                const m = Number(el.value || 0);
                const name = document.getElementById("expiryMonthName");
                if(name) name.textContent = m >= 1 && m <= 12 ? expiryMonthName(m) : "";
            }
        });

        el.addEventListener("pointerdown", markExpiryFormDirty);

        el.addEventListener("keydown", event => {
            if(event.key !== "Enter") return;
            event.preventDefault();

            if(id === "expiryQuantity"){
                document.getElementById("expiryMonth")?.focus();
            }else if(id === "expiryMonth"){
                document.getElementById("expiryYear")?.focus();
            }else{
                saveExpiryCapture();
            }
        });
    });

    const clearTopButton=document.getElementById("btnClearExpiryScreenTop");
    if(clearTopButton && clearTopButton.dataset.bound!=="1"){
        clearTopButton.dataset.bound="1";
        clearTopButton.addEventListener("click",()=>clearExpiryScreen({clearSaved:true}));
    }

    const clearButton=document.getElementById("btnClearExpiryActive");
    if(clearButton && clearButton.dataset.bound!=="1"){
        clearButton.dataset.bound="1";
        clearButton.addEventListener("click",()=>expiryIsHandheld()?clearExpiryHandheldCapture():clearExpiryScreen({clearSaved:true}));
    }

    document.querySelectorAll("[data-expiry-view]").forEach(button=>{
        if(button.dataset.bound==="1") return;
        button.dataset.bound="1";
        button.addEventListener("click",()=>{
            ExpiryCaptureEngine.desktopView=button.dataset.expiryView==="CURRENT"?"CURRENT":"RECENT";
            document.querySelectorAll("[data-expiry-view]").forEach(b=>b.classList.toggle("active",b===button));
            const title=document.getElementById("expiryWorkspaceTitle");
            if(title) title.textContent=ExpiryCaptureEngine.desktopView==="RECENT"?"Recent Captures":"Current Expiry";
            renderExpiryCurrentState(ExpiryCaptureEngine.currentRows);
        });
    });

    const currentSearch=document.getElementById("expiryCurrentSearch");
    if(currentSearch && currentSearch.dataset.bound!=="1"){
        currentSearch.dataset.bound="1";
        let searchTimer=null;
        currentSearch.addEventListener("input",()=>{
            clearTimeout(searchTimer);
            searchTimer=setTimeout(()=>refreshExpiryCurrentState(),180);
        });
    }

    ["expiryQuantity","expiryMonth","expiryYear","expiryBatchInput","expirySerialInput","expiryWorkerSelect"].forEach(id=>{
        const field=document.getElementById(id);
        if(!field || field.dataset.draftBound==="1")return;
        field.dataset.draftBound="1";
        ["input","change"].forEach(type=>field.addEventListener(type,()=>{
            if(!ExpiryCaptureEngine.busy && !ExpiryCaptureEngine.saveUncertain) markExpiryFormDirty();
        }));
    });

    const save = document.getElementById("btnSaveExpiryCapture");
    if(save && save.dataset.bound !== "1"){
        save.dataset.bound = "1";
        save.addEventListener("click", saveExpiryCapture);
    }

}

async function activateExpiryCapture(){
    bindExpiryCaptureUI();
    bindExpiryEvidence();
    populateExpiryDateDropdowns();
    if(expiryIsHandheld()){
        if(ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving)return;
        if(ExpiryCaptureEngine.currentItem && ExpiryCaptureEngine.draftScope===expiryDraftScope()){
            setExpiryStatus("action",ExpiryCaptureEngine.saveUncertain?"SAVE RESULT REQUIRES RECONCILIATION — DO NOT RESEND":"UNSAVED CAPTURE RETAINED");return;
        }
        ExpiryCaptureEngine.draftReady=false;
        ExpiryCaptureEngine.saveUncertain=false;
        resetExpiryCaptureForm({focus:false});
        try{await loadExpiryWorkers();}catch(error){setExpiryStatus("error","Operator unavailable — draft retained");return;}
        renderExpiryWorkerCompactState();
        try{
            if(!expiryDraftScope())throw new Error("Authenticated scope required");
            const pending=await prepareExpiryDraftRecovery();
            if(pending)return;
            ExpiryCaptureEngine.draftReady=true;
            await renderExpiryRecoverableDrafts();
        }catch(error){setExpiryStatus("error","Draft check failed — do not scan");return;}
        if(ExpiryCaptureEngine.workers.length===0){setExpiryStatus("action","ADD WORKER IN SETTINGS");return;}
        if(!ExpiryCaptureEngine.selectedWorkerId){setExpiryStatus("action","SELECT WORKER");return;}
    }else{
        refreshExpiryCapturedCount();
        await loadExpiryWorkers();
        await refreshExpiryCurrentState();
        renderExpiryWorkerCompactState();
        clearExpirySavedConfirmation();
        resetExpiryCaptureForm({focus:false});
    }
    setExpiryStatus("ready","READY TO SCAN");
    try{window.scrollTo(0,0);}catch(_){}
    focusExpiryScanner();
}

/* ---------------- Worker management in Settings ---------------- */

function ensureExpiryWorkerSettingsCard(){
    const settings = document.getElementById("page-settings");
    if(!settings || document.getElementById("expiryWorkersSettingsCard")) return;

    const card = document.createElement("section");
    card.id = "expiryWorkersSettingsCard";
    card.className = "contentCard expiryWorkersSettingsCard settingsFutureFeature";
    card.hidden = true;
    card.setAttribute("aria-hidden","true");
    card.innerHTML = `
        <div class="cardHeader">
            <div>
                <span class="sectionEyebrow">NEAR EXPIRY</span>
                <h2>Expiry Workers</h2>
                <p class="settingsDescription">Add worker names once. The selected worker is remembered on each device.</p>
            </div>
        </div>
        <div class="expiryWorkerAddRow">
            <input id="expiryWorkerNameInput" type="text" maxlength="60" placeholder="Worker name">
            <button id="btnAddExpiryWorker" class="primaryButton" type="button">Add Worker</button>
        </div>
        <div id="expiryWorkersSettingsList" class="expiryWorkersSettingsList"></div>
    `;

    settings.appendChild(card);

    document.getElementById("btnAddExpiryWorker")?.addEventListener("click", saveExpiryWorkerFromSettings);
    document.getElementById("expiryWorkerNameInput")?.addEventListener("keydown", event => {
        if(event.key === "Enter"){
            event.preventDefault();
            saveExpiryWorkerFromSettings();
        }
    });
}

async function saveExpiryWorkerFromSettings(){
    const input = document.getElementById("expiryWorkerNameInput");
    const name = String(input?.value || "").trim();
    if(name.length < 2){
        if(typeof showToast === "function") showToast("Enter worker name","warning");
        input?.focus();
        return;
    }

    try{
        await authRpc("save_pharmacy_expiry_worker", {
            p_pharmacy_id: expiryPharmacyId(),
            p_worker_name: name
        });
        input.value = "";
        await loadExpiryWorkers();
        if(typeof showToast === "function") showToast("Worker saved","success");
    }catch(error){
        const message = String(error?.message || "");
        const friendly = /jwt|token|sign-in expired/i.test(message)
            ? "Your sign-in expired. Please sign in again."
            : (message || "Unable to save worker");
        if(typeof showToast === "function") showToast(friendly,"error");
    }
}

function renderExpiryWorkerSettingsList(){
    const list = document.getElementById("expiryWorkersSettingsList");
    if(!list) return;

    if(ExpiryCaptureEngine.workers.length === 0){
        list.innerHTML = `<div class="registrationEmpty">No workers added yet.</div>`;
        return;
    }

    list.innerHTML = ExpiryCaptureEngine.workers.map(w => `
        <div class="expiryWorkerRow">
            <strong>${expiryEscapeHtml(w.worker_name)}</strong>
            <button type="button" class="secondaryButton" data-expiry-worker-remove="${expiryEscapeHtml(w.worker_id)}">Disable</button>
        </div>
    `).join("");

    list.querySelectorAll("[data-expiry-worker-remove]").forEach(button => {
        button.addEventListener("click", async () => {
            const id = button.getAttribute("data-expiry-worker-remove");
            try{
                await authRpc("deactivate_pharmacy_expiry_worker", {
                    p_pharmacy_id: expiryPharmacyId(),
                    p_worker_id: id
                });
                if(ExpiryCaptureEngine.selectedWorkerId === id){
                    selectExpiryWorker("");
                }
                await loadExpiryWorkers();
            }catch(error){
                if(typeof showToast === "function") showToast(error?.message || "Unable to disable worker","error");
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    ensureExpiryWorkerSettingsCard();
});

if(typeof AppEvents !== "undefined" && AppEvents?.on){
    AppEvents.on("auth:context", async () => {
        ensureExpiryWorkerSettingsCard();
        try{ await loadExpiryWorkers(); }catch(_){}
    });
}

if(typeof AppEvents !== "undefined" && AppEvents?.on){
    AppEvents.on("route:changed",payload=>{
        if(payload?.routeName==="expiry"){
            if(!(typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice())){
                document.body.classList.remove("zebraExpiryActive","zebraMode");
            }
            try{ window.scrollTo(0,0); }catch(_){}
            setTimeout(()=>activateExpiryCapture(),20);
        }
    });
}


/* Phase 2C.10.5.5 non-regression: Expiry remains GS1-smart.
   GS1/2D extracted lot/expiry stays automatic; GTIN-only requires manual date.
   Review photos are temporary identification evidence and may be deleted after
   successful resolution by the Needs Review media lifecycle. */
