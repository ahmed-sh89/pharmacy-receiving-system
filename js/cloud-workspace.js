"use strict";

/* =====================================================
   PHARMFLOW PHASE 2C.7 — MULTI-PC CLOUD WORKSPACE
   Local-first receiving: UI changes immediately; small
   additive transactions synchronize in the background.
===================================================== */

const PharmFlowCloudWorkspace = {
    applyingRemote:false,
    initialized:false,
    pollTimer:null,
    saveTimer:null,
    lastCloudUpdate:null,
    pendingKey:"PHARMFLOW_CLOUD_TX_QUEUE_V1",
    deviceId:null
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
    const host=document.getElementById("orderScopeControl") || document.querySelector(".currentReceivingCard, .dashboardWorkspaceCard, .dashboardHeader");
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
    if(!navigator.onLine || !cloudWorkspacePharmacyId() || typeof authRpc!=="function"){
        if(readCloudQueue().length) setCloudWorkspaceStatus("offline");
        return;
    }
    const q=readCloudQueue(); if(!q.length){setCloudWorkspaceStatus("synced");return;}
    setCloudWorkspaceStatus("syncing");
    const remain=[];
    for(const tx of q){
        try{
            await authRpc("append_pharmflow_cloud_transaction",{
                p_pharmacy_id:cloudWorkspacePharmacyId(),
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
    if(PharmFlowCloudWorkspace.applyingRemote || !cloudWorkspacePharmacyId()) return;
    clearTimeout(PharmFlowCloudWorkspace.saveTimer);
    PharmFlowCloudWorkspace.saveTimer=setTimeout(saveCloudWorkspaceSnapshot,700);
}

async function saveCloudWorkspaceSnapshot(){
    if(!navigator.onLine || typeof authRpc!=="function") return;
    try{
        setCloudWorkspaceStatus("syncing");
        await authRpc("save_pharmflow_cloud_workspace",{
            p_pharmacy_id:cloudWorkspacePharmacyId(),
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
    let item=getItemByCode(code);
    if(!item){ return false; }
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
    if(!navigator.onLine || !cloudWorkspacePharmacyId() || typeof authRpc!=="function") return;
    try{
        const rows=await authRpc("list_pharmflow_cloud_transactions",{
            p_pharmacy_id:cloudWorkspacePharmacyId(), p_limit:1000
        });
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
    if(!navigator.onLine || !cloudWorkspacePharmacyId() || typeof authRpc!=="function") return;
    try{
        setCloudWorkspaceStatus("syncing");
        const result=await authRpc("get_pharmflow_cloud_workspace",{p_pharmacy_id:cloudWorkspacePharmacyId()});
        const row=Array.isArray(result)?result[0]:result;
        if(row && row.workspace && row.workspace.workspace && Array.isArray(row.workspace.workspace.orderData) && row.workspace.workspace.orderData.length){
            PharmFlowCloudWorkspace.applyingRemote=true;
            restoreWorkspaceState(row.workspace);
            saveWorkspaceSnapshot();
            if(typeof refreshAllUI==="function") refreshAllUI();
            PharmFlowCloudWorkspace.lastCloudUpdate=row.updated_at||null;
        }else if(AppState.workspace?.orderData?.length){
            await saveCloudWorkspaceSnapshot();
        }
        PharmFlowCloudWorkspace.applyingRemote=false;
        await pullCloudWorkspaceTransactions();
        await flushCloudWorkspaceQueue();
        setCloudWorkspaceStatus("synced");
    }catch(error){PharmFlowCloudWorkspace.applyingRemote=false;setCloudWorkspaceStatus("offline",error.message||"");}
}

function initializePharmFlowCloudWorkspace(){
    if(PharmFlowCloudWorkspace.initialized) return;
    PharmFlowCloudWorkspace.initialized=true;
    AppEvents.on("receiving:transaction",queueCloudWorkspaceTransaction);
    AppEvents.on("workspace:saved",scheduleCloudWorkspaceSnapshot);
    AppEvents.on("workspace:cleared",async()=>{
        if(typeof authRpc!=="function" || !cloudWorkspacePharmacyId()) return;
        try{await authRpc("clear_pharmflow_cloud_workspace",{p_pharmacy_id:cloudWorkspacePharmacyId()});writeCloudQueue([]);setCloudWorkspaceStatus("synced");}catch(_){}
    });
    window.addEventListener("online",()=>{flushCloudWorkspaceQueue();pullCloudWorkspaceTransactions();});
    window.addEventListener("offline",()=>setCloudWorkspaceStatus("offline"));
    window.addEventListener("auth:context-ready",()=>setTimeout(restoreCloudWorkspaceOnLogin,150));
    PharmFlowCloudWorkspace.pollTimer=setInterval(()=>{
        if(document.visibilityState==="visible"){flushCloudWorkspaceQueue();pullCloudWorkspaceTransactions();}
    },1500);
    if(cloudWorkspacePharmacyId()) setTimeout(restoreCloudWorkspaceOnLogin,250);
}

setTimeout(initializePharmFlowCloudWorkspace,100);
