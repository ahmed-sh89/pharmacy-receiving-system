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
    rpcTimeoutMs:9000
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
        if(typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice() && AppState.session.role === "ZEBRA"){
            setTimeout(validateRestoredZebraCloudSession, 80);
        }else{
            startCloudPolling();
            refreshCloudSnapshot();
        }
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
        /* Phase 2B.9: Supabase Global GTIN is authoritative. Refresh it
           before the PC publishes the order to a shared Handheld session. */
        if(typeof ensureGlobalMasterGTINReady === "function"){
            await ensureGlobalMasterGTINReady({forceCloud:true});
        }
        if(typeof applyMasterGTINToCurrentOrder === "function"){
            await applyMasterGTINToCurrentOrder({silent:true});
        }

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
        AppState.session.orderContextReady=true;
        AppState.session.syncedItemCount=buildCloudOrderItems().length;
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
    const gtinsByItem=new Map();

    (AppState.workspace.mappingData||[]).forEach(mapping=>{
        const code=normalizeItemCode(mapping.itemCode);
        const gtin=normalizeGTIN(mapping.gtin);
        if(!code||!gtin) return;
        if(!gtinsByItem.has(code)) gtinsByItem.set(code,[]);
        const list=gtinsByItem.get(code);
        if(!list.includes(gtin)) list.push(gtin);
    });

    /* Phase 2C.10.5.5 — the PC publishes exactly the Selected Orders context
       to the live Handheld session. This makes CONNECTED mean both transport
       connection AND correct receiving scope. */
    const selected=typeof getSelectedReceivingOrderNumbers==="function"
        ? getSelectedReceivingOrderNumbers()
        : [];
    const active=typeof getActiveReceivingOrderNumbers==="function"
        ? getActiveReceivingOrderNumbers()
        : [];
    const targetOrders=selected.length ? selected : active;
    const byCode=new Map();

    targetOrders.forEach(orderNumber=>{
        const rows=typeof getWorkspaceOrderSourceRows==="function"
            ? getWorkspaceOrderSourceRows(orderNumber)
            : [];

        rows.forEach(row=>{
            const code=normalizeItemCode(row?.itemCode||row?.item_code||"");
            if(!code) return;
            const current=byCode.get(code)||{
                item_code:code,
                item_name:toSafeString(row?.itemName||row?.item_name||""),
                category:toSafeString(row?.category||""),
                ordered_qty:0,
                order_numbers:[]
            };
            current.ordered_qty+=toNumber(row?.orderedQty??row?.ordered_qty,0);
            if(!current.order_numbers.includes(orderNumber)){
                current.order_numbers.push(orderNumber);
            }
            byCode.set(code,current);
        });
    });

    /* Compatibility fallback while an older workspace hydrates. */
    if(!byCode.size){
        (AppState.workspace.orderData||[]).forEach(item=>{
            const code=normalizeItemCode(item.itemCode);
            if(!code) return;
            byCode.set(code,{
                item_code:code,
                item_name:toSafeString(item.itemName),
                category:toSafeString(item.category||""),
                ordered_qty:toNumber(item.orderedQty,0),
                order_numbers:Array.isArray(item.orderNumbers)?item.orderNumbers:[]
            });
        });
    }

    return Array.from(byCode.values()).map(item=>{
        const gtins=gtinsByItem.get(item.item_code)||[];
        return {
            item_code:item.item_code,
            item_name:item.item_name,
            gtin:gtins[0]||"",
            gtins,
            category:item.category,
            ordered_qty:item.ordered_qty
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
    const code=String(sessionCode||"").replace(/\D/g,"").trim();

    if(!code){
        showToast("Enter the Session Code","warning");
        return false;
    }

    if(!navigator.onLine){
        showToast("Internet connection is required to join a cloud session","warning");
        return false;
    }

    if(CloudSyncEngine.joining===true){
        return false;
    }

    CloudSyncEngine.joining=true;
    showLoading("Joining shared session...");

    const deadline=Date.now()+12000;

    const withDeadline=(promise,label)=>{
        const remaining=Math.max(1,deadline-Date.now());

        return Promise.race([
            Promise.resolve(promise),
            new Promise((_,reject)=>setTimeout(
                ()=>reject(new Error(label||"Session connection timed out — try again")),
                remaining
            ))
        ]);
    };

    try{
        const result=await withDeadline(
            cloudRpc("join_receiving_session_by_code",{p_session_code:code}),
            "Session connection timed out — try again"
        );

        const session=Array.isArray(result)?result[0]:result;

        if(!session||!session.session_id||!session.session_secret){
            throw new Error("Session not found or no longer active");
        }

        AppState.session={
            ...createEmptySession(),
            id:session.session_id,
            code:String(session.session_code||code),
            secret:String(session.session_secret),
            cloud:true,
            role:"ZEBRA",
            deviceId:ensureDeviceId(),
            createdAt:nowISO(),
            lastSave:null,
            pendingQueue:[]
        };

        if(await withDeadline(
            isCloudSessionTerminatedOnServer(),
            "Session validation timed out — try again"
        )){
            resetZebraWorkingState?.("attempted-join-to-ended-session",{force:true});
            throw new Error("This PC session has already ended");
        }

        AppState.workspace.orderId=session.order_number||AppState.workspace.orderId;
        AppState.workspace.orderName=session.order_name||AppState.workspace.orderName||session.order_number||"Shared Order";
        AppState.workspace.active=true;

        await withDeadline(
            refreshCloudSnapshot({replaceWorkspace:true}),
            "Order sync timed out — try again"
        );

        if(!Array.isArray(AppState.workspace.orderData) || !AppState.workspace.orderData.length){
            throw new Error("Session connected but Order context did not load");
        }

        AppState.session.orderContextReady=true;
        AppState.session.syncedItemCount=AppState.workspace.orderData.length;
        updateCloudConnectionUI("READY TO SCAN");

        saveWorkspaceSnapshot();
        AppEvents.emit("session:updated");
        startCloudPolling();
        renderCloudSessionQR();

        /* Global Master refresh is useful but should never hold the worker
           on the Joining screen. Refresh after Receiving is already open. */
        if(typeof ensureGlobalMasterGTINReady==="function"){
            Promise.resolve()
                .then(()=>ensureGlobalMasterGTINReady({forceCloud:true}))
                .catch(error=>Logger.warn("Background Global GTIN refresh failed",error));
        }

        hideLoading();
        showToast("Connected","success");
        setZebraReceivingMode?.();
        navigateToCloudReceiving();

        return true;
    }
    catch(error){
        Logger.error("Cloud session join failed",error);

        if(AppState.session?.role==="ZEBRA"&&AppState.session?.cloud===true){
            resetZebraWorkingState?.("join-failed",{force:true});
        }

        if(typeof setZebraJoinMode==="function"){
            setZebraJoinMode();
        }

        showToast(error.message||"Unable to join session","error");
        return false;
    }
    finally{
        CloudSyncEngine.joining=false;
        hideLoading();
        try{ document.activeElement?.blur?.(); }catch(_){}
    }
}

function navigateToCloudReceiving(){
    if(typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice()){
        if(typeof setZebraReceivingMode === "function"){ setZebraReceivingMode(); }
        return;
    }
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
        codeText.textContent = isCloudSessionActive() ? "CONNECTED" : "INACTIVE";
    }

    if(!canvas || !wrapper){ return; }

    if(!isCloudSessionActive() || !AppState.session.code){
        wrapper.classList.add("hidden");
        return;
    }

    wrapper.classList.remove("hidden");
    /* Zebra hardware scanners should receive only the numeric Session Number.
       A URL can contain unrelated digits and break numeric join parsing. */
    const qrPayload = String(AppState.session.code || "");

    canvas.innerHTML = "";

    if(typeof window.QRCode === "function"){
        try{
            new window.QRCode(canvas,{
                text:qrPayload,
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


/* =====================================================
   PHASE 2B.6 — SERVER TERMINATION SIGNAL

   The legacy shared-session RPC keeps returning the last snapshot even after
   the PC locally disconnects. A tiny server-side termination registry gives
   every device one authoritative end-of-session signal without changing the
   existing receiving tables/RPCs.
===================================================== */

async function isCloudSessionTerminatedOnServer(){
    if(!isCloudSessionActive() || !navigator.onLine){
        return false;
    }

    const result = await cloudRpc("pharmflow_is_session_ended",{
        p_session_id:String(AppState.session.id || ""),
        p_session_secret:String(AppState.session.secret || "")
    });

    if(Array.isArray(result)){
        const row = result[0];
        if(typeof row === "boolean"){ return row; }
        if(row && typeof row.ended !== "undefined"){ return row.ended === true; }
        if(row && typeof row.is_ended !== "undefined"){ return row.is_ended === true; }
        return false;
    }

    if(typeof result === "boolean"){ return result; }
    if(result && typeof result.ended !== "undefined"){ return result.ended === true; }
    if(result && typeof result.is_ended !== "undefined"){ return result.is_ended === true; }
    return false;
}

async function markCloudSessionEndedOnServer(){
    if(!isCloudSessionActive()){
        return true;
    }
    if(!navigator.onLine){
        throw new Error("Internet connection is required to end the shared session");
    }

    await cloudRpc("pharmflow_end_session",{
        p_session_id:String(AppState.session.id || ""),
        p_session_secret:String(AppState.session.secret || ""),
        p_ended_by_device:String(AppState.session.deviceId || ensureDeviceId() || "PC")
    });
    return true;
}

function terminateZebraFromServer(reason = "server-session-ended"){
    if(typeof resetZebraWorkingState === "function"){
        resetZebraWorkingState(reason,{force:true});
    }
    if(typeof setZebraHomeMode === "function"){
        setZebraHomeMode();
    }
    updateCloudConnectionUI("SESSION ENDED");
    showToast("PC session ended — Handheld scan locked until you join a new session","warning");
}

async function refreshCloudSnapshot(options = {}){
    if(!isCloudSessionActive() || !navigator.onLine || CloudSyncEngine.pollRunning){
        return false;
    }

    CloudSyncEngine.pollRunning = true;

    try{
        const zebraJoinedForEndCheck = !!(
            typeof isLikelyZebraDevice === "function" &&
            isLikelyZebraDevice() &&
            AppState.session?.role === "ZEBRA" &&
            AppState.session?.cloud === true
        );

        if(zebraJoinedForEndCheck && await isCloudSessionTerminatedOnServer()){
            terminateZebraFromServer("server-termination-signal");
            return false;
        }

        const result = await cloudRpc("get_session_snapshot",{
            p_session_id:AppState.session.id,
            p_session_secret:AppState.session.secret
        });

        const rows = Array.isArray(result) ? result : [];

        /* Phase 2B.5: for a Zebra that was already joined, an empty snapshot
           means the server no longer exposes this receiving session as active.
           Do not leave the handheld in a local-only receiving state. */
        const zebraJoined = !!(
            typeof isLikelyZebraDevice === "function" &&
            isLikelyZebraDevice() &&
            AppState.session?.role === "ZEBRA" &&
            AppState.session?.cloud === true
        );
        if(zebraJoined && rows.length === 0){
            if(typeof resetZebraWorkingState === "function"){
                resetZebraWorkingState("server-session-ended", {force:true});
            }
            if(typeof setZebraHomeMode === "function"){ setZebraHomeMode(); }
            updateCloudConnectionUI("SESSION ENDED");
            showToast("PC session ended — Handheld scan locked until you join a new session","warning");
            return false;
        }

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

        /* Phase 2C.10.3.8: live session is the Handheld connection/order
           transport; the pharmacy-wide Receiving Ledger is the quantity
           authority for BOTH PC and Handheld. Overlay it after every session
           snapshot so a stale/legacy session transaction path can never
           overwrite synchronized Received Qty. */
        if(typeof repairSharedReceivingLedgerFromLocal === "function"){
            await repairSharedReceivingLedgerFromLocal();
        }
        if(typeof pullCloudWorkspaceTransactions === "function"){
            await pullCloudWorkspaceTransactions();
        }
        return true;
    }
    catch(error){
        /* A confirmed terminal session response is different from a network
           problem. Terminal = close Zebra immediately; network issue = preserve
           the current work and wait for reconnection. */
        const zebraJoined = !!(
            typeof isLikelyZebraDevice === "function" &&
            isLikelyZebraDevice() &&
            AppState.session?.role === "ZEBRA"
        );
        if(zebraJoined && isTerminalCloudSessionError(error)){
            Logger.info("PC session ended; closing Handheld receiving", error.message || error);
            if(typeof resetZebraWorkingState === "function"){
                resetZebraWorkingState("server-session-ended", {force:true});
            }
            if(typeof setZebraHomeMode === "function"){ setZebraHomeMode(); }
            updateCloudConnectionUI("SESSION ENDED");
            showToast("PC session ended — Handheld scan locked until you join a new session","warning");
            return false;
        }
        Logger.warn("Cloud snapshot refresh failed",error);
        updateCloudConnectionUI("CONNECTION ISSUE");
        return false;
    }
    finally{
        CloudSyncEngine.applyingRemote = false;
        CloudSyncEngine.pollRunning = false;
    }
}


function isTerminalCloudSessionError(error){
    const message = String(error && error.message ? error.message : error || "").toLowerCase();
    return /not found|no longer active|closed|ended|inactive|invalid session|invalid secret|expired/.test(message);
}

async function validateRestoredZebraCloudSession(){
    if(!(typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice())){ return true; }
    if(!(AppState.session?.role === "ZEBRA" && isCloudSessionActive())){ return false; }

    if(!navigator.onLine){
        /* Never destroy Handheld work merely because the network is temporarily unavailable. */
        updateCloudConnectionUI("OFFLINE");
        if(typeof setZebraReceivingMode === "function"){ setZebraReceivingMode(); }
        return null;
    }

    try{
        if(await isCloudSessionTerminatedOnServer()){
            terminateZebraFromServer("restored-session-termination-signal");
            return false;
        }

        const result = await cloudRpc("get_session_snapshot",{
            p_session_id:AppState.session.id,
            p_session_secret:AppState.session.secret
        });
        if(!Array.isArray(result)){ throw new Error("Invalid session response"); }
        startCloudPolling();
        await refreshCloudSnapshot({replaceWorkspace:true});
        if(typeof setZebraReceivingMode === "function"){ setZebraReceivingMode(); }
        return true;
    }catch(error){
        if(isTerminalCloudSessionError(error)){
            Logger.info("Closed/stale Handheld session removed", error.message || error);
            if(typeof resetZebraWorkingState === "function"){ resetZebraWorkingState("closed-cloud-session", {force:true}); }
            if(typeof setZebraHomeMode === "function"){ setZebraHomeMode(); }
            showToast("Previous Handheld session has ended — ready for a new task","success");
            return false;
        }
        Logger.warn("Unable to validate Handheld session; local work preserved", error);
        updateCloudConnectionUI("CONNECTION ISSUE");
        if(typeof setZebraReceivingMode === "function"){ setZebraReceivingMode(); }
        return null;
    }
}

function safeParseJSON(value,fallback){
    try{ return JSON.parse(value); }catch(_){ return fallback; }
}

function startCloudPolling(){
    stopCloudPolling();
    if(!isCloudSessionActive()){ return; }
    const intervalMs = (
        typeof isLikelyZebraDevice === "function" &&
        isLikelyZebraDevice() &&
        AppState.session?.role === "ZEBRA"
    ) ? 700 : CLOUD_CONFIG.pollIntervalMs;

    CloudSyncEngine.pollingTimer = setInterval(function(){
        if(document.visibilityState !== "hidden"){
            flushCloudPendingQueue();
            refreshCloudSnapshot();
        }
    },intervalMs);
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

async function leaveCloudSession(){
    const wasZebra = !!(AppState.session && AppState.session.role === "ZEBRA");
    const wasPC = !!(AppState.session && AppState.session.role === "PC" && AppState.session.cloud === true);

    /* Handheld leaving Receiving must only detach that handheld. It must never end
       the PC-owned shared session for other devices. */
    if(wasZebra){
        stopCloudPolling();
        const pending = Array.isArray(AppState.session.pendingQueue) ? AppState.session.pendingQueue.length : 0;
        if(pending > 0){
            showToast("Sync pending Handheld work before leaving this session","warning");
            startCloudPolling();
            return false;
        }
        if(typeof resetZebraWorkingState === "function"){
            resetZebraWorkingState("zebra-session-left",{force:true});
        }
        if(typeof setZebraHomeMode === "function"){ setZebraHomeMode(); }
        renderCloudSessionQR();
        showToast("Handheld disconnected — ready for a new task","success");
        return true;
    }

    /* PC Disconnect is the authoritative END SESSION action. Do not clear the
       PC locally until Supabase has recorded the termination. Otherwise Handheld
       would continue accepting scans against a session the PC can no longer see. */
    if(wasPC){
        if(!navigator.onLine){
            showToast("Internet connection is required to end the shared session","warning");
            return false;
        }

        try{
            showLoading("Ending shared session...");
            await flushCloudPendingQueue();
            await markCloudSessionEndedOnServer();
        }
        catch(error){
            Logger.error("Unable to end shared session on server",error);
            showToast(error.message || "Unable to end shared session — please try again","error");
            return false;
        }
        finally{
            hideLoading();
        }
    }

    stopCloudPolling();
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
    /* Ending/detaching a live Handheld session is NOT a Current Workspace reset.
       Never emit workspace:cleared here; that event historically caused shared
       Orders/Receiving state to be deleted by unrelated cleanup logic. */
    renderCloudSessionQR();
    showToast(wasPC ? "Shared session ended on all devices" : "Cloud session disconnected","success");
    return true;
}

window.initializeSupabaseCloud = initializeSupabaseCloud;
window.createCloudReceivingSession = createCloudReceivingSession;
window.joinCloudReceivingSession = joinCloudReceivingSession;
window.refreshCloudSnapshot = refreshCloudSnapshot;
window.flushCloudPendingQueue = flushCloudPendingQueue;
window.renderCloudSessionQR = renderCloudSessionQR;
window.leaveCloudSession = leaveCloudSession;
window.isCloudSessionTerminatedOnServer = isCloudSessionTerminatedOnServer;
window.markCloudSessionEndedOnServer = markCloudSessionEndedOnServer;
