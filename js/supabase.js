"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   SUPABASE CLOUD SESSION ENGINE

   Browser-safe configuration: this file contains only
   the Supabase Project URL and Publishable API key.
   Never place a secret/service_role/database password here.
===================================================== */

const CLOUD_CONFIG = Object.freeze({
    url:"https://zznoshzcyxmtwfbznjyr.supabase.co",
    publishableKey:"sb_publishable_dulQyE_y0NZK2XyJyW_0TA_xhvwIxCS",
    pollIntervalMs:1500,
    rpcTimeoutMs:15000
});

const CloudSyncEngine = {
    initialized:false,
    pollingTimer:null,
    pollRunning:false,
    applyingRemote:false,
    online:navigator.onLine,
    lastSnapshotAt:null,
    lastError:null
};

function initializeSupabaseCloud(){
    if(CloudSyncEngine.initialized){
        return;
    }

    CloudSyncEngine.initialized = true;

    /* One-time migration: old offline Zebra work must not reopen as the current session.
       A recovery copy is retained locally before the visible quantities are cleared. */
    backupAndClearLegacyZebraWorkspace();

    AppEvents.on("receiving:transaction", function(transaction){
        if(!isCloudSessionActive() || CloudSyncEngine.applyingRemote){
            return;
        }
        queueCloudTransaction(transaction);
    });

    AppEvents.on("workspace:cleared", function(){
        stopCloudPolling();
    });

    window.addEventListener("online", function(){
        CloudSyncEngine.online = true;
        updateCloudConnectionUI("ONLINE");
        flushCloudPendingQueue();
        refreshCloudSnapshot();
    });

    window.addEventListener("offline", function(){
        CloudSyncEngine.online = false;
        updateCloudConnectionUI("OFFLINE");
    });

    document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible" && isCloudSessionActive()){
            flushCloudPendingQueue();
            refreshCloudSnapshot();
        }
    });

    setTimeout(handleCloudJoinFromURL, 600);

    if(isCloudSessionActive()){
        validateRestoredCloudSession().then(function(valid){
            if(valid === true && isCloudSessionActive()){
                startCloudPolling();
                refreshCloudSnapshot();
            }
        });
    }

    Logger.info("Supabase cloud module initialized");
}

function isCloudSessionActive(){
    return !!(
        AppState &&
        AppState.session &&
        AppState.session.cloud === true &&
        AppState.session.id &&
        AppState.session.secret
    );
}

function createBrowserUUID(){
    if(window.crypto && typeof window.crypto.randomUUID === "function"){
        return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){
        const r = Math.random()*16|0;
        const v = c === "x" ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

async function cloudRpc(functionName, params = {}){
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), CLOUD_CONFIG.rpcTimeoutMs);

    try{
        const response = await fetch(
            CLOUD_CONFIG.url + "/rest/v1/rpc/" + encodeURIComponent(functionName),
            {
                method:"POST",
                headers:{
                    "apikey":CLOUD_CONFIG.publishableKey,
                    "Authorization":"Bearer " + CLOUD_CONFIG.publishableKey,
                    "Content-Type":"application/json",
                    "Accept":"application/json"
                },
                body:JSON.stringify(params || {}),
                signal:controller.signal
            }
        );

        const text = await response.text();
        let data = null;
        if(text){
            try{ data = JSON.parse(text); }
            catch(_){ data = text; }
        }

        if(!response.ok){
            const message = data && (data.message || data.hint || data.details)
                ? (data.message || data.hint || data.details)
                : ("Supabase request failed (" + response.status + ")");
            throw new Error(message);
        }

        CloudSyncEngine.lastError = null;
        return data;
    }
    catch(error){
        CloudSyncEngine.lastError = error;
        throw error;
    }
    finally{
        clearTimeout(timer);
    }
}

async function createCloudReceivingSession(){
    if(!navigator.onLine){
        showToast("Internet connection is required to create a cloud session","warning");
        return false;
    }

    if(!AppState.workspace.orderData || AppState.workspace.orderData.length === 0){
        showToast("Load the order before creating a cloud session","warning");
        return false;
    }

    showLoading("Creating shared cloud session...");

    try{
        const result = await cloudRpc("create_receiving_session",{
            p_order_number:AppState.workspace.orderId || AppState.workspace.orderName || "",
            p_order_name:AppState.workspace.orderName || AppState.workspace.orderId || "",
            p_device_id:ensureDeviceId()
        });

        const session = Array.isArray(result) ? result[0] : result;
        if(!session || !session.session_id || !session.session_secret){
            throw new Error("Supabase did not return a valid session");
        }

        AppState.session = {
            ...createEmptySession(),
            id:session.session_id,
            code:String(session.session_code || ""),
            secret:String(session.session_secret || ""),
            cloud:true,
            role:"PC",
            deviceId:ensureDeviceId(),
            createdAt:nowISO(),
            lastSave:null,
            pendingQueue:[]
        };

        await uploadCurrentOrderToCloud();
        await uploadExistingTransactionsToCloud();

        saveWorkspaceSnapshot();
        AppEvents.emit("session:updated");
        renderCloudSessionQR();
        startCloudPolling();
        await refreshCloudSnapshot();

        showToast("Shared session " + AppState.session.code + " is ready","success");
        return AppState.session;
    }
    catch(error){
        Logger.error("Cloud session creation failed",error);
        showToast(error.message || "Unable to create cloud session","error");
        return false;
    }
    finally{
        hideLoading();
        focusScannerInput();
    }
}

function buildCloudOrderItems(){
    const gtinsByItem = new Map();

    (AppState.workspace.mappingData || []).forEach(mapping=>{
        const code = normalizeItemCode(mapping.itemCode);
        const gtin = normalizeGTIN(mapping.gtin);
        if(!code || !gtin){ return; }
        if(!gtinsByItem.has(code)){ gtinsByItem.set(code,[]); }
        const list = gtinsByItem.get(code);
        if(!list.includes(gtin)){ list.push(gtin); }
    });

    return (AppState.workspace.orderData || []).map(item=>{
        const code = normalizeItemCode(item.itemCode);
        const gtins = gtinsByItem.get(code) || [];
        return {
            item_code:code,
            item_name:toSafeString(item.itemName),
            gtin:gtins[0] || "",
            gtins:gtins,
            category:toSafeString(item.category || ""),
            ordered_qty:toNumber(item.orderedQty,0)
        };
    });
}

async function uploadCurrentOrderToCloud(){
    if(!isCloudSessionActive()){
        throw new Error("No active cloud session");
    }

    const items = buildCloudOrderItems();
    const result = await cloudRpc("bulk_upsert_session_items",{
        p_session_id:AppState.session.id,
        p_session_secret:AppState.session.secret,
        p_items:items
    });

    const count = typeof result === "number" ? result : Number(result || 0);
    Logger.info("Cloud order uploaded",count || items.length);
    return count || items.length;
}

async function joinCloudReceivingSession(sessionCode){
    const code = String(sessionCode || "").replace(/\D/g,"").trim();
    if(!code){
        showToast("Enter the Session Code","warning");
        return false;
    }

    if(!navigator.onLine){
        showToast("Internet connection is required to join a cloud session","warning");
        return false;
    }

    showLoading("Joining shared session...");

    try{
        const result = await cloudRpc("join_receiving_session_by_code",{
            p_session_code:code
        });
        const session = Array.isArray(result) ? result[0] : result;

        if(!session || !session.session_id || !session.session_secret){
            throw new Error("Session not found or no longer active");
        }

        AppState.session = {
            ...createEmptySession(),
            id:session.session_id,
            code:String(session.session_code || code),
            secret:String(session.session_secret),
            cloud:true,
            role:"ZEBRA",
            deviceId:ensureDeviceId(),
            createdAt:nowISO(),
            lastSave:null,
            pendingQueue:[]
        };

        AppState.workspace.orderId = session.order_number || AppState.workspace.orderId;
        AppState.workspace.orderName = session.order_name || AppState.workspace.orderName || session.order_number || "Shared Order";
        AppState.workspace.active = true;

        await refreshCloudSnapshot({replaceWorkspace:true});

        saveWorkspaceSnapshot();
        AppEvents.emit("session:updated");
        startCloudPolling();
        renderCloudSessionQR();

        showToast("Connected to session " + AppState.session.code,"success");
        navigateToCloudReceiving();
        return true;
    }
    catch(error){
        Logger.error("Cloud session join failed",error);
        showToast(error.message || "Unable to join session","error");
        return false;
    }
    finally{
        hideLoading();
        focusScannerInput();
    }
}

function navigateToCloudReceiving(){
    if(typeof navigateToPage === "function"){
        try{ navigateToPage("dashboard"); return; }catch(_){ }
    }
    const nav = document.querySelector('[data-page="dashboard"]');
    if(nav){ nav.click(); }
}

async function handleCloudJoinFromURL(){
    try{
        const params = new URLSearchParams(window.location.search);
        const code = params.get("session") || params.get("join");
        if(!code || isCloudSessionActive()){
            return;
        }
        const input = document.getElementById("cloudSessionCodeInput");
        if(input){ input.value = String(code).replace(/\D/g,""); }
        await joinCloudReceivingSession(code);
        if(window.history && window.history.replaceState){
            const clean = window.location.pathname + window.location.hash;
            window.history.replaceState({},document.title,clean);
        }
    }
    catch(error){
        Logger.error("QR session join failed",error);
    }
}

function getCloudJoinURL(){
    if(!AppState.session || !AppState.session.code){ return ""; }
    const base = window.location.origin + window.location.pathname;
    return base + "?session=" + encodeURIComponent(AppState.session.code);
}

function renderCloudSessionQR(){
    const canvas = document.getElementById("cloudSessionQR");
    const wrapper = document.getElementById("cloudSessionQRWrap");
    const codeText = document.getElementById("cloudSessionCodeDisplay");

    if(codeText){
        codeText.textContent = AppState.session.code || "------";
    }

    if(!canvas || !wrapper){ return; }

    if(!isCloudSessionActive() || !AppState.session.code){
        wrapper.classList.add("hidden");
        return;
    }

    wrapper.classList.remove("hidden");
    const url = getCloudJoinURL();

    canvas.innerHTML = "";

    if(typeof window.QRCode === "function"){
        try{
            new window.QRCode(canvas,{
                text:url,
                width:220,
                height:220,
                correctLevel:window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : undefined
            });
        }
        catch(error){
            Logger.error("Unable to render QR",error);
            canvas.textContent = "QR unavailable — use Session Number";
        }
    }
    else{
        Logger.error("QR library is unavailable");
        canvas.textContent = "QR unavailable — use Session Number";
    }
}

function queueCloudTransaction(transaction){
    if(!transaction || !isCloudSessionActive()){
        return;
    }

    const cloudId = transaction.cloudTransactionId || createBrowserUUID();
    const pending = {
        cloudTransactionId:cloudId,
        itemCode:normalizeItemCode(transaction.itemCode),
        quantity:toNumber(transaction.quantity,0),
        source:toSafeString(transaction.source),
        deviceId:AppState.session.deviceId,
        deviceType:AppState.session.role === "ZEBRA" ? "ZEBRA" : "PC",
        createdAt:transaction.dateTime || nowISO()
    };

    if(!pending.itemCode || !Number.isFinite(pending.quantity) || pending.quantity === 0){
        return;
    }

    if(!Array.isArray(AppState.session.pendingQueue)){
        AppState.session.pendingQueue = [];
    }

    if(!AppState.session.pendingQueue.some(x=>x.cloudTransactionId === cloudId)){
        AppState.session.pendingQueue.push(pending);
    }

    const local = (AppState.workspace.receivingHistory || []).find(
        x=>x.transactionId === transaction.transactionId
    );
    if(local){
        local.cloudTransactionId = cloudId;
        local.cloudSynced = false;
    }

    AppEvents.emit("session:updated");
    saveWorkspaceSnapshot();
    flushCloudPendingQueue();
}

function mapCloudActionType(source,quantity){
    if(quantity < 0){ return "manual_adjust"; }
    const value = String(source || "").toUpperCase();
    if(value.includes("SCAN")){ return "scan"; }
    if(value.includes("CORRECT")){ return "correction"; }
    return "manual_add";
}

async function sendPendingCloudTransaction(pending){
    await cloudRpc("record_receiving_transaction",{
        p_session_id:AppState.session.id,
        p_session_secret:AppState.session.secret,
        p_item_code:pending.itemCode,
        p_qty_change:pending.quantity,
        p_action_type:mapCloudActionType(pending.source,pending.quantity),
        p_device_id:pending.deviceId || AppState.session.deviceId,
        p_device_type:pending.deviceType || (AppState.session.role === "ZEBRA" ? "ZEBRA" : "PC"),
        p_transaction_id:pending.cloudTransactionId
    });
}

async function flushCloudPendingQueue(){
    if(!isCloudSessionActive() || !navigator.onLine){
        return false;
    }

    if(!Array.isArray(AppState.session.pendingQueue) || AppState.session.pendingQueue.length === 0){
        return true;
    }

    const queue = [...AppState.session.pendingQueue];
    let changed = false;

    for(const pending of queue){
        try{
            await sendPendingCloudTransaction(pending);
            AppState.session.pendingQueue = AppState.session.pendingQueue.filter(
                x=>x.cloudTransactionId !== pending.cloudTransactionId
            );

            const local = (AppState.workspace.receivingHistory || []).find(
                x=>x.cloudTransactionId === pending.cloudTransactionId
            );
            if(local){ local.cloudSynced = true; }
            changed = true;
        }
        catch(error){
            Logger.warn("Cloud transaction queued for retry",error);
            updateCloudConnectionUI("SYNC PENDING");
            break;
        }
    }

    if(changed){
        saveWorkspaceSnapshot();
        AppEvents.emit("session:updated");
    }

    if(AppState.session.pendingQueue.length === 0){
        updateCloudConnectionUI("SYNCED");
        refreshCloudSnapshot();
    }

    return AppState.session.pendingQueue.length === 0;
}

async function uploadExistingTransactionsToCloud(){
    const history = [...(AppState.workspace.receivingHistory || [])].reverse();
    if(history.length === 0){ return; }

    for(const transaction of history){
        if(transaction.cloudSynced === true){ continue; }
        const pending = {
            cloudTransactionId:transaction.cloudTransactionId || createBrowserUUID(),
            itemCode:normalizeItemCode(transaction.itemCode),
            quantity:toNumber(transaction.quantity,0),
            source:toSafeString(transaction.source),
            deviceId:transaction.deviceId || AppState.session.deviceId,
            deviceType:"PC",
            createdAt:transaction.dateTime || nowISO()
        };
        transaction.cloudTransactionId = pending.cloudTransactionId;
        await sendPendingCloudTransaction(pending);
        transaction.cloudSynced = true;
    }

    saveWorkspaceSnapshot();
}

function getPendingQuantityByItem(){
    const map = new Map();
    (AppState.session.pendingQueue || []).forEach(tx=>{
        const code = normalizeItemCode(tx.itemCode);
        map.set(code,(map.get(code)||0)+toNumber(tx.quantity,0));
    });
    return map;
}

async function refreshCloudSnapshot(options = {}){
    if(!isCloudSessionActive() || !navigator.onLine || CloudSyncEngine.pollRunning){
        return false;
    }

    CloudSyncEngine.pollRunning = true;

    try{
        const result = await cloudRpc("get_session_snapshot",{
            p_session_id:AppState.session.id,
            p_session_secret:AppState.session.secret
        });

        const rows = Array.isArray(result) ? result : [];
        const pendingByItem = getPendingQuantityByItem();

        CloudSyncEngine.applyingRemote = true;

        if(options.replaceWorkspace === true || AppState.workspace.orderData.length === 0){
            AppState.workspace.orderData = [];
            AppState.workspace.mappingData = (AppState.workspace.mappingData || []).filter(m=>m.source !== "CLOUD");
            if(options.replaceWorkspace === true){
                AppState.workspace.receivingHistory = [];
                AppState.workspace.lastScan = null;
            }
        }

        const existingByCode = new Map(
            (AppState.workspace.orderData || []).map(item=>[normalizeItemCode(item.itemCode),item])
        );

        rows.forEach(row=>{
            const code = normalizeItemCode(row.item_code);
            if(!code){ return; }

            let item = existingByCode.get(code);
            if(!item){
                item = {
                    itemCode:code,
                    itemName:toSafeString(row.item_name),
                    orderedQty:toNumber(row.ordered_qty,0),
                    receivedQty:0,
                    remainingQty:0,
                    status:APP_CONFIG.statuses.pending,
                    manual:false,
                    category:toSafeString(row.category || "")
                };
                AppState.workspace.orderData.push(item);
                existingByCode.set(code,item);
            }

            item.itemName = toSafeString(row.item_name || item.itemName);
            item.orderedQty = toNumber(row.ordered_qty,item.orderedQty || 0);
            item.category = toSafeString(row.category || item.category || "");
            item.receivedQty = Math.max(0,toNumber(row.received_qty,0)+(pendingByItem.get(code)||0));
            updateItemCalculatedFields(item);

            const gtins = Array.isArray(row.gtins)
                ? row.gtins
                : (row.gtins && typeof row.gtins === "string" ? safeParseJSON(row.gtins,[]) : []);
            const allGtins = [...gtins];
            if(row.gtin && !allGtins.includes(row.gtin)){ allGtins.push(row.gtin); }

            AppState.workspace.mappingData = AppState.workspace.mappingData.filter(
                mapping=>!(mapping.source === "CLOUD" && normalizeItemCode(mapping.itemCode) === code)
            );
            allGtins.forEach(gtin=>{
                const normalized = normalizeGTIN(gtin);
                if(normalized){
                    AppState.workspace.mappingData.push({itemCode:code,gtin:normalized,source:"CLOUD"});
                }
            });
        });

        if(rows.length > 0 && rows[0].transaction_count !== undefined){
            AppState.session.cloudTotalScans = toNumber(rows[0].transaction_count,0);
        }

        rebuildStateIndexes();
        recalculateStatistics();
        CloudSyncEngine.lastSnapshotAt = nowISO();
        AppState.session.lastSave = CloudSyncEngine.lastSnapshotAt;
        updateCloudConnectionUI(AppState.session.pendingQueue.length ? "SYNC PENDING" : "SYNCED");

        AppEvents.emit("receiving:updated",{cloudRefresh:true});
        AppEvents.emit("session:updated");
        saveWorkspaceSnapshot();
        return true;
    }
    catch(error){
        Logger.warn("Cloud snapshot refresh failed",error);
        updateCloudConnectionUI("CONNECTION ISSUE");
        return false;
    }
    finally{
        CloudSyncEngine.applyingRemote = false;
        CloudSyncEngine.pollRunning = false;
    }
}

function safeParseJSON(value,fallback){
    try{ return JSON.parse(value); }catch(_){ return fallback; }
}

function startCloudPolling(){
    stopCloudPolling();
    if(!isCloudSessionActive()){ return; }
    CloudSyncEngine.pollingTimer = setInterval(function(){
        if(document.visibilityState !== "hidden"){
            flushCloudPendingQueue();
            refreshCloudSnapshot();
        }
    },CLOUD_CONFIG.pollIntervalMs);
    renderCloudSessionQR();
}

function stopCloudPolling(){
    if(CloudSyncEngine.pollingTimer){
        clearInterval(CloudSyncEngine.pollingTimer);
        CloudSyncEngine.pollingTimer = null;
    }
}

function updateCloudConnectionUI(label){
    const element = document.getElementById("cloudSyncStatus");
    if(element){ element.textContent = label || "-"; }
}

function leaveCloudSession(){
    const wasZebra = !!(AppState.session && AppState.session.role === "ZEBRA");
    stopCloudPolling();

    if(wasZebra){
        /* A Zebra session is disposable working state. Once it ends,
           clear the local order/received quantities so a finished
           session can never leak into the next one. Historical/cloud
           records are not deleted by this client-side cleanup. */
        clearCurrentWorkspace();
        startNewWorkspace();
        deleteWorkspaceSnapshot();
    }

    AppState.session = {
        ...createEmptySession(),
        id:createSessionId(),
        deviceId:ensureDeviceId(),
        role:"LOCAL",
        createdAt:nowISO(),
        pendingQueue:[]
    };
    saveWorkspaceSnapshot();
    AppEvents.emit("session:updated");
    AppEvents.emit("workspace:cleared");
    renderCloudSessionQR();
    showToast(wasZebra ? "Session ended — Zebra quantities cleared" : "Cloud session disconnected","success");
}

window.initializeSupabaseCloud = initializeSupabaseCloud;
window.createCloudReceivingSession = createCloudReceivingSession;
window.joinCloudReceivingSession = joinCloudReceivingSession;
window.refreshCloudSnapshot = refreshCloudSnapshot;
window.flushCloudPendingQueue = flushCloudPendingQueue;
window.renderCloudSessionQR = renderCloudSessionQR;
window.leaveCloudSession = leaveCloudSession;

/* =====================================================
   PHASE 2B.2 — RESTORED ZEBRA SESSION SAFETY
===================================================== */
const PHASE2B2_LEGACY_ZEBRA_MIGRATION_KEY = "pharmflow_p2b2_legacy_zebra_migrated_v1";
const PHASE2B2_ZEBRA_RECOVERY_KEY = "pharmflow_p2b2_zebra_recovery_v1";

function backupAndClearLegacyZebraWorkspace(){
    try{
        if(!AppState || !AppState.session || AppState.session.role !== "ZEBRA" || AppState.session.cloud === true){ return false; }
        if(localStorage.getItem(PHASE2B2_LEGACY_ZEBRA_MIGRATION_KEY) === "1"){ return false; }
        localStorage.setItem(PHASE2B2_ZEBRA_RECOVERY_KEY, JSON.stringify({
            savedAt:nowISO(),
            reason:"Phase 2B.2 legacy Zebra cleanup",
            workspace:AppState.workspace,
            session:AppState.session
        }));
        localStorage.setItem(PHASE2B2_LEGACY_ZEBRA_MIGRATION_KEY,"1");
        clearCurrentWorkspace();
        startNewWorkspace();
        AppState.session = {...createEmptySession(),id:createSessionId(),deviceId:ensureDeviceId(),role:"LOCAL",createdAt:nowISO(),pendingQueue:[]};
        deleteWorkspaceSnapshot();
        saveWorkspaceSnapshot();
        AppEvents.emit("workspace:cleared");
        AppEvents.emit("session:updated");
        Logger.info("Legacy Zebra workspace cleared; recovery backup retained locally");
        return true;
    }catch(error){ Logger.warn("Legacy Zebra cleanup skipped",error); return false; }
}

function isInactiveCloudSessionError(error){
    const text=String(error && error.message || error || "").toLowerCase();
    return /inactive|closed|ended|expired|not found|invalid session|no longer active|session.*invalid/.test(text);
}

async function validateRestoredCloudSession(){
    if(!isCloudSessionActive() || !navigator.onLine){ return true; }
    try{
        await cloudRpc("get_session_snapshot",{p_session_id:AppState.session.id,p_session_secret:AppState.session.secret});
        return true;
    }catch(error){
        if(!isInactiveCloudSessionError(error)){ Logger.warn("Could not validate restored cloud session; keeping local state",error); return null; }
        const wasZebra=AppState.session.role === "ZEBRA";
        if(wasZebra){
            try{ localStorage.setItem(PHASE2B2_ZEBRA_RECOVERY_KEY,JSON.stringify({savedAt:nowISO(),reason:"Closed cloud Zebra session cleanup",workspace:AppState.workspace,session:AppState.session})); }catch(_){ }
        }
        stopCloudPolling();
        if(wasZebra){ clearCurrentWorkspace(); startNewWorkspace(); deleteWorkspaceSnapshot(); }
        AppState.session={...createEmptySession(),id:createSessionId(),deviceId:ensureDeviceId(),role:"LOCAL",createdAt:nowISO(),pendingQueue:[]};
        saveWorkspaceSnapshot();
        AppEvents.emit("workspace:cleared");
        AppEvents.emit("session:updated");
        renderCloudSessionQR();
        showToast("Previous Zebra session has ended — local quantities cleared","success");
        return false;
    }
}

window.validateRestoredCloudSession=validateRestoredCloudSession;
window.backupAndClearLegacyZebraWorkspace=backupAndClearLegacyZebraWorkspace;
