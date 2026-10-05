
/* =========================================================
   PHARMFLOW — PHASE 2C.9.1
   HANDHELD NEAR EXPIRY + CAPTURED BY
========================================================= */

const ExpiryCaptureEngine = {
    workers: [],
    selectedWorkerId: "",
    currentItem: null,
    busy: false,
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
    editingStateId: "",
    desktopView: "RECENT",
    storageKey(){
        const pharmacy = (typeof AuthState !== "undefined" && AuthState.context?.pharmacy_id) || "none";
        return `pharmflow_expiry_worker_${pharmacy}`;
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

function populateExpiryDateDropdowns(){
    const month = document.getElementById("expiryMonth");
    const year = document.getElementById("expiryYear");
    if(month && month.tagName === "SELECT"){
        const selected = month.value;
        month.innerHTML = `<option value="">Month</option>` +
            Array.from({length:12},(_,i)=>{
                const n=i+1;
                return `<option value="${n}">${n} · ${expiryMonthShortName(n)}</option>`;
            }).join("");
        if(selected) month.value=selected;
    }
    if(year && year.tagName === "SELECT"){
        const selected = year.value;
        const current = new Date().getFullYear();
        year.innerHTML = `<option value="">Year</option>` +
            Array.from({length:11},(_,i)=>current+i)
                .map(y=>`<option value="${y}">${y}</option>`).join("");
        if(selected) year.value=selected;
    }
}

async function loadExpiryWorkers(){
    const pharmacyId = expiryPharmacyId();
    if(!pharmacyId || typeof authRpc !== "function") return [];

    const rows = await authRpc("list_pharmacy_expiry_workers", {
        p_pharmacy_id: pharmacyId
    });

    ExpiryCaptureEngine.workers = Array.isArray(rows) ? rows : [];

    let saved = "";
    try{ saved = localStorage.getItem(ExpiryCaptureEngine.storageKey()) || ""; }catch(_){}

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
        select.innerHTML =
            `<option value="">${expiryIsHandheld() ? "Select..." : "Desktop"}</option>` +
            ExpiryCaptureEngine.workers.map(w =>
                `<option value="${expiryEscapeHtml(w.worker_id)}">${expiryEscapeHtml(w.worker_name)}</option>`
            ).join("");
        select.value = current;
    });

    const label = document.getElementById("expiryActiveWorkerName");
    const selected = ExpiryCaptureEngine.workers.find(w => w.worker_id === ExpiryCaptureEngine.selectedWorkerId);
    if(label) label.textContent = selected ? selected.worker_name : "Select worker";

    renderExpiryWorkerCompactState?.();
}

function selectExpiryWorker(workerId){
    ExpiryCaptureEngine.selectedWorkerId = String(workerId || "");
    try{
        if(ExpiryCaptureEngine.selectedWorkerId){
            localStorage.setItem(ExpiryCaptureEngine.storageKey(), ExpiryCaptureEngine.selectedWorkerId);
        }else{
            localStorage.removeItem(ExpiryCaptureEngine.storageKey());
        }
    }catch(_){}
    renderExpiryWorkerSelects();
}

function setExpiryStatus(kind, text){
    const box = document.getElementById("expiryScanStatus");
    if(box){
        box.className = `expiryScanStatus ${kind || "ready"}`;
        box.textContent = text || "READY TO SCAN";
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

function cancelExpiryScanAutoClear(){
    clearTimeout(ExpiryCaptureEngine.scanClearTimer);
    ExpiryCaptureEngine.scanClearTimer=null;
}

function markExpiryFormDirty(){
    ExpiryCaptureEngine.formDirty=true;
    cancelExpiryScanAutoClear();
}

function scheduleExpiryScanAutoClear(){
    cancelExpiryScanAutoClear();
    ExpiryCaptureEngine.formDirty=false;

    ExpiryCaptureEngine.scanClearTimer=setTimeout(()=>{
        if(
            !ExpiryCaptureEngine.currentItem ||
            ExpiryCaptureEngine.formDirty ||
            expiryWorkerIsEditing()
        ){
            return;
        }

        clearExpiryScreen({
            clearSaved:false,
            savedOnly:false
        });
    },30000);
}

function expiryWorkerIsEditing(){
    const active=document.activeElement;
    if(!active || active===document.body) return false;

    if(active.id==="expiryBarcodeInput") return false;

    return !!(
        ["INPUT","SELECT","TEXTAREA"].includes(String(active.tagName||"").toUpperCase()) ||
        active.isContentEditable
    );
}

function setExpiryDateMode(mode){
    const month=document.getElementById("expiryMonth");
    const year=document.getElementById("expiryYear");
    const label=document.getElementById("expiryMonthName");

    ExpiryCaptureEngine.dateSource=mode==="AUTO" ? "AUTO" : "MANUAL";

    if(mode==="AUTO"){
        if(month) month.disabled=true;
        if(year) year.disabled=true;
        if(label){
            const selected=Number(month?.value||0);
            label.textContent=selected
                ? `${expiryMonthName(selected)} · AUTO READ ✓`
                : "AUTO READ ✓";
        }
    }else{
        if(month) month.disabled=false;
        if(year) year.disabled=false;
        if(label){
            const selected=Number(month?.value||0);
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

function clearExpiryScreen(options={}){
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
    if(!item){shell.hidden=true;return;}
    const name=document.getElementById("expiryActiveItemName");
    const identity=document.getElementById("expiryActiveItemIdentity");
    const detail=document.getElementById("expiryActiveItemGs1");
    if(name) name.textContent=item.itemName||"Item not recognized";
    if(identity) identity.textContent=[item.itemCode||"Needs Review",item.identifierDisplay||item.gtin||"",item.category||"Uncategorized"].filter(Boolean).join(" • ");
    const parts=[];
    if(gs1?.lot) parts.push("Batch "+gs1.lot);
    if(gs1?.serial) parts.push("Serial "+gs1.serial);
    if(gs1?.expiry) parts.push("Expiry "+gs1.expiry);
    if(detail){detail.textContent=parts.join(" • ");detail.hidden=!parts.length;}
    shell.hidden=false;
}

function expiryCaptureHasCompleteAutoData(){
    if(expiryIsHandheld() || !ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.currentItem.needsReview) return false;
    const gs1=ExpiryCaptureEngine.scannedGS1||{};
    const quantity=Number(document.getElementById("expiryQuantity")?.value||0);
    const month=Number(document.getElementById("expiryMonth")?.value||0);
    const year=Number(document.getElementById("expiryYear")?.value||0);
    return quantity===1 && !!toSafeString(gs1.expiry).trim() && month>=1 && month<=12 && year>=2020 && year<=2200;
}

function resetExpiryCaptureForm(options = {}){
    cancelExpiryScanAutoClear();
    ExpiryCaptureEngine.formDirty=false;
    ExpiryCaptureEngine.currentItem = null;
    ExpiryCaptureEngine.scannedGS1 = null;
    renderExpiryActiveItem(null);

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
        qty.readOnly=true;
        qty.dataset.intentionalEdit="0";
    }
    if(month){
        month.value = "";
        month.disabled=false;
    }
    if(year){
        year.value = "";
        year.disabled=false;
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
function closeExpirySearchResults(){
    const box=document.getElementById("expirySearchResults");
    if(box){box.hidden=true;box.innerHTML="";}
    ExpiryCaptureEngine.desktopSearchRows=[];
}
function renderExpirySearchResults(rows){
    const box=document.getElementById("expirySearchResults");
    if(!box) return;
    ExpiryCaptureEngine.desktopSearchRows=Array.isArray(rows)?rows:[];
    if(!ExpiryCaptureEngine.desktopSearchRows.length){closeExpirySearchResults();return;}
    box.innerHTML=ExpiryCaptureEngine.desktopSearchRows.map((row,index)=>
        '<button type="button" class="smartSearchResult expirySearchResult" data-expiry-search-index="'+index+'">'+
            '<div class="smartSearchResultMain expirySearchResultMain">'+
                '<strong>'+expiryEscapeHtml(row.item_name||"Unnamed item")+'</strong>'+
                '<span>GTIN: <b>'+expiryEscapeHtml(row.identifier_display||"—")+'</b></span>'+
            '</div>'+
            '<div class="expirySearchResultMeta">'+
                '<strong>'+expiryEscapeHtml(row.item_code||"—")+'</strong>'+
                '<span>'+expiryEscapeHtml(row.category||row.group_name||"Uncategorized")+'</span>'+
            '</div>'+
        '</button>'
    ).join("");
    box.hidden=false;
    box.querySelectorAll("[data-expiry-search-index]").forEach(button=>button.onclick=()=>selectExpirySearchResult(Number(button.dataset.expirySearchIndex)));
}
async function selectExpirySearchResult(index){
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
        const qty=document.getElementById("expiryQuantity");if(qty){qty.value="1";qty.readOnly=true;qty.dataset.intentionalEdit="0";}
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

    if(expiryIsHandheld() && !ExpiryCaptureEngine.selectedWorkerId){
        setExpiryStatus("action","SELECT WORKER");
        try{ document.activeElement?.blur?.(); }catch(_){}
        return false;
    }

    setExpiryStatus("busy","READING...");

    const parsed = typeof parseGS1Barcode === "function"
        ? parseGS1Barcode(cleaned)
        : {gtin: cleaned,identifierDisplay:cleaned};

    const identifierDisplay=expiryIdentifierFromScan(cleaned,parsed);
    ExpiryCaptureEngine.scannedGS1 = parsed || null;

    if(!identifierDisplay){
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

    const found=record?.found===true;
    const resolvedIdentifier=toSafeString(record?.identifierDisplay||identifierDisplay).trim()||identifierDisplay;

    if(!found){
        ExpiryCaptureEngine.currentItem={
            itemCode:"",
            itemName:"Item not recognized",
            identifierDisplay,
            gtin:identifierDisplay,
            category:"",
            needsReview:true,
            rawBarcode:cleaned
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
            qty.readOnly=true;
            qty.dataset.intentionalEdit="0";
        }

        const autoExpiry=toSafeString(parsed?.expiry||"");
        const autoMatch=autoExpiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if(autoMatch){
            document.getElementById("expiryMonth").value=String(Number(autoMatch[2]));
            document.getElementById("expiryYear").value=String(Number(autoMatch[1]));
            setExpiryDateMode("AUTO");
        }else{
            setExpiryDateMode("MANUAL");
        }

        document.getElementById("btnSaveExpiryCapture").disabled=false;
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
        identifierSource:record.source||""
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
        if(month) month.value=String(Number(m[2]));
        if(year) year.value=String(Number(m[1]));
        setExpiryDateMode("AUTO");
    }else{
        setExpiryDateMode("MANUAL");
    }

    const qty = document.getElementById("expiryQuantity");
    if(qty){
        qty.value = "1";
        qty.readOnly=true;
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

    if(expiryCaptureHasCompleteAutoData()){
        setExpiryStatus("success","ITEM FOUND · SAVING...");
        await saveExpiryCapture({auto:true});
        return true;
    }

    scheduleExpiryScanAutoClear();
    return true;
}

async function saveExpiryCapture(options={}){
    if(ExpiryCaptureEngine.busy) return;

    cancelExpiryScanAutoClear();

    const item = ExpiryCaptureEngine.currentItem;
    const workerId = ExpiryCaptureEngine.selectedWorkerId;
    const quantity = Number(document.getElementById("expiryQuantity")?.value || 0);
    const month = Number(document.getElementById("expiryMonth")?.value || 0);
    let year = Number(document.getElementById("expiryYear")?.value || 0);

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
        setExpiryStatus("action","ENTER QUANTITY");
        document.getElementById("expiryQuantity")?.focus();
        return;
    }
    if(month < 1 || month > 12){
        setExpiryStatus("action","SELECT MONTH");
        document.getElementById("expiryMonth")?.focus();
        return;
    }
    if(year < 2020 || year > 2200){
        setExpiryStatus("action","SELECT YEAR");
        document.getElementById("expiryYear")?.focus();
        return;
    }

    ExpiryCaptureEngine.busy = true;
    const button = document.getElementById("btnSaveExpiryCapture");
    if(button) button.disabled = true;
    setExpiryStatus("busy","SAVING...");

    try{
        const pharmacyId = expiryPharmacyId();
        const deviceId = (typeof ensureDeviceId === "function") ? ensureDeviceId() : "";

        if(item.needsReview){
            await authRpc("save_pharmacy_needs_review",{
                p_pharmacy_id:pharmacyId,p_workflow:"EXPIRY",p_gtin:item.gtin,p_raw_barcode:item.rawBarcode||item.gtin,
                p_order_id:null,p_order_name:null,p_pending_quantity:quantity,p_expiry_month:month,p_expiry_year:year,
                p_worker_id:workerId||null,p_device_id:deviceId,
                p_source:(typeof isLikelyZebraDevice==="function"&&isLikelyZebraDevice())?"HANDHELD":"PC"
            });
            setExpiryStatus("success","✓ SAVED FOR REVIEW");
            if(typeof refreshNeedsReviewCounters==="function")refreshNeedsReviewCounters();

            setTimeout(()=>{
                resetExpiryCaptureForm({focus:true});
                scheduleExpirySavedAutoClear();
            },500);

            return;
        }

        const gs1=ExpiryCaptureEngine.scannedGS1 || {};
        const saveResult=await authRpc("save_pharmacy_expiry_verified_state_v2", {
            p_pharmacy_id: pharmacyId,
            p_item_code: item.itemCode,
            p_item_name: item.itemName,
            p_identifier_display: item.identifierDisplay || item.gtin,
            p_category: item.category || "",
            p_quantity: quantity,
            p_expiry_month: month,
            p_expiry_year: year,
            p_worker_id: workerId || null,
            p_batch_no: toSafeString(gs1.lot||""),
            p_sample_serial: toSafeString(gs1.serial||""),
            p_device_id: deviceId,
            p_source: expiryCurrentSource(),
            p_event_type: "CAPTURE"
        });

        if(typeof window.recordExpirySessionCapture==="function"){
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
        if(saved){
            saved.innerHTML =
                `<strong>${expiryEscapeHtml(item.itemName)}</strong>` +
                `<span>Qty ${quantity} • ${expiryEscapeHtml(expiryMonthName(month))} ${year} • ${expiryEscapeHtml(worker?.worker_name || "")}</span>`;
        }

        setExpiryStatus("success",options.auto?"✓ AUTO SAVED — NEXT ITEM":"✓ SAVED — NEXT ITEM");
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

        setTimeout(()=>{
            resetExpiryCaptureForm({focus:true});
            scheduleExpirySavedAutoClear();
        },500);

    }catch(error){
        console.error("Unable to save expiry capture",error);
        setExpiryStatus("error","SAVE FAILED");
        if(button) button.disabled = false;
    }finally{
        ExpiryCaptureEngine.busy = false;
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

function expiryPopulateCategoryFilter(rows){
    const select=document.getElementById("expiryCategoryFilter");
    if(!select) return;
    const current=select.value||"";
    const categories=[...new Set((rows||[]).map(row=>toSafeString(row?.category).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    select.innerHTML='<option value="">All Categories</option>'+categories.map(category=>`<option value="${expiryEscapeHtml(category)}">${expiryEscapeHtml(category)}</option>`).join("");
    if(categories.includes(current)) select.value=current;
}

function expiryFilteredCurrentRows(rows){
    const category=toSafeString(document.getElementById("expiryCategoryFilter")?.value).trim();
    return category ? (rows||[]).filter(row=>toSafeString(row?.category).trim()===category) : (rows||[]);
}

function expiryRecentCurrentRows(rows){
    return [...(rows||[])].sort((a,b)=>{
        const aTime=Date.parse(a?.last_verified_at||a?.updated_at||a?.created_at||"")||0;
        const bTime=Date.parse(b?.last_verified_at||b?.updated_at||b?.created_at||"")||0;
        return bTime-aTime;
    }).slice(0,10);
}

function expiryCurrentRowById(stateId){
    return ExpiryCaptureEngine.currentRows.find(row=>String(row?.state_id||"")===String(stateId||""))||null;
}

function renderExpiryCurrentState(rows){
    const safeRows=Array.isArray(rows)?rows:[];
    ExpiryCaptureEngine.currentRows=safeRows;
    renderExpiryKpis(safeRows);
    expiryPopulateCategoryFilter(safeRows);
    const filteredRows=expiryFilteredCurrentRows(safeRows);
    const visibleRows=ExpiryCaptureEngine.desktopView==="RECENT" ? expiryRecentCurrentRows(filteredRows) : filteredRows;
    const body=document.getElementById("expiryCurrentStateBody");
    const empty=document.getElementById("expiryCurrentStateEmpty");
    const count=document.getElementById("expiryCurrentStateCount");
    if(count) count.textContent=String(visibleRows.length);
    if(!body) return;
    if(!visibleRows.length){body.innerHTML="";if(empty) empty.hidden=false;return;}
    if(empty) empty.hidden=true;
    body.innerHTML=visibleRows.map(row=>{
        const editing=String(row.state_id||"")===String(ExpiryCaptureEngine.editingStateId||"");
        return `<tr data-expiry-state-id="${expiryEscapeHtml(row.state_id||"")}" class="${String(row.state_id||"")===String(ExpiryCaptureEngine.highlightedStateId||"")?"expiryRowUpdated":""} ${editing?"expiryRowEditing":""}">
            <td class="expiryCodeCell"><strong>${expiryEscapeHtml(row.item_code||"—")}</strong><span>${expiryEscapeHtml(row.identifier_display||"")}</span></td>
            <td class="expiryProductCell"><strong>${expiryEscapeHtml(row.item_name||"")}</strong></td>
            <td><span class="expiryCategoryChip">${expiryEscapeHtml(row.category||"Uncategorized")}</span></td>
            <td>${editing?`<input class="expiryInlineInput" data-edit-batch value="${expiryEscapeHtml(row.batch_no||"")}" placeholder="Batch">`:expiryEscapeHtml(row.batch_no||"—")}</td>
            <td>${editing?`<div class="expiryInlineDate"><input class="expiryInlineInput" data-edit-month type="number" min="1" max="12" value="${Number(row.expiry_month)||""}"><input class="expiryInlineInput" data-edit-year type="number" min="2020" max="2200" value="${Number(row.expiry_year)||""}"></div>`:`${expiryEscapeHtml(expiryMonthShortName(row.expiry_month))} ${expiryEscapeHtml(row.expiry_year)}`}</td>
            <td class="expiryQtyCell">${editing?`<input class="expiryInlineInput expiryInlineQty" data-edit-qty type="number" min="1" value="${Number(row.verified_quantity)||1}">`:expiryEscapeHtml(row.verified_quantity)}</td>
            <td>${expiryEscapeHtml(row.verified_by_name||"Account user")}</td>
            <td class="expiryActionsCell">${editing?
                `<button type="button" class="expiryRowAction primary" data-expiry-save-edit="${expiryEscapeHtml(row.state_id||"")}">Save</button><button type="button" class="expiryRowAction" data-expiry-cancel-edit>Cancel</button>`:
                `<button type="button" class="expiryRowAction" data-expiry-edit="${expiryEscapeHtml(row.state_id||"")}">Edit</button><button type="button" class="expiryRowAction danger" data-expiry-clear="${expiryEscapeHtml(row.state_id||"")}">Delete</button>`}</td>
        </tr>`;
    }).join("");
    bindExpiryCurrentRowActions();
}

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
function bindExpiryCurrentRowActions(){
    const body=document.getElementById("expiryCurrentStateBody");if(!body)return;
    body.querySelectorAll("[data-expiry-edit]").forEach(button=>button.onclick=()=>{ExpiryCaptureEngine.editingStateId=button.dataset.expiryEdit;renderExpiryCurrentState(ExpiryCaptureEngine.currentRows);});
    body.querySelectorAll("[data-expiry-cancel-edit]").forEach(button=>button.onclick=()=>{ExpiryCaptureEngine.editingStateId="";renderExpiryCurrentState(ExpiryCaptureEngine.currentRows);});
    body.querySelectorAll("[data-expiry-save-edit]").forEach(button=>button.onclick=async()=>{
        const row=expiryCurrentRowById(button.dataset.expirySaveEdit);if(!row)return;
        const tr=button.closest("tr");const values={quantity:Number(tr?.querySelector("[data-edit-qty]")?.value||0),month:Number(tr?.querySelector("[data-edit-month]")?.value||0),year:Number(tr?.querySelector("[data-edit-year]")?.value||0),batch:toSafeString(tr?.querySelector("[data-edit-batch]")?.value).trim()};
        if(!Number.isInteger(values.quantity)||values.quantity<=0||values.month<1||values.month>12||values.year<2020||values.year>2200){setExpiryStatus("error","CHECK QUANTITY AND EXPIRY");return;}
        button.disabled=true;
        try{await saveExpiryCurrentCorrection(row,values);ExpiryCaptureEngine.editingStateId="";ExpiryCaptureEngine.highlightedStateId=row.state_id;setExpiryStatus("success",`UPDATED · TOTAL ${values.quantity}`);await refreshExpiryCurrentState();}
        catch(error){console.error("Expiry correction failed",error);setExpiryStatus("error",String(error?.message||"UPDATE FAILED").includes("already uses")?"DUPLICATE BATCH / EXPIRY":"UPDATE FAILED");button.disabled=false;}
    });
    body.querySelectorAll("[data-expiry-clear]").forEach(button=>button.onclick=async()=>{
        const row=expiryCurrentRowById(button.dataset.expiryClear);if(!row)return;
        if(button.dataset.confirm!=="1"){button.dataset.confirm="1";button.textContent="Confirm";setTimeout(()=>{if(button.isConnected&&button.dataset.confirm==="1"){button.dataset.confirm="";button.textContent="Delete";}},3000);return;}
        button.disabled=true;
        try{await clearExpiryCurrentState(row);setExpiryStatus("success","REMOVED FROM CURRENT EXPIRY");await refreshExpiryCurrentState();}
        catch(error){console.error("Expiry clear failed",error);setExpiryStatus("error","DELETE FAILED");button.disabled=false;}
    });
}

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
            btn.innerHTML=`
                <span class="expiryCapturedButtonLabel">${label}</span>
                <strong id="expiryCapturedCount">${operational.length}</strong>
            `;

            btn.setAttribute(
                "aria-label",
                "Recent expiry captures"
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
            if(typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice()){
                if(typeof setZebraHomeMode === "function"){
                    setZebraHomeMode();
                }
            }else if(typeof navigateTo === "function"){
                navigateTo("dashboard");
            }
        });
    }

    const qtyInput = document.getElementById("expiryQuantity");
    if(qtyInput && qtyInput.dataset.intentBound!=="1"){
        qtyInput.dataset.intentBound="1";

        const unlockQuantity=()=>{
            if(!ExpiryCaptureEngine.currentItem) return;

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
                qtyInput.readOnly=true;
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
            if(label) label.textContent=expiryMonthName(monthSelect.value);
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
        barcode.setAttribute("autocomplete","off");
        barcode.setAttribute("autocapitalize","off");
        barcode.setAttribute("spellcheck","false");

        const commitHardwareScan = () => {
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            ExpiryCaptureEngine.scanTimer=null;
            closeExpirySearchResults();
            const value=String(barcode.value||"").trim();
            if(!value || value===ExpiryCaptureEngine.lastResolvedRaw) return;
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

        barcode.addEventListener("paste",()=>{
            if(expiryIsHandheld()) return;
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            setTimeout(()=>{
                const value=String(barcode.value||"").trim();
                if(looksLikeExpiryIdentifier(value)) commitHardwareScan();
            },0);
        });

        barcode.addEventListener("input",()=>{
            clearTimeout(ExpiryCaptureEngine.scanTimer);
            clearTimeout(ExpiryCaptureEngine.desktopSearchTimer);
            const value=String(barcode.value||"").trim();
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
            ExpiryCaptureEngine.desktopSearchTimer=setTimeout(async()=>{
                try{renderExpirySearchResults(await expirySearchGlobalItems(value));}
                catch(error){console.warn("Expiry manual search failed",error);closeExpirySearchResults();}
            },220);
        });

        barcode.addEventListener("change",()=>{if(expiryIsHandheld()) commitHardwareScan();});
    }

    const worker = document.getElementById("expiryWorkerSelect");
    if(worker && worker.dataset.bound !== "1"){
        worker.dataset.bound = "1";
        worker.addEventListener("change", () => {
            selectExpiryWorker(worker.value);

            /* Desktop operator is optional. Always return focus to Scan after
               changing or clearing it so hardware input never remains trapped
               in the operator select. Handheld keeps its required-worker guard. */
            if(!expiryIsHandheld() || worker.value){
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

    const clearButton=document.getElementById("btnClearExpiryScreen");
    if(clearButton && clearButton.dataset.bound!=="1"){
        clearButton.dataset.bound="1";
        clearButton.addEventListener("click",()=>clearExpiryScreen({clearSaved:true}));
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

    const categoryFilter=document.getElementById("expiryCategoryFilter");
    if(categoryFilter && categoryFilter.dataset.bound!=="1"){
        categoryFilter.dataset.bound="1";
        categoryFilter.addEventListener("change",()=>refreshExpiryCurrentState());
    }

    const currentSearch=document.getElementById("expiryCurrentSearch");
    if(currentSearch && currentSearch.dataset.bound!=="1"){
        currentSearch.dataset.bound="1";
        let searchTimer=null;
        currentSearch.addEventListener("input",()=>{
            clearTimeout(searchTimer);
            searchTimer=setTimeout(()=>refreshExpiryCurrentState(),180);
        });
    }

    const save = document.getElementById("btnSaveExpiryCapture");
    if(save && save.dataset.bound !== "1"){
        save.dataset.bound = "1";
        save.addEventListener("click", saveExpiryCapture);
    }

    document.getElementById("btnExpiryBackToModes")?.addEventListener("click", () => {
        if(typeof setZebraHomeMode === "function") setZebraHomeMode();
    });
}

async function activateExpiryCapture(){
    bindExpiryCaptureUI();
    populateExpiryDateDropdowns();
    refreshExpiryCapturedCount();
    await loadExpiryWorkers();
    await refreshExpiryCurrentState();
    renderExpiryWorkerCompactState();
    clearExpirySavedConfirmation();
    resetExpiryCaptureForm({focus:false});

    if(expiryIsHandheld() && ExpiryCaptureEngine.workers.length === 0){
        setExpiryStatus("action","ADD WORKER IN SETTINGS");
        return;
    }

    if(expiryIsHandheld() && !ExpiryCaptureEngine.selectedWorkerId){
        setExpiryStatus("action","SELECT WORKER");
        try{ document.activeElement?.blur?.(); }catch(_){}
        try{ window.scrollTo(0,0); }catch(_){}
        return;
    }

    setExpiryStatus("ready","READY TO SCAN");
    try{ window.scrollTo(0,0); }catch(_){}
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
