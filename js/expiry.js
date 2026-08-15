
/* =========================================================
   PHARMFLOW — PHASE 2C.9.1
   HANDHELD NEAR EXPIRY + CAPTURED BY
========================================================= */

const ExpiryCaptureEngine = {
    workers: [],
    selectedWorkerId: "",
    currentItem: null,
    busy: false,
    storageKey(){
        const pharmacy = (typeof AuthState !== "undefined" && AuthState.context?.pharmacy_id) || "none";
        return `pharmflow_expiry_worker_${pharmacy}`;
    }
};

function expiryPharmacyId(){
    return (typeof AuthState !== "undefined" && AuthState.context?.pharmacy_id) || null;
}

function expiryMonthName(month){
    const names = ["","January","February","March","April","May","June",
                   "July","August","September","October","November","December"];
    return names[Number(month)] || "";
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
            `<option value="">Select worker...</option>` +
            ExpiryCaptureEngine.workers.map(w =>
                `<option value="${escapeHtml(w.worker_id)}">${escapeHtml(w.worker_name)}</option>`
            ).join("");
        select.value = current;
    });

    const label = document.getElementById("expiryActiveWorkerName");
    const selected = ExpiryCaptureEngine.workers.find(w => w.worker_id === ExpiryCaptureEngine.selectedWorkerId);
    if(label) label.textContent = selected ? selected.worker_name : "Select worker";
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
    if(!box) return;
    box.className = `expiryScanStatus ${kind || "ready"}`;
    box.textContent = text || "READY TO SCAN";
}

function resetExpiryCaptureForm(options = {}){
    ExpiryCaptureEngine.currentItem = null;

    ["expiryItemName","expiryItemCode","expiryItemGTIN","expiryItemCategory"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = "—";
    });

    const qty = document.getElementById("expiryQuantity");
    const month = document.getElementById("expiryMonth");
    const year = document.getElementById("expiryYear");
    const monthName = document.getElementById("expiryMonthName");

    if(qty) qty.value = "";
    if(month) month.value = "";
    if(year) year.value = "";
    if(monthName) monthName.textContent = "";

    document.getElementById("btnSaveExpiryCapture")?.setAttribute("disabled","disabled");

    setExpiryStatus("ready","READY TO SCAN");

    if(options.focus !== false){
        setTimeout(()=>focusExpiryScanner(),40);
    }
}

function focusExpiryScanner(){
    const input = document.getElementById("expiryBarcodeInput");
    if(!input) return;
    input.setAttribute("inputmode","none");
    input.setAttribute("autocomplete","off");
    try{ input.focus({preventScroll:true}); }catch(_){ input.focus(); }
}

async function resolveExpiryScannedValue(rawValue){
    const cleaned = typeof cleanScannerInput === "function"
        ? cleanScannerInput(rawValue)
        : String(rawValue || "").trim();

    if(!cleaned) return false;

    if(!ExpiryCaptureEngine.selectedWorkerId){
        setExpiryStatus("action","SELECT WORKER");
        document.getElementById("expiryWorkerSelect")?.focus();
        return false;
    }

    setExpiryStatus("busy","READING...");

    const parsed = typeof parseGS1Barcode === "function"
        ? parseGS1Barcode(cleaned)
        : {gtin: cleaned};

    const gtin = String(parsed?.gtin || (typeof extractLikelyGTIN === "function" ? extractLikelyGTIN(cleaned) : "") || "").replace(/\D/g,"");

    if(!gtin){
        setExpiryStatus("error","GTIN NOT READ");
        setTimeout(()=>setExpiryStatus("ready","READY TO SCAN"),1000);
        return false;
    }

    let record = null;
    try{
        record = typeof getMasterGTINRecordByGTIN === "function"
            ? await getMasterGTINRecordByGTIN(gtin)
            : null;
    }catch(error){
        console.error("Expiry GTIN lookup failed",error);
    }

    if(!record){
        setExpiryStatus("action","GTIN NEEDS MAPPING");
        const input = document.getElementById("expiryBarcodeInput");
        if(input) input.value = "";
        if(typeof showToast === "function"){
            showToast("This GTIN is not mapped yet. Map it in Receiving or Global GTIN before expiry capture.","warning");
        }
        return false;
    }

    ExpiryCaptureEngine.currentItem = {
        itemCode: record.itemCode || "",
        itemName: record.itemName || "",
        gtin,
        category: record.category || ""
    };

    document.getElementById("expiryItemName").textContent = ExpiryCaptureEngine.currentItem.itemName || "Unnamed item";
    document.getElementById("expiryItemCode").textContent = ExpiryCaptureEngine.currentItem.itemCode || "—";
    document.getElementById("expiryItemGTIN").textContent = gtin;
    document.getElementById("expiryItemCategory").textContent = ExpiryCaptureEngine.currentItem.category || "Uncategorized";

    const qty = document.getElementById("expiryQuantity");
    if(qty) qty.value = "1";

    document.getElementById("btnSaveExpiryCapture")?.removeAttribute("disabled");

    setExpiryStatus("success","ITEM FOUND");

    const input = document.getElementById("expiryBarcodeInput");
    if(input) input.value = "";

    setTimeout(()=>{
        document.getElementById("expiryQuantity")?.focus();
        document.getElementById("expiryQuantity")?.select();
    },80);

    return true;
}

async function saveExpiryCapture(){
    if(ExpiryCaptureEngine.busy) return;

    const item = ExpiryCaptureEngine.currentItem;
    const workerId = ExpiryCaptureEngine.selectedWorkerId;
    const quantity = Number(document.getElementById("expiryQuantity")?.value || 0);
    const month = Number(document.getElementById("expiryMonth")?.value || 0);
    let year = Number(document.getElementById("expiryYear")?.value || 0);

    if(year > 0 && year < 100) year += 2000;

    if(!workerId){
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
        setExpiryStatus("action","ENTER MONTH 01–12");
        document.getElementById("expiryMonth")?.focus();
        return;
    }
    if(year < 2020 || year > 2200){
        setExpiryStatus("action","ENTER YEAR");
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

        await authRpc("save_pharmacy_expiry_capture", {
            p_pharmacy_id: pharmacyId,
            p_item_code: item.itemCode,
            p_item_name: item.itemName,
            p_gtin: item.gtin,
            p_category: item.category || "",
            p_quantity: quantity,
            p_expiry_month: month,
            p_expiry_year: year,
            p_worker_id: workerId,
            p_device_id: deviceId,
            p_source: (typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice()) ? "HANDHELD" : "PC"
        });

        const worker = ExpiryCaptureEngine.workers.find(w => w.worker_id === workerId);
        const saved = document.getElementById("expiryLastSaved");
        if(saved){
            saved.innerHTML =
                `<strong>${escapeHtml(item.itemName)}</strong>` +
                `<span>Qty ${quantity} • ${escapeHtml(expiryMonthName(month))} ${year} • ${escapeHtml(worker?.worker_name || "")}</span>`;
        }

        setExpiryStatus("success","✓ SAVED — NEXT ITEM");
        setTimeout(()=>resetExpiryCaptureForm({focus:true}),500);

    }catch(error){
        console.error("Unable to save expiry capture",error);
        setExpiryStatus("error","SAVE FAILED");
        if(typeof showToast === "function"){
            showToast(error?.message || "Unable to save expiry capture","error");
        }
        if(button) button.disabled = false;
    }finally{
        ExpiryCaptureEngine.busy = false;
    }
}

function bindExpiryCaptureUI(){
    const barcode = document.getElementById("expiryBarcodeInput");
    if(barcode && barcode.dataset.bound !== "1"){
        barcode.dataset.bound = "1";
        barcode.setAttribute("inputmode","none");
        barcode.addEventListener("keydown", event => {
            if(event.key === "Enter"){
                event.preventDefault();
                const value = barcode.value;
                barcode.value = "";
                resolveExpiryScannedValue(value);
            }
        });
        barcode.addEventListener("change", () => {
            const value = barcode.value;
            if(value){
                barcode.value = "";
                resolveExpiryScannedValue(value);
            }
        });
    }

    const worker = document.getElementById("expiryWorkerSelect");
    if(worker && worker.dataset.bound !== "1"){
        worker.dataset.bound = "1";
        worker.addEventListener("change", () => {
            selectExpiryWorker(worker.value);
            if(worker.value) focusExpiryScanner();
        });
    }

    ["expiryQuantity","expiryMonth","expiryYear"].forEach(id => {
        const el = document.getElementById(id);
        if(!el || el.dataset.bound === "1") return;
        el.dataset.bound = "1";

        el.addEventListener("input", () => {
            if(id === "expiryMonth"){
                const m = Number(el.value || 0);
                const name = document.getElementById("expiryMonthName");
                if(name) name.textContent = m >= 1 && m <= 12 ? expiryMonthName(m) : "";
            }
        });

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
    await loadExpiryWorkers();
    resetExpiryCaptureForm({focus:false});

    if(ExpiryCaptureEngine.workers.length === 0){
        setExpiryStatus("action","ADD WORKER IN SETTINGS");
        return;
    }

    if(!ExpiryCaptureEngine.selectedWorkerId){
        setExpiryStatus("action","SELECT WORKER");
        document.getElementById("expiryWorkerSelect")?.focus();
        return;
    }

    setExpiryStatus("ready","READY TO SCAN");
    focusExpiryScanner();
}

/* ---------------- Worker management in Settings ---------------- */

function ensureExpiryWorkerSettingsCard(){
    const settings = document.getElementById("page-settings");
    if(!settings || document.getElementById("expiryWorkersSettingsCard")) return;

    const card = document.createElement("section");
    card.id = "expiryWorkersSettingsCard";
    card.className = "contentCard expiryWorkersSettingsCard";
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
        if(typeof showToast === "function") showToast(error?.message || "Unable to save worker","error");
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
            <strong>${escapeHtml(w.worker_name)}</strong>
            <button type="button" class="secondaryButton" data-expiry-worker-remove="${escapeHtml(w.worker_id)}">Disable</button>
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
