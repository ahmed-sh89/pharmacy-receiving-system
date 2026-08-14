"use strict";

/* =====================================================
   PHARMFLOW PHASE 2C.7.1 — MULTI-PC CLOUD WORKSPACE FIX
   - Never overwrite cloud workspace from a fresh empty PC
   - Hydrate as soon as Auth context + AppState are both ready
   - Keep local-first scan speed
===================================================== */

const PharmFlowCloudWorkspace = {
    applyingRemote:false,
    initialized:false,
    pollTimer:null,
    saveTimer:null,
    contextWatchTimer:null,
    lastCloudUpdate:null,
    pendingKey:"PHARMFLOW_CLOUD_TX_QUEUE_V1",
    deviceId:null,
    hydratedPharmacyId:null,
    hydrationPromise:null
};

function cloudWorkspacePharmacyId(){
    return (typeof AuthState!=="undefined" && AuthState.context) ? AuthState.context.pharmacy_id : null;
}

function cloudWorkspaceDeviceId(){
    if(PharmFlowCloudWorkspace.deviceId) return PharmFlowCloudWorkspace.deviceId;
    PharmFlowCloudWorkspace.deviceId = (typeof ensureDeviceId==="function" ? ensureDeviceId() : (crypto.randomUUID?.() || String(Date.now())));
    return PharmFlowCloudWorkspace.deviceId;
}

function setCloudWorkspaceStatus(state, detail=""){
    document.documentElement.dataset.cloudWorkspaceState=state;
    let el=document.getElementById("cloudWorkspaceStatus");
    const host=document.getElementById("orderScopeControl") || document.querySelector(".currentReceivingCard, .dashboardWorkspaceCard, .dashboardHeader, .topBarRight");
    if(host && !el){
        el=document.createElement("span"); el.id="cloudWorkspaceStatus"; el.className="cloudWorkspaceStatus"; host.appendChild(el);
    }
    if(el){
        el.textContent = state==="synced" ? "● SYNCED" : state==="syncing" ? "● SYNCING" : state==="offline" ? "● OFFLINE — PENDING SYNC" : "● CLOUD";
        el.title=detail||"PharmFlow Cloud Workspace";
    }
}

function readCloudQueue(){
    try{return JSON.parse(localStorage.getItem(PharmFlowCloudWorkspace.pendingKey)||"[]")||[];}catch(_){return [];}
}
function writeCloudQueue(rows){
    try{localStorage.setItem(PharmFlowCloudWorkspace.pendingKey,JSON.stringify(rows||[]));}catch(_){}
}
function queueCloudWorkspaceTransaction(tx){
    if(!tx || PharmFlowCloudWorkspace.applyingRemote) return;
    const q=readCloudQueue();
    if(!q.some(x=>x.transactionId===tx.transactionId)) q.push(tx);
    writeCloudQueue(q);
    flushCloudWorkspaceQueue();
}

async function flushCloudWorkspaceQueue(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function"){
        if(readCloudQueue().length) setCloudWorkspaceStatus("offline");
        return;
    }
    const q=readCloudQueue(); if(!q.length){setCloudWorkspaceStatus("synced");return;}
    setCloudWorkspaceStatus("syncing");
    const remain=[];
    for(const tx of q){
        try{
            await authRpc("append_pharmflow_cloud_transaction",{
                p_pharmacy_id:pharmacyId,
                p_transaction_id:tx.transactionId,
                p_order_number:toSafeString(tx.orderId||""),
                p_item_code:toSafeString(tx.itemCode||""),
                p_item_name:toSafeString(tx.itemName||""),
                p_gtin:toSafeString(tx.gtin||""),
                p_quantity:toNumber(tx.quantity,0),
                p_source:toSafeString(tx.source||"RECEIVING"),
                p_device_id:cloudWorkspaceDeviceId(),
                p_occurred_at:tx.dateTime||nowISO(),
                p_payload:tx
            });
        }catch(error){remain.push(tx);}
    }
    writeCloudQueue(remain);
    setCloudWorkspaceStatus(remain.length ? (navigator.onLine?"syncing":"offline") : "synced");
}

function scheduleCloudWorkspaceSnapshot(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(PharmFlowCloudWorkspace.applyingRemote || !pharmacyId) return;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId) return;
    clearTimeout(PharmFlowCloudWorkspace.saveTimer);
    PharmFlowCloudWorkspace.saveTimer=setTimeout(saveCloudWorkspaceSnapshot,700);
}

async function saveCloudWorkspaceSnapshot(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || typeof authRpc!=="function" || !pharmacyId) return;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId) return;
    /* Explicit clear has its own RPC. A fresh empty PC must never erase the cloud. */
    if(!Array.isArray(AppState?.workspace?.orderData) || !AppState.workspace.orderData.length) return;
    try{
        setCloudWorkspaceStatus("syncing");
        await authRpc("save_pharmflow_cloud_workspace",{
            p_pharmacy_id:pharmacyId,
            p_workspace:serializeCurrentWorkspace(),
            p_device_id:cloudWorkspaceDeviceId()
        });
        setCloudWorkspaceStatus("synced");
    }catch(error){setCloudWorkspaceStatus("offline",error.message||"");}
}

function applyCloudTransaction(tx){
    const id=toSafeString(tx.transaction_id||tx.transactionId||"");
    if(!id || AppState.indexes.transactionIds.has(id)) return false;
    const code=normalizeItemCode(tx.item_code||tx.itemCode||"");
    const item=getItemByCode(code);
    if(!item) return false;
    const qty=toNumber(tx.quantity,0);
    item.receivedQty=Math.max(0,toNumber(item.receivedQty,0)+qty);
    updateItemCalculatedFields(item);
    addReceivingTransaction({
        transactionId:id, orderId:tx.order_number||tx.orderId||AppState.workspace.orderId,
        dateTime:tx.occurred_at||tx.dateTime||nowISO(), itemCode:code,
        itemName:tx.item_name||tx.itemName||item.itemName, gtin:tx.gtin||"", quantity:qty,
        source:tx.source||"CLOUD", deviceId:tx.device_id||"REMOTE", manual:item.manual===true,
        cloudSynced:true
    });
    return true;
}

async function pullCloudWorkspaceTransactions(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return;
    /* Transactions cannot be applied until this PC has the order rows. */
    if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId) return;
    try{
        const rows=await authRpc("list_pharmflow_cloud_transactions",{p_pharmacy_id:pharmacyId,p_limit:1000});
        let changed=false;
        PharmFlowCloudWorkspace.applyingRemote=true;
        for(const tx of (Array.isArray(rows)?rows:[]).slice().reverse()) changed=applyCloudTransaction(tx)||changed;
        if(changed){
            rebuildStateIndexes(); recalculateStatistics();
            AppEvents.emit("receiving:updated",{source:"cloud"});
            if(typeof refreshAllUI==="function") refreshAllUI();
            saveWorkspaceSnapshot();
        }
    }catch(_){} finally{PharmFlowCloudWorkspace.applyingRemote=false;}
}

async function restoreCloudWorkspaceOnLogin(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return false;
    if(typeof AppState==="undefined" || !AppState.workspace) return false;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId===pharmacyId) return true;
    if(PharmFlowCloudWorkspace.hydrationPromise) return PharmFlowCloudWorkspace.hydrationPromise;

    PharmFlowCloudWorkspace.hydrationPromise=(async()=>{
        try{
            setCloudWorkspaceStatus("syncing");
            const result=await authRpc("get_pharmflow_cloud_workspace",{p_pharmacy_id:pharmacyId});
            const row=Array.isArray(result)?result[0]:result;
            const cloudState=row?.workspace;
            const cloudHasOrder=cloudState?.workspace && Array.isArray(cloudState.workspace.orderData) && cloudState.workspace.orderData.length>0;
            const localHasOrder=Array.isArray(AppState.workspace?.orderData) && AppState.workspace.orderData.length>0;

            if(cloudHasOrder){
                PharmFlowCloudWorkspace.applyingRemote=true;
                restoreWorkspaceState(cloudState);
                /* Last Scan is intentionally device-local. A remote PC must not
                   replace the operator's current Last Scan card. */
                const localDevice=cloudWorkspaceDeviceId();
                const localTx=(AppState.workspace.receivingHistory||[]).filter(tx=>toSafeString(tx.deviceId||"")===toSafeString(localDevice)).sort((a,b)=>new Date(b.dateTime||0)-new Date(a.dateTime||0))[0];
                if(localTx){
                    const localItem=getItemByCode(localTx.itemCode);
                    if(localItem && typeof setLastScan==="function") setLastScan({itemCode:localItem.itemCode,itemName:localItem.itemName,gtin:localTx.gtin||"",lot:localTx.lot||"",expiry:localTx.expiry||"",serial:localTx.serial||"",quantity:localTx.quantity,orderedQty:localItem.orderedQty,receivedQty:localItem.receivedQty,remainingQty:localItem.remainingQty,status:localItem.status,source:localTx.source,transactionId:localTx.transactionId,scanTime:localTx.dateTime});
                } else { AppState.workspace.lastScan=null; }
                saveWorkspaceSnapshot();
                if(typeof refreshAllUI==="function") refreshAllUI();
                PharmFlowCloudWorkspace.lastCloudUpdate=row.updated_at||null;
                PharmFlowCloudWorkspace.applyingRemote=false;
            }

            /* Mark hydrated BEFORE bootstrap-saving the original PC local order. */
            PharmFlowCloudWorkspace.hydratedPharmacyId=pharmacyId;

            if(!cloudHasOrder && localHasOrder){
                await saveCloudWorkspaceSnapshot();
            }

            await pullCloudWorkspaceTransactions();
            await flushCloudWorkspaceQueue();
            setCloudWorkspaceStatus("synced");
            return true;
        }catch(error){
            PharmFlowCloudWorkspace.applyingRemote=false;
            setCloudWorkspaceStatus("offline",error.message||"");
            return false;
        }finally{
            PharmFlowCloudWorkspace.hydrationPromise=null;
        }
    })();
    return PharmFlowCloudWorkspace.hydrationPromise;
}

function attemptCloudWorkspaceHydration(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!pharmacyId || typeof AppState==="undefined" || !AppState.workspace) return;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId) restoreCloudWorkspaceOnLogin();
}

function initializePharmFlowCloudWorkspace(){
    if(PharmFlowCloudWorkspace.initialized) return;
    PharmFlowCloudWorkspace.initialized=true;
    AppEvents.on("receiving:transaction",queueCloudWorkspaceTransaction);
    AppEvents.on("workspace:saved",scheduleCloudWorkspaceSnapshot);
    AppEvents.on("workspace:cleared",async()=>{
        const pharmacyId=cloudWorkspacePharmacyId();
        if(typeof authRpc!=="function" || !pharmacyId) return;
        try{
            await authRpc("clear_pharmflow_cloud_workspace",{p_pharmacy_id:pharmacyId});
            writeCloudQueue([]); setCloudWorkspaceStatus("synced");
            PharmFlowCloudWorkspace.hydratedPharmacyId=pharmacyId;
        }catch(_){}
    });
    window.addEventListener("online",()=>{attemptCloudWorkspaceHydration();flushCloudWorkspaceQueue();pullCloudWorkspaceTransactions();});
    window.addEventListener("offline",()=>setCloudWorkspaceStatus("offline"));
    window.addEventListener("auth:context-ready",()=>setTimeout(attemptCloudWorkspaceHydration,0));

    /* Auth can finish before this script receives the context-ready event.
       This watcher closes that race and also waits for AppState initialization. */
    PharmFlowCloudWorkspace.contextWatchTimer=setInterval(attemptCloudWorkspaceHydration,250);
    PharmFlowCloudWorkspace.pollTimer=setInterval(()=>{
        if(document.visibilityState==="visible"){
            attemptCloudWorkspaceHydration();
            flushCloudWorkspaceQueue();
            pullCloudWorkspaceTransactions();
        }
    },1500);
    attemptCloudWorkspaceHydration();
}

/* Bind immediately; do not wait 100 ms and risk missing auth:context-ready. */
initializePharmFlowCloudWorkspace();
