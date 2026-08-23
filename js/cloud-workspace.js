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
    contextSwitching:false,
    /* Phase 2C.10.4.7 — no structural cloud WRITE is allowed during
       sign-in until server generation + Active Manifest authority are ready. */
    loginAuthorityReady:false,
    statusTimer:null,
    visibleStatus:"",
    activeManifestRevision:0,
    activeManifestPresent:false,
    activeManifestBusy:false,
    receivingSyncBusy:false,
    receivingSyncTimer:null,
    receivingFlushPromise:null,
    lastReceivingSyncAt:null,
    lastReceivingSyncError:null
};

function cloudWorkspacePharmacyId(){
    return (typeof AuthState!=="undefined" && AuthState.context) ? AuthState.context.pharmacy_id : null;
}

function cloudWorkspaceDeviceId(){
    if(PharmFlowCloudWorkspace.deviceId) return PharmFlowCloudWorkspace.deviceId;
    PharmFlowCloudWorkspace.deviceId = (typeof ensureDeviceId==="function" ? ensureDeviceId() : (crypto.randomUUID?.() || String(Date.now())));
    return PharmFlowCloudWorkspace.deviceId;
}

function renderCloudWorkspaceStatus(state, detail=""){
    document.documentElement.dataset.cloudWorkspaceState=state;

    let el=document.getElementById("cloudWorkspaceStatus");
    const host=
        document.getElementById("orderScopeControl") ||
        document.querySelector(
            ".currentReceivingCard, .dashboardWorkspaceCard, .dashboardHeader, .topBarRight"
        );

    if(host && !el){
        el=document.createElement("span");
        el.id="cloudWorkspaceStatus";
        el.className="cloudWorkspaceStatus";
        host.appendChild(el);
    }

    if(el){
        el.textContent=
            state==="synced"
                ? "● SYNCED"
                : state==="syncing"
                    ? "● SYNCING"
                    : state==="offline"
                        ? "● OFFLINE — PENDING SYNC"
                        : "● CLOUD";

        el.title=detail||"PharmFlow Cloud Workspace";
    }

    PharmFlowCloudWorkspace.visibleStatus=state;
}

function setCloudWorkspaceStatus(state, detail=""){
    if(PharmFlowCloudWorkspace.statusTimer){
        clearTimeout(PharmFlowCloudWorkspace.statusTimer);
        PharmFlowCloudWorkspace.statusTimer=null;
    }

    /* SYNCED is final and can be shown immediately.
       SYNCING/OFFLINE are delayed so sub-second network transitions
       do not create the rapid flashing reported on the Dashboard. */
    if(state==="synced"){
        renderCloudWorkspaceStatus(state,detail);
        return;
    }

    const delay=state==="offline" ? 1800 : 900;

    PharmFlowCloudWorkspace.statusTimer=setTimeout(()=>{
        renderCloudWorkspaceStatus(state,detail);
        PharmFlowCloudWorkspace.statusTimer=null;
    },delay);
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

    if(!q.some(row=>row.transactionId===tx.transactionId)){
        q.push(tx);
        writeCloudQueue(q);
    }

    /* Fire-and-forget is safe because flushCloudWorkspaceQueue is now a
       single-flight worker. Rapid +/- can no longer create overlapping
       stale queue writers. */
    flushCloudWorkspaceQueue();
}

function removeCloudQueueTransactions(transactionIds){
    const ids=new Set(
        (transactionIds||[])
            .map(value=>toSafeString(value))
            .filter(Boolean)
    );

    if(!ids.size) return;

    const latest=readCloudQueue();

    writeCloudQueue(
        latest.filter(row=>!ids.has(toSafeString(row?.transactionId||"")))
    );
}

async function uploadCloudReceivingTransaction(tx,pharmacyId){
    await authRpc("append_pharmflow_cloud_transaction_v2",{
        p_pharmacy_id:pharmacyId,
        p_transaction_id:tx.transactionId,
        p_order_number:toSafeString(
            tx.selectedOrderNumber ||
            tx.orderId ||
            ""
        ),
        p_item_code:toSafeString(tx.itemCode||""),
        p_item_name:toSafeString(tx.itemName||""),
        p_gtin:toSafeString(tx.gtin||""),
        p_quantity:toNumber(tx.quantity,0),
        p_source:toSafeString(tx.source||"RECEIVING"),
        p_device_id:toSafeString(
            tx.deviceId ||
            cloudWorkspaceDeviceId()
        ),
        p_occurred_at:tx.dateTime||nowISO(),
        p_payload:tx
    });

    const local=(AppState?.workspace?.receivingHistory||[])
        .find(row=>row.transactionId===tx.transactionId);

    if(local){
        local.cloudSynced=true;
    }

    return tx.transactionId;
}

async function flushCloudWorkspaceQueue(){
    if(PharmFlowCloudWorkspace.receivingFlushPromise){
        return PharmFlowCloudWorkspace.receivingFlushPromise;
    }

    PharmFlowCloudWorkspace.receivingFlushPromise=(async()=>{
        const pharmacyId=cloudWorkspacePharmacyId();

        if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function"){
            if(readCloudQueue().length){
                setCloudWorkspaceStatus("offline","Receiving changes pending sync");
            }
            return false;
        }

        setCloudWorkspaceStatus("syncing","Syncing receiving changes");

        let syncedAny=false;
        let failedInPass=false;

        /* Small controlled concurrency keeps a burst of 50–100 +/- actions
           responsive without launching one independent flush per click. */
        const CHUNK_SIZE=4;

        while(
            navigator.onLine &&
            cloudWorkspacePharmacyId()===pharmacyId
        ){
            const latestQueue=readCloudQueue();

            if(!latestQueue.length){
                break;
            }

            const chunk=latestQueue.slice(0,CHUNK_SIZE);

            const results=await Promise.all(
                chunk.map(async tx=>{
                    try{
                        const transactionId=
                            await uploadCloudReceivingTransaction(tx,pharmacyId);

                        return {
                            ok:true,
                            transactionId
                        };
                    }
                    catch(error){
                        Logger.warn(
                            "Receiving transaction upload failed",
                            {
                                transactionId:tx?.transactionId,
                                error:error?.message||String(error)
                            }
                        );

                        PharmFlowCloudWorkspace.lastReceivingSyncError=
                            error?.message || String(error);

                        return {
                            ok:false,
                            transactionId:tx?.transactionId,
                            error
                        };
                    }
                })
            );

            const successes=results
                .filter(row=>row.ok)
                .map(row=>row.transactionId);

            if(successes.length){
                syncedAny=true;

                /* Critical: remove successful IDs from the LATEST queue.
                   Never replace localStorage with an old snapshot. */
                removeCloudQueueTransactions(successes);
            }

            const failures=results.filter(row=>!row.ok);

            if(failures.length){
                failedInPass=true;
                break;
            }
        }

        const remaining=readCloudQueue();

        if(syncedAny){
            saveWorkspaceSnapshot?.();
        }

        if(remaining.length){
            setCloudWorkspaceStatus(
                navigator.onLine ? "syncing" : "offline",
                `${remaining.length} receiving change(s) pending`
            );

            return false;
        }

        PharmFlowCloudWorkspace.lastReceivingSyncError=null;
        setCloudWorkspaceStatus("synced","Receiving synchronized");

        return !failedInPass;
    })();

    try{
        return await PharmFlowCloudWorkspace.receivingFlushPromise;
    }
    finally{
        PharmFlowCloudWorkspace.receivingFlushPromise=null;

        /* A new transaction may have arrived between the final queue read and
           promise teardown. Immediately start one more pass if needed. */
        if(
            navigator.onLine &&
            readCloudQueue().length &&
            cloudWorkspacePharmacyId()
        ){
            setTimeout(()=>flushCloudWorkspaceQueue(),0);
        }
    }
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
        PharmFlowCloudWorkspace.activeManifestRevision=0;
        PharmFlowCloudWorkspace.activeManifestPresent=false;
        PharmFlowCloudWorkspace.generation=null;
        PharmFlowCloudWorkspace.loginAuthorityReady=false;
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

        /*
           2C.11.4.7 — SERVER-FIRST LOGIN HYDRATION

           Do NOT restore the account-scoped browser workspace before the
           Supabase authorities have answered. A stale local snapshot could
           otherwise render finalized/old Order numbers for ~1 second after
           sign-in, then disappear when Active Order Manifest reconciled.

           Keep runtime intentionally empty during login. The authoritative
           Active Order Manifest / Cloud Workspace will hydrate immediately
           afterwards. The scoped local snapshot remains only as persistence,
           never as the first authenticated render.
        */
        if(typeof AppState!=="undefined"){
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

/* =====================================================
   PHASE 2C.10.4.1 — GENERATION FENCE PRE-WRITE SYNC
   Before an Order import changes local workspace structure, refresh the
   server generation. If another PC performed Reset, clear the stale local
   workspace BEFORE parsing/importing the new file. This prevents a valid
   post-reset upload from being rejected as STALE_WORKSPACE_GENERATION and
   prevents old local state from resurrecting.
===================================================== */
async function syncWorkspaceGenerationBeforeStructuralWrite(){
    const serverGeneration=await getCloudWorkspaceGeneration();

    if(serverGeneration===null){
        throw new Error(
            "Unable to verify the current workspace generation on Supabase."
        );
    }

    const localGeneration=PharmFlowCloudWorkspace.generation;

    if(
        localGeneration!==null &&
        Number(localGeneration)!==Number(serverGeneration)
    ){
        clearLocalWorkspaceFromRemoteReset(serverGeneration);
    }else{
        PharmFlowCloudWorkspace.generation=Number(serverGeneration);
    }

    return Number(serverGeneration);
}

window.syncWorkspaceGenerationBeforeStructuralWrite=
    syncWorkspaceGenerationBeforeStructuralWrite;

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




function serializeActiveOrderManifest(){
    const workspace=AppState?.workspace || {};

    const orderData=(workspace.orderData||[]).map(item=>{
        const clone=deepClone(item);

        /* Receiving quantities are transaction state, not upload structure.
           PC2 will receive them through cloud transactions. */
        clone.receivedQty=0;
        clone.remainingQty=toNumber(clone.orderedQty,0);
        clone.status=toNumber(clone.orderedQty,0)>0
            ? "PENDING"
            : (clone.manual===true ? "MANUAL" : "PENDING");

        return clone;
    });

    return {
        orderId:workspace.orderId||null,
        orderName:workspace.orderName||"",
        createdAt:workspace.createdAt||null,
        startedAt:workspace.startedAt||null,
        active:!!workspace.active,
        selectedOrderNumber:
            workspace.selectedOrderNumber || "",
        selectedOrderNumbers:Array.isArray(workspace.selectedOrderNumbers)
            ? deepClone(workspace.selectedOrderNumbers)
            : [],
        orderFiles:deepClone(workspace.orderFiles||[]),
        mappingFiles:deepClone(workspace.mappingFiles||[]),
        orderData,
        mappingData:deepClone(workspace.mappingData||[])
    };
}

window.serializeActiveOrderManifest=serializeActiveOrderManifest;

async function saveActiveOrderManifest(options={}){
    const pharmacyId=cloudWorkspacePharmacyId();
    const silent=options?.silent===true;

    const manifest=serializeActiveOrderManifest();

    const fileCount=Array.isArray(manifest.orderFiles)
        ? manifest.orderFiles.length
        : 0;

    const itemCount=Array.isArray(manifest.orderData)
        ? manifest.orderData.length
        : 0;

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function" ||
        fileCount<=0 ||
        itemCount<=0
    ){
        return false;
    }

    try{
        setCloudWorkspaceStatus(
            "syncing",
            "Saving Active Orders"
        );

        const result=await authRpc(
            "save_pharmflow_active_order_manifest_v3",
            {
                p_pharmacy_id:pharmacyId,
                p_manifest:manifest,
                p_expected_generation:Number(PharmFlowCloudWorkspace.generation||0)
            }
        );

        const row=Array.isArray(result)?result[0]:result;

        if(
            !row ||
            Number(row.order_files||0)!==fileCount ||
            Number(row.order_items||0)!==itemCount
        ){
            throw new Error(
                "Active Order Manifest verification failed after save"
            );
        }

        /* Read-after-write verification: do not report SYNCED merely
           because the RPC returned without throwing. */
        const verifyResult=await authRpc(
            "get_pharmflow_active_order_manifest_v3",
            {p_pharmacy_id:pharmacyId}
        );

        const verify=Array.isArray(verifyResult)
            ? verifyResult[0]
            : verifyResult;

        if(
            !verify?.manifest ||
            Number(verify.order_files||0)!==fileCount ||
            Number(verify.order_items||0)!==itemCount
        ){
            throw new Error(
                "Active Order Manifest was not persisted on the server"
            );
        }

        PharmFlowCloudWorkspace.activeManifestRevision=
            Number(verify.revision||row.revision||0);

        PharmFlowCloudWorkspace.activeManifestPresent=true;
        PharmFlowCloudWorkspace.lastManifestSaveError=null;
        PharmFlowCloudWorkspace.lastManifestSaveAt=nowISO();

        setCloudWorkspaceStatus(
            "synced",
            `${fileCount} Active Order file(s) shared`
        );

        return true;
    }
    catch(error){
        const message=error?.message || String(error);

        PharmFlowCloudWorkspace.lastManifestSaveError=
            message;

        Logger.error(
            "Active Order Manifest server save failed",
            {
                pharmacyId,
                fileCount,
                itemCount,
                error:message
            }
        );

        setCloudWorkspaceStatus(
            "offline",
            "Active Orders pending server sync"
        );

        if(!silent){
            showToast?.(
                "Active Orders cloud save failed: "+message,
                "error"
            );
        }

        return false;
    }
}

function applyActiveOrderManifest(manifest,revision){
    if(!manifest || typeof manifest!=="object"){
        return false;
    }

    const incomingFiles=Array.isArray(manifest.orderFiles)
        ? manifest.orderFiles
        : [];

    if(!incomingFiles.length){
        return false;
    }

    const currentHistory=deepClone(
        AppState?.workspace?.receivingHistory || []
    );

    const currentLastScan=AppState?.workspace?.lastScan || null;

    AppState.workspace={
        ...createEmptyWorkspace(),
        ...manifest,
        receivingHistory:currentHistory,
        lastScan:currentLastScan
    };

    rebuildStateIndexes();
    recalculateStatistics();
    saveWorkspaceSnapshot();

    PharmFlowCloudWorkspace.activeManifestRevision=
        Number(revision||0);
    PharmFlowCloudWorkspace.activeManifestPresent=true;

    /* Order structure is ready on this PC even if the legacy
       cloud-workspace snapshot endpoint is unavailable. */
    PharmFlowCloudWorkspace.hydratedPharmacyId=
        cloudWorkspacePharmacyId();

    AppEvents.emit(
        "files:updated",
        {source:"active-manifest"}
    );
    AppEvents.emit(
        "receiving:updated",
        {source:"active-manifest"}
    );

    refreshEntireUI?.();
    return true;
}

async function pullActiveOrderManifest(options={}){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function" ||
        PharmFlowCloudWorkspace.activeManifestBusy ||
        PharmFlowCloudWorkspace.contextSwitching
    ){
        return false;
    }

    PharmFlowCloudWorkspace.activeManifestBusy=true;

    try{
        const result=await authRpc(
            "get_pharmflow_active_order_manifest_v3",
            {p_pharmacy_id:pharmacyId}
        );

        const row=Array.isArray(result)?result[0]:result;

        PharmFlowCloudWorkspace.lastManifestPullAt=nowISO();
        PharmFlowCloudWorkspace.lastManifestPullError=null;

        if(!row?.manifest){
            PharmFlowCloudWorkspace.activeManifestPresent=false;
            PharmFlowCloudWorkspace.activeManifestRevision=0;

            Logger.warn("No Active Order Manifest row returned",{pharmacyId});

            if(options?.clearIfMissing===true){
                /* Server-empty is authoritative after reset/sign-in. Never let
                   stale local orders survive and later resurrect themselves. */
                AppState.workspace=createEmptyWorkspace();
                resetStatistics();
                rebuildStateIndexes();
                deleteWorkspaceSnapshot?.();
                AppEvents.emit("files:updated",{source:"server-authority-empty"});
                AppEvents.emit("receiving:updated",{source:"server-authority-empty"});
                refreshEntireUI?.();
            }
            return false;
        }

        const incomingFiles=
            Array.isArray(row.manifest?.orderFiles)
                ? row.manifest.orderFiles
                : [];

        const incomingData=
            Array.isArray(row.manifest?.orderData)
                ? row.manifest.orderData
                : [];

        if(!incomingFiles.length || !incomingData.length){
            PharmFlowCloudWorkspace.activeManifestPresent=false;

            Logger.warn(
                "Active Order Manifest returned without active order data",
                {
                    pharmacyId,
                    revision:Number(row.revision||0),
                    files:incomingFiles.length,
                    items:incomingData.length
                }
            );

            return false;
        }

        PharmFlowCloudWorkspace.activeManifestPresent=true;

        const revision=Number(row.revision||0);

        const localFiles=
            Array.isArray(AppState?.workspace?.orderFiles)
                ? AppState.workspace.orderFiles
                : [];

        const localData=
            Array.isArray(AppState?.workspace?.orderData)
                ? AppState.workspace.orderData
                : [];

        const localSignature=JSON.stringify(
            localFiles.map(file=>[
                normalizeOrderNumber(
                    file?.documentId ||
                    file?.orderNumber ||
                    ""
                ),
                Number(file?.rowCount||0)
            ])
        );

        const remoteSignature=JSON.stringify(
            incomingFiles.map(file=>[
                normalizeOrderNumber(
                    file?.documentId ||
                    file?.orderNumber ||
                    ""
                ),
                Number(file?.rowCount||0)
            ])
        );

        const mustApply=
            !localFiles.length ||
            !localData.length ||
            revision>
                Number(
                    PharmFlowCloudWorkspace
                        .activeManifestRevision||0
                ) ||
            localSignature!==remoteSignature;

        if(mustApply){
            const applied=applyActiveOrderManifest(
                row.manifest,
                revision
            );

            if(applied){
                setCloudWorkspaceStatus(
                    "synced",
                    "Active Orders loaded"
                );
            }

            return applied;
        }

        PharmFlowCloudWorkspace.activeManifestRevision=revision;
        return true;
    }
    catch(error){
        PharmFlowCloudWorkspace.lastManifestPullError=
            error?.message || String(error);

        Logger.warn(
            "Active Order Manifest pull failed",
            error
        );

        setCloudWorkspaceStatus(
            "offline",
            "Active Order sync failed"
        );

        return false;
    }
    finally{
        PharmFlowCloudWorkspace.activeManifestBusy=false;
    }
}

async function clearActiveOrderManifest(){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !pharmacyId ||
        typeof authRpc!=="function"
    ){
        return false;
    }

    try{
        await authRpc(
            "clear_pharmflow_active_order_manifest_v2",
            {p_pharmacy_id:pharmacyId}
        );

        PharmFlowCloudWorkspace.activeManifestRevision=0;
        PharmFlowCloudWorkspace.activeManifestPresent=false;
        return true;
    }catch(error){
        Logger.warn("Active Order Manifest clear failed",error);
        return false;
    }
}

window.saveActiveOrderManifest=saveActiveOrderManifest;
window.pullActiveOrderManifest=pullActiveOrderManifest;
window.clearActiveOrderManifest=clearActiveOrderManifest;




async function repairMissingActiveOrderManifestFromLocal(){
    /* Phase 2C.10.4.0: intentionally disabled. Local browser state is NEVER
       allowed to recreate a missing server manifest. Supabase is authority. */
    return false;
}

window.repairMissingActiveOrderManifestFromLocal=
    repairMissingActiveOrderManifestFromLocal;


async function bootstrapActiveOrdersOnEmptyDevice(){
    if(PharmFlowCloudWorkspace.manifestBootstrapBusy){
        return false;
    }

    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function"
    ){
        return false;
    }

    const alreadyLoaded=
        Array.isArray(AppState?.workspace?.orderFiles) &&
        AppState.workspace.orderFiles.length &&
        Array.isArray(AppState?.workspace?.orderData) &&
        AppState.workspace.orderData.length;

    if(alreadyLoaded){
        return true;
    }

    PharmFlowCloudWorkspace.manifestBootstrapBusy=true;

    try{
        for(let attempt=1;attempt<=4;attempt++){
            await pullActiveOrderManifest();

            const loaded=
                Array.isArray(AppState?.workspace?.orderFiles) &&
                AppState.workspace.orderFiles.length &&
                Array.isArray(AppState?.workspace?.orderData) &&
                AppState.workspace.orderData.length;

            if(loaded){
                PharmFlowCloudWorkspace.hydratedPharmacyId=
                    pharmacyId;

                await pullCloudWorkspaceTransactions();

                setCloudWorkspaceStatus(
                    "synced",
                    "Active Orders restored"
                );

                return true;
            }

            await new Promise(
                resolve=>setTimeout(
                    resolve,
                    500 + (attempt*350)
                )
            );
        }

        if(PharmFlowCloudWorkspace.lastManifestPullError){
            setCloudWorkspaceStatus(
                "offline",
                "Active Order sync failed"
            );
        }

        return false;
    }
    finally{
        PharmFlowCloudWorkspace.manifestBootstrapBusy=false;
    }
}

window.bootstrapActiveOrdersOnEmptyDevice=
    bootstrapActiveOrdersOnEmptyDevice;


async function forceCloudWorkspaceSnapshot(reason="manual"){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function"
    ){
        setCloudWorkspaceStatus("offline","Pending sync");
        return false;
    }

    try{
        ensureCloudAccountContextIsolation();

        if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId){
            await restoreCloudWorkspaceOnLogin();
        }

        cancelPendingCloudWorkspaceSave();

        if(
            !Array.isArray(AppState?.workspace?.orderData) ||
            !AppState.workspace.orderData.length
        ){
            return false;
        }

        setCloudWorkspaceStatus("syncing");

        if(PharmFlowCloudWorkspace.generation===null){
            PharmFlowCloudWorkspace.generation=
                await getCloudWorkspaceGeneration();
        }

        await authRpc("save_pharmflow_cloud_workspace_guarded",{
            p_pharmacy_id:pharmacyId,
            p_workspace:serializeCurrentWorkspace(),
            p_device_id:cloudWorkspaceDeviceId(),
            p_expected_generation:Number(
                PharmFlowCloudWorkspace.generation||0
            )
        });

        PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature=
            stableCloudWorkspaceSignature(
                serializeCurrentWorkspace(),
                {}
            );

        setCloudWorkspaceStatus("synced",reason);
        return true;
    }catch(error){
        const message=String(error?.message||"");

        if(message.includes("WORKSPACE_RESET_CONFLICT")){
            await reconcileWorkspaceGeneration();
            return false;
        }

        setCloudWorkspaceStatus("offline",message||"Pending sync");
        return false;
    }
}

window.forceCloudWorkspaceSnapshot=forceCloudWorkspaceSnapshot;


/*
   2C.11.4.10 — FINALIZE PERSISTENCE ROOT FIX

   Active Order Manifest is the structural authority, but PharmFlow still
   keeps the legacy full Cloud Workspace as compatibility/session state.
   Finalize previously updated only the Manifest. That left a stale full
   Cloud Workspace containing finalized Orders, which was later hydrated
   briefly on sign-in until the empty Manifest corrected it.

   This function synchronizes the COMPLETE post-finalize workspace to the
   same guarded server authority. Unlike the ordinary autosave helper, it
   intentionally allows an EMPTY workspace so the last finalized Order can
   never survive in the legacy cloud snapshot.
*/
async function syncCloudWorkspaceAfterFinalize(reason="Finalize synchronized"){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function"
    ){
        setCloudWorkspaceStatus("offline","Finalize workspace sync unavailable");
        return false;
    }

    try{
        ensureCloudAccountContextIsolation();

        cancelPendingCloudWorkspaceSave();

        if(PharmFlowCloudWorkspace.generation===null){
            PharmFlowCloudWorkspace.generation=
                await getCloudWorkspaceGeneration();
        }

        setCloudWorkspaceStatus("syncing","Finalizing workspace");

        const snapshot=serializeCurrentWorkspace();

        const saved=await authRpc(
            "save_pharmflow_cloud_workspace_guarded",
            {
                p_pharmacy_id:pharmacyId,
                p_workspace:snapshot,
                p_device_id:cloudWorkspaceDeviceId(),
                p_expected_generation:Number(
                    PharmFlowCloudWorkspace.generation||0
                )
            }
        );

        if(saved!==true){
            throw new Error("Server did not confirm finalized workspace snapshot");
        }

        PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature=
            stableCloudWorkspaceSignature(snapshot,{});

        PharmFlowCloudWorkspace.lastCloudUpdate=nowISO();

        setCloudWorkspaceStatus("synced",reason);
        return true;
    }
    catch(error){
        const message=String(error?.message||"");

        if(message.includes("WORKSPACE_RESET_CONFLICT")){
            await reconcileWorkspaceGeneration();
        }

        setCloudWorkspaceStatus(
            "offline",
            message || "Finalize workspace sync failed"
        );

        return false;
    }
}

window.syncCloudWorkspaceAfterFinalize=syncCloudWorkspaceAfterFinalize;


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


function getActiveReceivingOrderSetForCloud(){
    const values=
        typeof getActiveReceivingOrderNumbers==="function"
            ? getActiveReceivingOrderNumbers()
            : [];

    return new Set(
        values
            .map(normalizeOrderNumber)
            .filter(Boolean)
    );
}

function rebuildReceivingQuantitiesFromLedger(){
    const items=Array.isArray(AppState?.workspace?.orderData)
        ? AppState.workspace.orderData
        : [];

    if(!items.length){
        return;
    }

    const totals=new Map();
    const activeOrders=getActiveReceivingOrderSetForCloud();

    (AppState.workspace.receivingHistory||[]).forEach(tx=>{
        const code=normalizeItemCode(tx?.itemCode||"");
        if(!code){
            return;
        }

        const txOrder=normalizeOrderNumber(
            tx?.selectedOrderNumber ||
            tx?.orderId ||
            tx?.orderNumber ||
            ""
        );

        /*
           Current receiving rows are pharmacy/order scoped.
           Legacy rows without an order are retained for compatibility.
        */
        if(
            txOrder &&
            activeOrders.size &&
            !activeOrders.has(txOrder)
        ){
            return;
        }

        totals.set(
            code,
            (totals.get(code)||0)+toNumber(tx?.quantity,0)
        );
    });

    items.forEach(item=>{
        const code=normalizeItemCode(item?.itemCode||"");
        item.receivedQty=Math.max(
            0,
            toNumber(totals.get(code),0)
        );

        if(typeof updateItemCalculatedFields==="function"){
            updateItemCalculatedFields(item);
        }
    });
}

function normalizeCloudReceivingTransaction(tx){
    const payload=
        tx?.payload && typeof tx.payload==="object"
            ? tx.payload
            : {};

    const orderNumber=normalizeOrderNumber(
        tx?.order_number ||
        tx?.orderId ||
        payload?.selectedOrderNumber ||
        payload?.orderId ||
        ""
    );

    return {
        transactionId:toSafeString(
            tx?.transaction_id ||
            tx?.transactionId ||
            payload?.transactionId ||
            ""
        ),
        orderId:orderNumber,
        selectedOrderNumber:orderNumber,
        dateTime:
            tx?.occurred_at ||
            tx?.dateTime ||
            payload?.dateTime ||
            nowISO(),
        itemCode:normalizeItemCode(
            tx?.item_code ||
            tx?.itemCode ||
            payload?.itemCode ||
            ""
        ),
        itemName:toSafeString(
            tx?.item_name ||
            tx?.itemName ||
            payload?.itemName ||
            ""
        ),
        gtin:toSafeString(
            tx?.gtin ||
            payload?.gtin ||
            ""
        ),
        quantity:toNumber(
            tx?.quantity ?? payload?.quantity,
            0
        ),
        lot:toSafeString(payload?.lot||""),
        expiry:toSafeString(payload?.expiry||""),
        serial:toSafeString(payload?.serial||""),
        source:toSafeString(
            tx?.source ||
            payload?.source ||
            "CLOUD"
        ),
        deviceId:toSafeString(
            tx?.device_id ||
            payload?.deviceId ||
            "REMOTE"
        ),
        deviceType:toSafeString(
            payload?.deviceType ||
            payload?.device_type ||
            ""
        ).toUpperCase(),
        manual:payload?.manual===true,
        cloudSynced:true
    };
}

function mergeCloudReceivingLedger(rows){
    let changed=false;

    for(const raw of (Array.isArray(rows)?rows:[]).slice().reverse()){
        const tx=normalizeCloudReceivingTransaction(raw);

        if(
            !tx.transactionId ||
            !tx.itemCode
        ){
            continue;
        }

        const existing=(AppState.workspace.receivingHistory||[])
            .find(row=>row.transactionId===tx.transactionId);

        if(existing){
            if(existing.cloudSynced!==true){
                existing.cloudSynced=true;
                changed=true;
            }
            continue;
        }

        /*
           Do not require the old full Cloud Workspace to be hydrated.
           The Active Order Manifest is sufficient as long as the item exists.
        */
        const item=getItemByCode(tx.itemCode);

        if(!item){
            continue;
        }

        const added=addReceivingTransaction(tx);

        if(added){
            changed=true;
        }
    }

    /*
       Rebuild quantities from the transaction ledger instead of applying
       remote deltas incrementally. Every PC therefore converges to the
       same receiving state after refresh/sign-in.
    */
    rebuildReceivingQuantitiesFromLedger();

    return changed;
}


function applyCloudTransaction(tx){
    return mergeCloudReceivingLedger([tx]);
}

async function repairSharedReceivingLedgerFromLocal(){
    if(
        PharmFlowCloudWorkspace.applyingRemote ||
        PharmFlowCloudWorkspace.contextSwitching ||
        !Array.isArray(AppState?.workspace?.receivingHistory) ||
        !AppState.workspace.receivingHistory.length
    ){
        return true;
    }

    for(const tx of AppState.workspace.receivingHistory){
        if(!tx?.transactionId || tx.cloudSynced===true) continue;
        queueCloudWorkspaceTransaction(deepClone(tx));
    }

    return await flushCloudWorkspaceQueue();
}

async function pullCloudWorkspaceTransactions(){
    const pharmacyId=cloudWorkspacePharmacyId();

    if(
        !navigator.onLine ||
        !pharmacyId ||
        typeof authRpc!=="function" ||
        PharmFlowCloudWorkspace.receivingSyncBusy ||
        PharmFlowCloudWorkspace.contextSwitching
    ){
        return false;
    }

    PharmFlowCloudWorkspace.receivingSyncBusy=true;

    try{
        /*
           The original bug was here:
           transaction pulling was blocked by hydratedPharmacyId, even when
           PC2 already had its orders from the Active Order Manifest.
           Receiving sync is now independent from the old workspace snapshot.
        */
        if(
            !Array.isArray(AppState?.workspace?.orderData) ||
            !AppState.workspace.orderData.length
        ){
            if(typeof pullActiveOrderManifest==="function"){
                await pullActiveOrderManifest();
            }
        }

        if(
            !Array.isArray(AppState?.workspace?.orderData) ||
            !AppState.workspace.orderData.length
        ){
            return false;
        }

        const rows=await authRpc(
            "list_pharmflow_cloud_transactions_v2",
            {
                p_pharmacy_id:pharmacyId,
                p_limit:5000
            }
        );

        PharmFlowCloudWorkspace.applyingRemote=true;

        const changed=mergeCloudReceivingLedger(
            Array.isArray(rows) ? rows : []
        );

        if(changed){
            rebuildStateIndexes();
            recalculateStatistics();
            saveWorkspaceSnapshot();

            AppEvents.emit(
                "receiving:updated",
                {
                    source:"cloud-ledger",
                    synchronized:true
                }
            );

            if(typeof refreshEntireUI==="function"){
                refreshEntireUI();
            }
            else if(typeof refreshAllUI==="function"){
                refreshAllUI();
            }
        }

        PharmFlowCloudWorkspace.lastReceivingSyncAt=nowISO();
        PharmFlowCloudWorkspace.lastReceivingSyncError=null;

        return true;
    }
    catch(error){
        Logger.warn(
            "Receiving transaction pull failed",
            error
        );

        PharmFlowCloudWorkspace.lastReceivingSyncError=
            error?.message || String(error);

        setCloudWorkspaceStatus(
            "offline",
            "Receiving sync unavailable"
        );

        return false;
    }
    finally{
        PharmFlowCloudWorkspace.applyingRemote=false;
        PharmFlowCloudWorkspace.receivingSyncBusy=false;
    }
}

async function restoreCloudWorkspaceOnLogin(){
    ensureCloudAccountContextIsolation();

    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return false;
    if(typeof AppState==="undefined" || !AppState.workspace) return false;

    /*
      PC2/PC3 bootstrap rule:
      Active Order Manifest is the FIRST authority for uploaded Orders.
      Do not wait for the legacy Cloud Workspace snapshot.
    */
    const hadOrdersBeforeBootstrap=
        Array.isArray(AppState.workspace?.orderData) &&
        AppState.workspace.orderData.length>0;

    if(!hadOrdersBeforeBootstrap){
        await bootstrapActiveOrdersOnEmptyDevice();
    }

    if(PharmFlowCloudWorkspace.hydratedPharmacyId===pharmacyId){
        await pullActiveOrderManifest();
        await pullCloudWorkspaceTransactions();
        return true;
    }
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

            if(
                !cloudHasOrder &&
                !PharmFlowCloudWorkspace.activeManifestPresent
            ){
                /*
                  Both server authorities say there is NO active Order.
                  Remove any account-scoped stale browser snapshot even though
                  we deliberately did not render it during sign-in. This makes
                  the cleanup permanent and prevents future flashes.
                */
                PharmFlowCloudWorkspace.applyingRemote=true;
                clearCurrentWorkspace();
                startNewWorkspace();
                deleteWorkspaceSnapshot();
                saveWorkspaceSnapshot();

                if(typeof refreshAllUI==="function"){
                    refreshAllUI();
                }

                PharmFlowCloudWorkspace.applyingRemote=false;
            }

            await pullActiveOrderManifest();
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
            else if(localHasOrder && !PharmFlowCloudWorkspace.activeManifestPresent){
                /* Phase 2C.10.3.4: the dedicated Active Order Manifest is the
                   structural authority for uploaded orders. An empty legacy
                   cloud-workspace snapshot must never erase orders restored
                   from that manifest on PC2/PC3. */
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
window.repairSharedReceivingLedgerFromLocal=repairSharedReceivingLedgerFromLocal;
window.pullCloudWorkspaceTransactions=pullCloudWorkspaceTransactions;

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

    AppEvents.on("files:updated",event=>{
        try{
            saveWorkspaceSnapshot?.();
        }catch(_){}

        /* Phase 2C.10.4.7 — hydration/empty-authority events are READ paths.
           Never write the Manifest during sign-in before generation authority
           has been reconciled with Supabase. */
        if(
            event?.source==="active-manifest" ||
            event?.source==="server-authority-empty" ||
            PharmFlowCloudWorkspace.applyingRemote ||
            PharmFlowCloudWorkspace.contextSwitching ||
            PharmFlowCloudWorkspace.loginAuthorityReady!==true ||
            PharmFlowCloudWorkspace.generation===null
        ){
            return;
        }

        setTimeout(async()=>{
            if(
                PharmFlowCloudWorkspace.loginAuthorityReady!==true ||
                PharmFlowCloudWorkspace.contextSwitching ||
                PharmFlowCloudWorkspace.applyingRemote ||
                PharmFlowCloudWorkspace.generation===null
            ){
                return;
            }

            const manifestSaved=
                await saveActiveOrderManifest();

            /* Full cloud workspace is compatibility/session state.
               It must not be allowed to claim final SYNCED when
               the structural Active Orders manifest failed. */
            await forceCloudWorkspaceSnapshot(
                manifestSaved
                    ? "Order files synced"
                    : "Workspace saved; Active Orders pending"
            );

            if(!manifestSaved){
                setCloudWorkspaceStatus(
                    "offline",
                    "Active Orders pending server sync"
                );
            }
        },180);
    });
    /* Phase 2C.10.3.8 — CRITICAL DATA-SAFETY RULE
       workspace:cleared is a LOCAL lifecycle event used by several flows
       (Handheld detach/end-session, archive/finalize transitions, remote reset
       application, account switching). It MUST NEVER implicitly delete shared
       server state. Intentional Reset Current Workspace already performs its
       explicit authenticated server clears in app.js before local reset.

       The old listener was the root cause of Active Orders / Receiving Ledger
       disappearing after a device-local Handheld/session cleanup. */
    AppEvents.on("workspace:cleared",()=>{
        if(PharmFlowCloudWorkspace.suppressNextClearRpc){
            PharmFlowCloudWorkspace.suppressNextClearRpc=false;
        }
        setCloudWorkspaceStatus(
            navigator.onLine ? "synced" : "offline",
            navigator.onLine ? "Local workspace updated" : "Local workspace updated offline"
        );
    });
    window.addEventListener("online",()=>{attemptCloudWorkspaceHydration();flushCloudWorkspaceQueue();pullCloudWorkspaceTransactions();});
    window.addEventListener("offline",()=>setCloudWorkspaceStatus("offline"));
    window.addEventListener("auth:context-ready",()=>{
        ensureCloudAccountContextIsolation();
        PharmFlowCloudWorkspace.loginAuthorityReady=false;

        setTimeout(async()=>{
            try{
                /* Phase 2C.10.4.7 — generation FIRST, server Manifest SECOND,
                   structural writes LAST. This prevents sign-in from saving a
                   valid Active Order with a stale pre-login generation. */
                await reconcileWorkspaceGeneration();

                const hasLocalOrders=
                    Array.isArray(AppState?.workspace?.orderFiles) &&
                    AppState.workspace.orderFiles.length &&
                    Array.isArray(AppState?.workspace?.orderData) &&
                    AppState.workspace.orderData.length;

                if(hasLocalOrders){
                    await pullActiveOrderManifest({clearIfMissing:true});
                }
                else{
                    await bootstrapActiveOrdersOnEmptyDevice();
                }

                /* Close a Reset race while the Manifest request was in flight. */
                await reconcileWorkspaceGeneration();

                PharmFlowCloudWorkspace.loginAuthorityReady=true;

                await repairSharedReceivingLedgerFromLocal();
                attemptCloudWorkspaceHydration();

                setCloudWorkspaceStatus(
                    "synced",
                    "Server authority reconciled after sign-in"
                );
            }
            catch(error){
                PharmFlowCloudWorkspace.loginAuthorityReady=false;
                Logger.error("Sign-in cloud authority bootstrap failed",error);
                setCloudWorkspaceStatus(
                    "offline",
                    error?.message||"Unable to reconcile server authority"
                );
            }
        },0);
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

        const hasLocalOrders=
            Array.isArray(AppState?.workspace?.orderFiles) &&
            AppState.workspace.orderFiles.length &&
            Array.isArray(AppState?.workspace?.orderData) &&
            AppState.workspace.orderData.length;

        if(!PharmFlowCloudWorkspace.contextSwitching){
            if(!hasLocalOrders){
                await bootstrapActiveOrdersOnEmptyDevice();
            }
            else{
                await pullActiveOrderManifest({clearIfMissing:true});
                await pullActiveOrderManifest();
            }
        }

        attemptCloudWorkspaceHydration();
        await reconcileCloudWorkspaceAuthority();
    },2200);

    /*
       Receiving synchronization has its own independent loop.
       It no longer waits for workspace reconciliation to finish.
    */
    PharmFlowCloudWorkspace.receivingSyncTimer=setInterval(async()=>{
        if(
            document.visibilityState!=="visible" ||
            PharmFlowCloudWorkspace.contextSwitching
        ){
            return;
        }

        await repairSharedReceivingLedgerFromLocal();
        await flushCloudWorkspaceQueue();
        await pullCloudWorkspaceTransactions();
    },1000);

    window.addEventListener("focus",async()=>{
        const hasLocalOrders=
            Array.isArray(AppState?.workspace?.orderFiles) &&
            AppState.workspace.orderFiles.length &&
            Array.isArray(AppState?.workspace?.orderData) &&
            AppState.workspace.orderData.length;

        if(hasLocalOrders){
            await pullActiveOrderManifest({clearIfMissing:true});
        }
        else{
            await bootstrapActiveOrdersOnEmptyDevice();
        }

        if(PharmFlowCloudWorkspace.loginAuthorityReady===true){
            reconcileWorkspaceGeneration()
                .then(()=>reconcileCloudWorkspaceAuthority());
        }

        flushCloudWorkspaceQueue()
            .then(()=>pullCloudWorkspaceTransactions());
    });

    document.addEventListener("visibilitychange",async()=>{
        if(document.visibilityState==="visible"){
            const hasLocalOrders=
                Array.isArray(AppState?.workspace?.orderFiles) &&
                AppState.workspace.orderFiles.length &&
                Array.isArray(AppState?.workspace?.orderData) &&
                AppState.workspace.orderData.length;

            if(hasLocalOrders){
                await pullActiveOrderManifest({clearIfMissing:true});
            }
            else{
                await bootstrapActiveOrdersOnEmptyDevice();
            }

            if(PharmFlowCloudWorkspace.loginAuthorityReady===true){
                reconcileWorkspaceGeneration()
                    .then(()=>reconcileCloudWorkspaceAuthority());
            }

            flushCloudWorkspaceQueue()
                .then(()=>pullCloudWorkspaceTransactions());
        }
    });
    attemptCloudWorkspaceHydration();
}

/* Bind immediately; do not wait 100 ms and risk missing auth:context-ready. */
initializePharmFlowCloudWorkspace();
