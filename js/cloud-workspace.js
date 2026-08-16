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
    hydrationPromise:null,
    generation:null,
    generationCheckBusy:false,
    suppressNextClearRpc:false,
    activeAccountScope:"",
    reconcilePromise:null,
    lastAppliedWorkspaceSignature:"",
    contextSwitching:false
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

function cloudQueueStorageKey(){
    const scope =
        typeof getAuthenticatedWorkspaceScope==="function"
            ? getAuthenticatedWorkspaceScope()
            : "";

    return scope
        ? `${PharmFlowCloudWorkspace.pendingKey}__${scope}`
        : `${PharmFlowCloudWorkspace.pendingKey}__NO_AUTH_CONTEXT`;
}

function readCloudQueue(){
    try{
        return JSON.parse(
            localStorage.getItem(cloudQueueStorageKey()) || "[]"
        ) || [];
    }catch(_){
        return [];
    }
}

function writeCloudQueue(rows){
    try{
        localStorage.setItem(
            cloudQueueStorageKey(),
            JSON.stringify(rows||[])
        );
    }catch(_){}
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



function currentCloudAccountScope(){
    return typeof getAuthenticatedWorkspaceScope==="function"
        ? getAuthenticatedWorkspaceScope()
        : "";
}

function stopCloudWorkspacePendingOperations(){
    cancelPendingCloudWorkspaceSave?.();

    PharmFlowCloudWorkspace.hydrationPromise=null;
    PharmFlowCloudWorkspace.reconcilePromise=null;
    PharmFlowCloudWorkspace.generationCheckBusy=false;
    PharmFlowCloudWorkspace.applyingRemote=false;
}

function resetRuntimeForAuthenticatedContextChange(newScope){
    if(!newScope) return false;

    const oldScope=String(
        PharmFlowCloudWorkspace.activeAccountScope || ""
    );

    if(oldScope===newScope){
        return false;
    }

    PharmFlowCloudWorkspace.contextSwitching=true;

    try{
        stopCloudWorkspacePendingOperations();

        /* The OLD queue remains under the old account-scoped key.
           The new account starts with its own isolated queue. */
        PharmFlowCloudWorkspace.deviceId=null;
        PharmFlowCloudWorkspace.hydratedPharmacyId=null;
        PharmFlowCloudWorkspace.lastCloudUpdate=null;
        PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature="";
        PharmFlowCloudWorkspace.generation=null;
        PharmFlowCloudWorkspace.suppressNextClearRpc=true;

        if(typeof AppState!=="undefined"){
            AppState.workspace=createEmptyWorkspace();
            AppState.session=createEmptySession();

            if(AppState.archive){
                AppState.archive.orders=[];
                AppState.archive.transactions=[];
            }

            if(typeof resetStatistics==="function"){
                resetStatistics();
            }
            if(typeof rebuildStateIndexes==="function"){
                rebuildStateIndexes();
            }
        }

        /* Restore ONLY the local cache that belongs to the new
           authenticated pharmacy+user. Never the previous account. */
        let restored=false;
        try{
            restored=
                typeof loadWorkspaceSnapshot==="function"
                    ? loadWorkspaceSnapshot()
                    : false;
        }catch(_){
            restored=false;
        }

        if(!restored && typeof AppState!=="undefined"){
            AppState.workspace=createEmptyWorkspace();
            AppState.session=createEmptySession();
            ensureDeviceId?.();
            resetStatistics?.();
            rebuildStateIndexes?.();
        }

        PharmFlowCloudWorkspace.activeAccountScope=newScope;

        try{
            localStorage.setItem(
                "PHARMFLOW_LAST_AUTH_ACCOUNT_SCOPE_V1",
                newScope
            );
        }catch(_){}

        if(typeof refreshEntireUI==="function"){
            refreshEntireUI();
        }

        return true;
    }finally{
        PharmFlowCloudWorkspace.contextSwitching=false;
    }
}

function ensureCloudAccountContextIsolation(){
    const scope=currentCloudAccountScope();

    if(!scope){
        return false;
    }

    return resetRuntimeForAuthenticatedContextChange(scope);
}

function stableCloudWorkspaceSignature(cloudState,row){
    try{
        const workspace=cloudState?.workspace || {};

        const signatureObject={
            pharmacy:cloudWorkspacePharmacyId()||"",
            orderId:workspace.orderId||"",
            orderName:workspace.orderName||"",
            active:!!workspace.active,
            orderFiles:(workspace.orderFiles||[]).map(file=>[
                file?.documentId||file?.orderNumber||"",
                file?.name||"",
                file?.rowCount||0
            ]),
            orderData:(workspace.orderData||[]).map(item=>[
                item?.itemCode||"",
                Number(item?.orderedQty||0),
                Number(item?.receivedQty||0),
                !!item?.manual
            ]),
            transactionCount:(workspace.receivingHistory||[]).length,
            generation:Number(PharmFlowCloudWorkspace.generation||0)
        };

        return JSON.stringify(signatureObject);
    }catch(_){
        return String(row?.updated_at||"");
    }
}

window.ensureCloudAccountContextIsolation=ensureCloudAccountContextIsolation;


async function getCloudWorkspaceGeneration(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return null;

    const value=await authRpc("get_pharmflow_workspace_generation",{
        p_pharmacy_id:pharmacyId
    });

    const generation=Number(
        Array.isArray(value) ? value[0] : value
    );

    return Number.isFinite(generation) ? generation : 0;
}

function cancelPendingCloudWorkspaceSave(){
    if(PharmFlowCloudWorkspace.saveTimer){
        clearTimeout(PharmFlowCloudWorkspace.saveTimer);
        PharmFlowCloudWorkspace.saveTimer=null;
    }
}

function clearLocalWorkspaceFromRemoteReset(newGeneration){
    cancelPendingCloudWorkspaceSave();
    writeCloudQueue([]);

    PharmFlowCloudWorkspace.applyingRemote=true;
    PharmFlowCloudWorkspace.suppressNextClearRpc=true;

    if(typeof resetOperationalStateToDefault==="function"){
        resetOperationalStateToDefault();
    }else{
        clearCurrentWorkspace();
        AppState.session=createEmptySession();
        deleteWorkspaceSnapshot();
    }

    PharmFlowCloudWorkspace.generation=Number(newGeneration||0);
    PharmFlowCloudWorkspace.lastCloudUpdate=null;
    PharmFlowCloudWorkspace.applyingRemote=false;

    if(typeof refreshAllUI==="function") refreshAllUI();
    if(typeof navigateTo==="function") navigateTo("dashboard");
    setCloudWorkspaceStatus("synced","Current workspace reset from another PC");
}

async function reconcileWorkspaceGeneration(){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function" ||
        PharmFlowCloudWorkspace.generationCheckBusy
    ){
        return false;
    }

    PharmFlowCloudWorkspace.generationCheckBusy=true;

    try{
        const serverGeneration=await getCloudWorkspaceGeneration();

        if(serverGeneration===null) return false;

        if(PharmFlowCloudWorkspace.generation===null){
            PharmFlowCloudWorkspace.generation=serverGeneration;
            return true;
        }

        if(Number(serverGeneration)!==Number(PharmFlowCloudWorkspace.generation)){
            clearLocalWorkspaceFromRemoteReset(serverGeneration);
            return true;
        }

        return false;
    }catch(error){
        Logger.warn("Workspace generation check failed",error);
        return false;
    }finally{
        PharmFlowCloudWorkspace.generationCheckBusy=false;
    }
}

window.reconcileWorkspaceGeneration=reconcileWorkspaceGeneration;


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
        if(PharmFlowCloudWorkspace.generation===null){
            PharmFlowCloudWorkspace.generation=await getCloudWorkspaceGeneration();
        }

        await authRpc("save_pharmflow_cloud_workspace_guarded",{
            p_pharmacy_id:pharmacyId,
            p_workspace:serializeCurrentWorkspace(),
            p_device_id:cloudWorkspaceDeviceId(),
            p_expected_generation:Number(PharmFlowCloudWorkspace.generation||0)
        });

        setCloudWorkspaceStatus("synced");
    }catch(error){
        const message=String(error?.message||"");

        if(message.includes("WORKSPACE_RESET_CONFLICT")){
            cancelPendingCloudWorkspaceSave();
            await reconcileWorkspaceGeneration();
            return;
        }

        setCloudWorkspaceStatus("offline",message);
    }
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
    ensureCloudAccountContextIsolation();

    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return false;
    if(typeof AppState==="undefined" || !AppState.workspace) return false;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId===pharmacyId) return true;
    if(PharmFlowCloudWorkspace.hydrationPromise) return PharmFlowCloudWorkspace.hydrationPromise;

    PharmFlowCloudWorkspace.hydrationPromise=(async()=>{
        try{
            setCloudWorkspaceStatus("syncing");

            const serverGeneration=await getCloudWorkspaceGeneration();
            if(serverGeneration!==null){
                PharmFlowCloudWorkspace.generation=serverGeneration;
            }

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
                PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature=
                    stableCloudWorkspaceSignature(cloudState,row);
                PharmFlowCloudWorkspace.applyingRemote=false;
            }

            /* Mark hydrated BEFORE bootstrap-saving the original PC local order. */
            PharmFlowCloudWorkspace.hydratedPharmacyId=pharmacyId;

            if(!cloudHasOrder && localHasOrder){
                /* Server is authoritative after sign-in. A stale browser must
                   never resurrect a locally-cached order that another PC
                   finalized or deleted. */
                PharmFlowCloudWorkspace.applyingRemote=true;
                clearCurrentWorkspace();
                startNewWorkspace();
                deleteWorkspaceSnapshot();
                saveWorkspaceSnapshot();
                if(typeof refreshAllUI==="function") refreshAllUI();
                PharmFlowCloudWorkspace.applyingRemote=false;
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


async function reconcileCloudWorkspaceAuthority(){
    ensureCloudAccountContextIsolation();

    if(PharmFlowCloudWorkspace.reconcilePromise){
        return PharmFlowCloudWorkspace.reconcilePromise;
    }

    PharmFlowCloudWorkspace.reconcilePromise=(async()=>{
        const pharmacyId=cloudWorkspacePharmacyId();

        const resetDetected=await reconcileWorkspaceGeneration();
        if(resetDetected){
            if(typeof restoreHistoricalArchive==="function"){
                restoreHistoricalArchive().catch?.(()=>{});
            }
            return true;
        }

        if(
            !navigator.onLine ||
            !pharmacyId ||
            typeof authRpc!=="function" ||
            PharmFlowCloudWorkspace.applyingRemote ||
            PharmFlowCloudWorkspace.contextSwitching ||
            PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId
        ){
            return false;
        }

        if(PharmFlowCloudWorkspace.saveTimer){
            return false;
        }

        try{
            const result=await authRpc(
                "get_pharmflow_cloud_workspace",
                {p_pharmacy_id:pharmacyId}
            );

            const row=Array.isArray(result)?result[0]:result;
            const cloudState=row?.workspace;

            const cloudHasOrder=!!(
                cloudState?.workspace &&
                Array.isArray(cloudState.workspace.orderData) &&
                cloudState.workspace.orderData.length
            );

            const localHasOrder=!!(
                Array.isArray(AppState?.workspace?.orderData) &&
                AppState.workspace.orderData.length
            );

            if(cloudHasOrder){
                const signature=stableCloudWorkspaceSignature(
                    cloudState,
                    row
                );

                const changed=
                    signature !==
                    String(
                        PharmFlowCloudWorkspace
                            .lastAppliedWorkspaceSignature || ""
                    );

                if(changed || !localHasOrder){
                    PharmFlowCloudWorkspace.applyingRemote=true;

                    restoreWorkspaceState(cloudState);

                    /* Last Scan is device-local. */
                    AppState.workspace.lastScan=null;

                    saveWorkspaceSnapshot();

                    PharmFlowCloudWorkspace.lastCloudUpdate=
                        row?.updated_at || null;

                    PharmFlowCloudWorkspace
                        .lastAppliedWorkspaceSignature=signature;

                    if(typeof refreshEntireUI==="function"){
                        refreshEntireUI();
                    }

                    PharmFlowCloudWorkspace.applyingRemote=false;
                }
            }
            else if(localHasOrder){
                PharmFlowCloudWorkspace.applyingRemote=true;

                clearCurrentWorkspace();
                startNewWorkspace();
                deleteWorkspaceSnapshot();
                saveWorkspaceSnapshot();

                PharmFlowCloudWorkspace
                    .lastAppliedWorkspaceSignature="EMPTY";

                if(typeof refreshEntireUI==="function"){
                    refreshEntireUI();
                }

                PharmFlowCloudWorkspace.applyingRemote=false;
            }

            return true;
        }
        catch(error){
            Logger.warn(
                "Cloud authority reconciliation failed",
                error
            );
            return false;
        }
        finally{
            PharmFlowCloudWorkspace.applyingRemote=false;
        }
    })();

    try{
        return await PharmFlowCloudWorkspace.reconcilePromise;
    }finally{
        PharmFlowCloudWorkspace.reconcilePromise=null;
    }
}

window.reconcileCloudWorkspaceAuthority=
    reconcileCloudWorkspaceAuthority;

function attemptCloudWorkspaceHydration(){
    ensureCloudAccountContextIsolation();

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

        if(PharmFlowCloudWorkspace.suppressNextClearRpc){
            PharmFlowCloudWorkspace.suppressNextClearRpc=false;
            writeCloudQueue([]);
            setCloudWorkspaceStatus("synced");
            PharmFlowCloudWorkspace.hydratedPharmacyId=pharmacyId;
            return;
        }

        if(typeof authRpc!=="function" || !pharmacyId) return;

        try{
            /* Legacy safety path only. Explicit user Reset uses the atomic RPC. */
            await authRpc("clear_pharmflow_cloud_workspace",{p_pharmacy_id:pharmacyId});
            writeCloudQueue([]);
            setCloudWorkspaceStatus("synced");
            PharmFlowCloudWorkspace.hydratedPharmacyId=pharmacyId;
        }catch(_){}
    });
    window.addEventListener("online",()=>{attemptCloudWorkspaceHydration();flushCloudWorkspaceQueue();pullCloudWorkspaceTransactions();});
    window.addEventListener("offline",()=>setCloudWorkspaceStatus("offline"));
    window.addEventListener("auth:context-ready",()=>{
        ensureCloudAccountContextIsolation();
        setTimeout(attemptCloudWorkspaceHydration,0);
    });

    /* Context watcher is only a race-condition safety net.
       250 ms caused unnecessary browser churn. */
    PharmFlowCloudWorkspace.contextWatchTimer=setInterval(
        attemptCloudWorkspaceHydration,
        1200
    );
    PharmFlowCloudWorkspace.pollTimer=setInterval(async()=>{
        if(document.visibilityState!=="visible"){
            return;
        }

        ensureCloudAccountContextIsolation();
        attemptCloudWorkspaceHydration();

        /* Serialized reconciliation prevents the UI/header oscillation
           seen when multiple cloud pulls overlap. */
        await reconcileCloudWorkspaceAuthority();

        if(!PharmFlowCloudWorkspace.contextSwitching){
            flushCloudWorkspaceQueue();
            pullCloudWorkspaceTransactions();
        }
    },2200);

    window.addEventListener("focus",()=>{
        reconcileWorkspaceGeneration().then(()=>reconcileCloudWorkspaceAuthority());
    });

    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState==="visible"){
            reconcileWorkspaceGeneration().then(()=>reconcileCloudWorkspaceAuthority());
        }
    });
    attemptCloudWorkspaceHydration();
}

/* Bind immediately; do not wait 100 ms and risk missing auth:context-ready. */
initializePharmFlowCloudWorkspace();
