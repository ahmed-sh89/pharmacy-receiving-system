"use strict";


/* B10 Clean23 — 10-minute hard idle sleep failsafe.
   Root cause reductions remain authoritative. This is only a final safety net:
   after 10 minutes with no real user/receiving activity, all app network reads
   are blocked and the UI is locked until a full page Refresh. */
(function installPharmFlowIdleSleep(){
    if(window.PharmFlowIdleSleep) return;
    const IDLE_MS=10*60*1000;
    let timer=null;
    let lastActivity=Date.now();
    let active=false;

    const api=window.PharmFlowIdleSleep={
        get active(){ return active; },
        get lastActivityAt(){ return lastActivity; },
        markActivity(){
            if(active) return;
            lastActivity=Date.now();
            arm();
        },
        enter: enterIdleSleep
    };

    function ensureOverlay(){
        let el=document.getElementById('pf-idle-sleep-overlay');
        if(el) return el;
        el=document.createElement('div');
        el.id='pf-idle-sleep-overlay';
        el.setAttribute('role','dialog');
        el.setAttribute('aria-modal','true');
        el.innerHTML=`<div class="pf-idle-card">
            <div class="pf-idle-icon" aria-hidden="true">↻</div>
            <h1>Session Paused</h1>
            <p>No activity for 10 minutes.<br>Refresh to continue.</p>
            <button id="pf-idle-refresh" type="button">Refresh</button>
        </div>`;
        const style=document.createElement('style');
        style.id='pf-idle-sleep-style';
        style.textContent=`
          #pf-idle-sleep-overlay{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(5,10,18,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif}
          #pf-idle-sleep-overlay.pf-show{display:flex}
          #pf-idle-sleep-overlay .pf-idle-card{width:min(430px,calc(100vw - 40px));box-sizing:border-box;text-align:center;background:#fff;color:#111827;border-radius:22px;padding:36px 30px 30px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
          #pf-idle-sleep-overlay .pf-idle-icon{width:58px;height:58px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:#eef4ff;font-size:32px;font-weight:700}
          #pf-idle-sleep-overlay h1{margin:0 0 14px;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.02em}
          #pf-idle-sleep-overlay p{margin:0 0 26px;font-size:17px;line-height:1.55;color:#4b5563}
          #pf-idle-refresh{width:100%;min-height:54px;border:0;border-radius:14px;background:#111827;color:#fff;font-size:18px;font-weight:800;cursor:pointer}
          #pf-idle-refresh:active{transform:translateY(1px)}
          @media (max-width:600px){#pf-idle-sleep-overlay .pf-idle-card{padding:30px 22px 24px;border-radius:20px}#pf-idle-sleep-overlay h1{font-size:27px}}
        `;
        document.head.appendChild(style);
        document.body.appendChild(el);
        el.querySelector('#pf-idle-refresh').addEventListener('click',()=>window.location.reload(),true);
        return el;
    }

    function blockWhileIdle(ev){
        if(!active) return;
        const t=ev.target;
        if(t && t.closest && t.closest('#pf-idle-refresh')) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
    }

    ['keydown','keypress','keyup','beforeinput','input','change','submit','click','dblclick','pointerdown','pointerup','touchstart','touchend','mousedown','mouseup'].forEach(type=>{
        document.addEventListener(type,blockWhileIdle,true);
    });

    function arm(){
        clearTimeout(timer);
        const remain=Math.max(0,IDLE_MS-(Date.now()-lastActivity));
        timer=setTimeout(enterIdleSleep,remain);
    }

    async function enterIdleSleep(){
        if(active) return;
        active=true;
        clearTimeout(timer);
        try{
            if(typeof window.flushCloudWorkspaceQueue==='function'){
                await Promise.race([
                    Promise.resolve(window.flushCloudWorkspaceQueue()),
                    new Promise(r=>setTimeout(r,1500))
                ]);
            }
        }catch(_){ }
        ensureOverlay().classList.add('pf-show');
        document.documentElement.classList.add('pf-idle-sleep-active');
    }

    // Hard network guard: once asleep, stale/legacy timers cannot reach Supabase.
    if(typeof window.fetch==='function' && !window.__pfIdleFetchWrapped){
        const nativeFetch=window.fetch.bind(window);
        window.__pfIdleFetchWrapped=true;
        window.fetch=function(...args){
            if(active){
                const err=new Error('PHARMFLOW_IDLE_SLEEP');
                err.code='PHARMFLOW_IDLE_SLEEP';
                return Promise.reject(err);
            }
            return nativeFetch(...args);
        };
    }

    const activity=()=>api.markActivity();
    ['pointerdown','touchstart','keydown','input'].forEach(type=>document.addEventListener(type,activity,true));
    document.addEventListener('DOMContentLoaded',()=>{ ensureOverlay(); arm(); },{once:true});
    if(document.readyState!=='loading'){ ensureOverlay(); arm(); }
    else arm();
})();

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
    lastReceivingSyncError:null,
    /* B10 Clean 14 — server cursors prevent full-ledger/full-manifest downloads
       on every poll. Cursors are runtime-only and reset on account change. */
    receivingCursorCreatedAt:null,
    receivingCursorTransactionId:null,
    receivingBootstrapComplete:false,
    manifestMetaBusy:false,
    /* B10 Clean16 — one adaptive READ scheduler + foreground de-duplication.
       Prevent refresh/focus/visibility from starting overlapping authority reads. */
    lastReceivingActivityAt:0,
    lastGenerationPollAt:0,
    lastManifestMetaPollAt:0,
    lastReceivingPollAt:0,
    foregroundSyncPromise:null,
    lastForegroundSyncAt:0,
    /* B10 Clean17 — one startup authority flight and dirty-only compatibility saves. */
    startupAuthorityPromise:null,
    startupAuthorityReady:false,
    lastSavedWorkspaceSignature:"",
    /* B10 Clean21 — compatibility Cloud Workspace writes are structural and
       dirty-driven only. Local autosave/heartbeat events must never create
       Supabase writes while the operator is idle. */
    lastStructuralCloudSignature:"",
    /* B10 Clean18 — canonical read gates. These live at the RPC-owning
       functions, so legacy/startup/UI callers cannot recreate 1 s / 3 s
       bursts by bypassing the adaptive scheduler. */
    lastGenerationReadAt:0,
    lastManifestFullReadAt:0,
    lastTransactionReadAt:0
};

function cloudWorkspacePharmacyId(){
    return (typeof AuthState!=="undefined" && AuthState.context) ? AuthState.context.pharmacy_id : null;
}

function cloudWorkspaceDeviceId(){
    if(PharmFlowCloudWorkspace.deviceId) return PharmFlowCloudWorkspace.deviceId;
    PharmFlowCloudWorkspace.deviceId = (typeof ensureDeviceId==="function" ? ensureDeviceId() : (crypto.randomUUID?.() || String(Date.now())));
    return PharmFlowCloudWorkspace.deviceId;
}

/* The manifest is the structural authority.  A missing or empty manifest
   after Reset must clear every active-order projection and notify the same UI
   listeners used by a normal structural update. */
function applyAuthoritativeEmptyActiveOrders(source){
    if(typeof AppState==="undefined") return false;

    AppState.workspace=createEmptyWorkspace();
    resetStatistics();
    rebuildStateIndexes();
    deleteWorkspaceSnapshot?.();

    AppEvents.emit("files:updated",{source});
    AppEvents.emit("receiving:updated",{source});
    refreshEntireUI?.();
    return true;
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
    const resolution=tx?.gtinResolution;
    const learnedQuantity=toNumber(tx?.quantity,0)>0 &&
        resolution?.kind==="PHARMACY_LEARNED" &&
        toSafeString(resolution.mappingId) &&
        toSafeString(resolution.mappingRevision) &&
        toSafeString(resolution.identifierKey) &&
        normalizeItemCode(resolution.resolvedItemCode);
    const rpcName=learnedQuantity
        ? "append_pharmflow_learned_transaction_v3"
        : "append_pharmflow_receiving_action_v4";
    /* Existing durable learned receipts may have been queued before the
       transaction state retained alphanumeric displays. Their authoritative
       V2 key remains with the mapping provenance, so use it on retry rather
       than the legacy digits-only transaction field. */
    const identifierDisplay=learnedQuantity
        ? toSafeString(
            resolution.identifierDisplay ||
            resolution.identifierKey ||
            tx.gtin ||
            ""
        ).trim()
        : toSafeString(tx.gtin||"");
    const params={
        p_pharmacy_id:pharmacyId,
        p_transaction_id:tx.transactionId,
        p_order_number:toSafeString(
            tx.selectedOrderNumber ||
            tx.orderId ||
            ""
        ),
        p_item_code:toSafeString(tx.itemCode||""),
        p_item_name:toSafeString(tx.itemName||""),
        p_gtin:identifierDisplay,
        p_quantity:toNumber(tx.quantity,0),
        p_source:toSafeString(tx.source||"RECEIVING"),
        p_device_id:toSafeString(
            tx.deviceId ||
            cloudWorkspaceDeviceId()
        ),
        p_occurred_at:tx.dateTime||nowISO(),
        p_payload:tx
    };
    if(learnedQuantity){
        params.p_mapping_id=toSafeString(resolution.mappingId);
        params.p_mapping_revision=toSafeString(resolution.mappingRevision);
    }
    let acknowledgement;
    try{
        acknowledgement=await authRpc(rpcName,params);
    }catch(error){
        /* Temporary pre-migration compatibility only. Never downgrade on a
           validation, authorization, network or server error. */
        const message=String(error?.message||"");
        if(!learnedQuantity && /PGRST202|function .*append_pharmflow_receiving_action_v4.*does not exist|append_pharmflow_receiving_action_v4.*schema cache/i.test(message)){
            acknowledgement=await authRpc("append_pharmflow_cloud_transaction_v2",params);
        }else{
            throw error;
        }
    }
    const ackRow=Array.isArray(acknowledgement)?acknowledgement[0]:acknowledgement;
    if(!learnedQuantity && ackRow && ackRow.acknowledged===false){
        throw new Error("Receiving action was not acknowledged by the server");
    }

    const local=(AppState?.workspace?.receivingHistory||[])
        .find(row=>row.transactionId===tx.transactionId);

    if(local){
        local.cloudSynced=true;
    }

    AppEvents.emit("receiving:cloud-confirmed",{transactionId:tx.transactionId});

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
        const CHUNK_SIZE=1;

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
    PharmFlowCloudWorkspace.startupAuthorityPromise=null;
    PharmFlowCloudWorkspace.startupAuthorityReady=false;
    PharmFlowCloudWorkspace.lastSavedWorkspaceSignature="";
    PharmFlowCloudWorkspace.lastStructuralCloudSignature="";
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
        PharmFlowCloudWorkspace.receivingCursorCreatedAt=null;
        PharmFlowCloudWorkspace.receivingCursorTransactionId=null;
        PharmFlowCloudWorkspace.receivingBootstrapComplete=false;
        PharmFlowCloudWorkspace.manifestMetaBusy=false;
        PharmFlowCloudWorkspace.generation=null;
        PharmFlowCloudWorkspace.lastGenerationReadAt=0;
        PharmFlowCloudWorkspace.lastManifestFullReadAt=0;
        PharmFlowCloudWorkspace.lastTransactionReadAt=0;
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


async function getCloudWorkspaceGeneration(options={}){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || !pharmacyId || typeof authRpc!=="function") return null;

    const now=Date.now();
    if(
        options?.force!==true &&
        PharmFlowCloudWorkspace.generation!==null &&
        now-Number(PharmFlowCloudWorkspace.lastGenerationReadAt||0)<30000
    ){
        return Number(PharmFlowCloudWorkspace.generation||0);
    }
    PharmFlowCloudWorkspace.lastGenerationReadAt=now;

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
        /* Handheld assignment is shared access scope, not a desktop-only
           view preference. It must travel with the Active Order Manifest so
           refreshes and Handheld devices restore the exact same assignment. */
        handheldOrderNumbers:Array.isArray(workspace.handheldOrderNumbers)
            ? deepClone(workspace.handheldOrderNumbers)
            : [],
        handheldScopeConfigured:
            workspace.handheldScopeConfigured===true,
        orderFiles:deepClone(workspace.orderFiles||[]),
        mappingFiles:deepClone(workspace.mappingFiles||[]),
        orderData,
        mappingData:deepClone(workspace.mappingData||[])
    };
}

window.serializeActiveOrderManifest=serializeActiveOrderManifest;

async function patchActiveOrderPriorities(changes){
    const pharmacyId=cloudWorkspacePharmacyId();
    const normalized=Array.from(new Map(
        (Array.isArray(changes)?changes:[])
            .map(change=>[
                toSafeString(change?.itemCode||change?.itemNumber||"").trim(),
                toSafeString(change?.priorityType||"").trim().toUpperCase()
            ])
            .filter(([itemCode,priorityType])=>
                itemCode && ["","SHORT","NEW"].includes(priorityType)
            )
    ),([itemCode,priorityType])=>({itemCode,priorityType}));

    if(
        !navigator.onLine || !pharmacyId ||
        typeof authRpc!=="function" || !normalized.length
    ){
        return false;
    }

    try{
        const result=await authRpc(
            "patch_pharmflow_item_priorities_v2",
            {
                p_pharmacy_id:pharmacyId,
                p_changes:normalized,
                p_expected_generation:Number(
                    PharmFlowCloudWorkspace.generation||0
                ),
                p_expected_revision:Number(
                    PharmFlowCloudWorkspace.activeManifestRevision||0
                )
            }
        );
        const row=Array.isArray(result)?result[0]:result;

        if(!row || Number(row.changed_items||0)!==normalized.length){
            throw new Error("Priority patch verification failed");
        }

        PharmFlowCloudWorkspace.activeManifestRevision=
            Number(row.revision||0);
        PharmFlowCloudWorkspace.lastPrioritySaveError=null;
        return true;
    }catch(error){
        const message=error?.message||String(error);
        PharmFlowCloudWorkspace.lastPrioritySaveError=message;

        if(
            message.includes("STALE_ACTIVE_ORDER_MANIFEST_REVISION") ||
            message.includes("STALE_WORKSPACE_GENERATION")
        ){
            try{
                await pullActiveOrderManifest({force:true,clearIfMissing:true});
            }catch(_){}
        }

        Logger.error("Item priority patch failed",{
            pharmacyId,
            changes:normalized.length,
            error:message
        });
        return false;
    }
}

window.patchActiveOrderPriorities=patchActiveOrderPriorities;

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
            "save_pharmflow_active_order_manifest_v4",
            {
                p_pharmacy_id:pharmacyId,
                p_manifest:manifest,
                p_expected_generation:Number(PharmFlowCloudWorkspace.generation||0),
                p_expected_revision:Number(
                    PharmFlowCloudWorkspace.activeManifestRevision||0
                )
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

        /* Assignment is part of the manifest authority.  Verify it as well
           so the desktop never confirms an assignment that only existed in
           local memory. */
        const normalizeAssignedOrders=value=>[...new Set(
            (Array.isArray(value)?value:[])
                .map(order=>String(order||"").trim().toUpperCase())
                .filter(Boolean)
        )].sort();
        const expectedAssignedOrders=normalizeAssignedOrders(
            manifest.handheldOrderNumbers
        );
        const persistedAssignedOrders=normalizeAssignedOrders(
            verify.manifest.handheldOrderNumbers
        );
        const assignmentMatches=
            Boolean(manifest.handheldScopeConfigured)===
                Boolean(verify.manifest.handheldScopeConfigured) &&
            expectedAssignedOrders.length===persistedAssignedOrders.length &&
            expectedAssignedOrders.every(
                (order,index)=>order===persistedAssignedOrders[index]
            );

        if(!assignmentMatches){
            throw new Error(
                "Handheld assignment was not persisted on the server"
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

        /* Another device changed the Active Orders after this browser last
           read them. Never overwrite that newer server structure with this
           stale local copy. Pull the authority now; the explicit structural
           caller will report failure and may retry from the fresh revision. */
        if(message.includes("STALE_ACTIVE_ORDER_MANIFEST_REVISION")){
            try{
                await pullActiveOrderManifest({force:true,clearIfMissing:true});
            }catch(_){}
        }

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

    /* A manifest refresh must not erase newer priority clicks that are still
       waiting for their small server patch. */
    window.applyPendingItemPrioritySelections?.();

    /* B10 Clean15.7 — the Active Order Manifest is structural authority only.
       Its orderData carries the uploaded/order structure and can contain stale
       receivedQty values. We deliberately preserved the device transaction
       ledger above, so immediately project that ledger back onto the freshly
       applied structure BEFORE statistics, persistence, events, or rendering.

       Without this step a manifest refresh can visually roll Received back
       (for example 3 -> 0/1) while the device-local Batch Qty correctly keeps
       counting. The next scan then appears to restart Received from 1.
       Rebuilding here preserves every successful local/cloud transaction and
       keeps Batch Qty independent from the shared cumulative Received total. */
    if(typeof rebuildReceivingQuantitiesFromLedger === "function"){
        rebuildReceivingQuantitiesFromLedger();
    }

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
    const now=Date.now();

    if(
        options?.force!==true &&
        PharmFlowCloudWorkspace.lastManifestFullReadAt>0 &&
        now-PharmFlowCloudWorkspace.lastManifestFullReadAt<10000
    ){
        return PharmFlowCloudWorkspace.activeManifestPresent===true;
    }

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
    PharmFlowCloudWorkspace.lastManifestFullReadAt=now;

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
                applyAuthoritativeEmptyActiveOrders("server-authority-empty");
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
            PharmFlowCloudWorkspace.activeManifestRevision=0;

            Logger.warn(
                "Active Order Manifest returned without active order data",
                {
                    pharmacyId,
                    revision:Number(row.revision||0),
                    files:incomingFiles.length,
                    items:incomingData.length
                }
            );

            if(options?.clearIfMissing===true){
                applyAuthoritativeEmptyActiveOrders("server-authority-empty-manifest");
            }

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
                Number(file?.rows??file?.rowCount??0)
            ])
        );

        const remoteSignature=JSON.stringify(
            incomingFiles.map(file=>[
                normalizeOrderNumber(
                    file?.documentId ||
                    file?.orderNumber ||
                    ""
                ),
                Number(file?.rows??file?.rowCount??0)
            ])
        );

        const mustApply=
            options?.forceApply===true ||
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

async function pullActiveOrderManifestAuthority(options={}){
    /* A startup/focus pull can overlap another manifest request. The normal
       pull correctly rejects overlapping reads, but startup must not accept a
       stale legacy workspace merely because that first authority read was
       busy. Wait briefly and retry the authoritative manifest. */
    for(let attempt=1;attempt<=4;attempt++){
        const pulled=await pullActiveOrderManifest({
            ...options,
            force:true
        });

        if(pulled===true){
            return true;
        }

        await new Promise(resolve=>setTimeout(resolve,150*attempt));
    }

    return false;
}

/* A Handheld assignment is a small authorization change, but it still uses
   the manifest generation fence. Refresh that authority immediately before
   the write so an operator never has to retry after a normal page refresh. */
async function prepareActiveOrderManifestWrite(){
    const generation=await getCloudWorkspaceGeneration({force:true});
    if(generation===null) return false;

    const pulled=await pullActiveOrderManifestAuthority({
        forceApply:true,
        clearIfMissing:true
    });
    if(!pulled) return false;

    PharmFlowCloudWorkspace.generation=Number(generation);
    return true;
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
window.prepareActiveOrderManifestWrite=prepareActiveOrderManifestWrite;
window.clearActiveOrderManifest=clearActiveOrderManifest;

/* B10 Clean 9 — structural Active Order authority.
   REMOVE must update the dedicated Active Order Manifest, not only the legacy
   Cloud Workspace snapshot. The manifest is what restores Active Orders on
   refresh/other PCs, so a successful structural change is not acknowledged
   until the server manifest exactly reflects the current local structure. */
function currentActiveManifestSignature(){
    const manifest=serializeActiveOrderManifest();
    const files=Array.isArray(manifest?.orderFiles)?manifest.orderFiles:[];
    const data=Array.isArray(manifest?.orderData)?manifest.orderData:[];
    return {
        manifest,
        fileCount:files.length,
        itemCount:data.length,
        orders:files.map(file=>normalizeOrderNumber(file?.documentId||file?.orderNumber||""))
            .filter(Boolean).sort()
    };
}

async function verifyActiveOrderManifestMatchesLocal(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!pharmacyId || typeof authRpc!=="function") return false;

    const local=currentActiveManifestSignature();
    const result=await authRpc(
        "get_pharmflow_active_order_manifest_v3",
        {p_pharmacy_id:pharmacyId}
    );
    const row=Array.isArray(result)?result[0]:result;

    if(local.fileCount===0){
        const remoteFiles=Array.isArray(row?.manifest?.orderFiles)?row.manifest.orderFiles:[];
        const remoteData=Array.isArray(row?.manifest?.orderData)?row.manifest.orderData:[];
        return !row?.manifest || (remoteFiles.length===0 && remoteData.length===0);
    }

    if(!row?.manifest) return false;
    const remoteFiles=Array.isArray(row.manifest.orderFiles)?row.manifest.orderFiles:[];
    const remoteData=Array.isArray(row.manifest.orderData)?row.manifest.orderData:[];
    const remoteOrders=remoteFiles.map(file=>normalizeOrderNumber(file?.documentId||file?.orderNumber||""))
        .filter(Boolean).sort();

    return remoteFiles.length===local.fileCount &&
        remoteData.length===local.itemCount &&
        JSON.stringify(remoteOrders)===JSON.stringify(local.orders);
}

async function syncActiveOrderManifestAfterStructuralChange(){
    const local=currentActiveManifestSignature();
    let saved=false;

    if(local.fileCount===0){
        saved=await clearActiveOrderManifest();
    }else{
        saved=await saveActiveOrderManifest({silent:true});
    }
    if(saved!==true) return false;

    try{
        return await verifyActiveOrderManifestMatchesLocal();
    }catch(error){
        Logger.error("Active Order Manifest structural verification failed",error);
        return false;
    }
}

window.verifyActiveOrderManifestMatchesLocal=verifyActiveOrderManifestMatchesLocal;
window.syncActiveOrderManifestAfterStructuralChange=syncActiveOrderManifestAfterStructuralChange;




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
        markCurrentStructureCloudSynced();

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
   2C.11.4.12 — STRUCTURAL WORKSPACE PERSISTENCE

   Active Order Manifest is the structural authority, while the legacy full
   Cloud Workspace remains a compatibility/session snapshot. Structural
   operations such as Finalize, Remove Active Order and Reset may legitimately
   leave an EMPTY workspace. The ordinary autosave intentionally refuses to
   save an empty workspace, so using it after a structural deletion leaves a
   stale server snapshot that can hydrate the deleted Order back into the UI.

   This is the one canonical structural-save path. It ALWAYS persists the
   complete current workspace, including EMPTY, and cancels any pending normal
   autosave before writing. Finalize keeps a compatibility wrapper below so
   previously verified callers are not changed.
*/
async function syncCloudWorkspaceAfterStructuralChange(reason="Workspace structure synchronized"){
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
        markCurrentStructureCloudSynced();

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

window.syncCloudWorkspaceAfterStructuralChange=syncCloudWorkspaceAfterStructuralChange;

/* Canonical structural persistence for Active Receiving.
   Order structure is persisted to the Active Order Manifest FIRST, then the
   compatibility Cloud Workspace snapshot. A caller may show success only when
   BOTH authorities confirm the same state. */
async function syncReceivingStructureAfterChange(reason="Receiving structure synchronized"){
    const manifestSaved=await syncActiveOrderManifestAfterStructuralChange();
    if(manifestSaved!==true){
        setCloudWorkspaceStatus("offline","Active Order structure not confirmed");
        return false;
    }

    const workspaceSaved=await syncCloudWorkspaceAfterStructuralChange(reason);
    if(workspaceSaved!==true) return false;

    const verified=await verifyActiveOrderManifestMatchesLocal();
    if(verified!==true){
        setCloudWorkspaceStatus("offline","Active Order structure verification failed");
        return false;
    }
    return true;
}
window.syncReceivingStructureAfterChange=syncReceivingStructureAfterChange;

async function syncCloudWorkspaceAfterFinalize(reason="Finalize synchronized"){
    return syncCloudWorkspaceAfterStructuralChange(reason);
}
window.syncCloudWorkspaceAfterFinalize=syncCloudWorkspaceAfterFinalize;


function currentCloudWorkspaceSignature(){
    return stableCloudWorkspaceSignature(serializeCurrentWorkspace(),{});
}

function currentStructuralCloudSignature(){
    try{
        return JSON.stringify(serializeActiveOrderManifest());
    }catch(_){
        return "";
    }
}

function markCurrentStructureCloudSynced(){
    PharmFlowCloudWorkspace.lastStructuralCloudSignature=
        currentStructuralCloudSignature();
}

async function saveCloudWorkspaceSnapshot(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!navigator.onLine || typeof authRpc!=="function" || !pharmacyId) return;
    if(PharmFlowCloudWorkspace.hydratedPharmacyId!==pharmacyId) return;
    /* Explicit clear has its own RPC. A fresh empty PC must never erase the cloud. */
    if(!Array.isArray(AppState?.workspace?.orderData) || !AppState.workspace.orderData.length) return;

    const signature=currentCloudWorkspaceSignature();
    if(signature===PharmFlowCloudWorkspace.lastSavedWorkspaceSignature) return;

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

        PharmFlowCloudWorkspace.lastSavedWorkspaceSignature=signature;
        PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature=signature;
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

/* The Active Order Manifest is the only authority for uploaded order
   structure. The legacy Cloud Workspace remains a compatibility source for
   non-structural state, but it must never replace orderFiles/orderData after
   the Manifest has loaded. The receiving ledger remains authoritative for
   quantities once its initial bootstrap completes. */
function restoreCompatibilityWorkspaceState(cloudState){
    const preserveManifestStructure=
        PharmFlowCloudWorkspace.activeManifestPresent===true;

    const manifestStructure=preserveManifestStructure
        ? {
            orderId:AppState?.workspace?.orderId||null,
            orderName:AppState?.workspace?.orderName||"",
            createdAt:AppState?.workspace?.createdAt||null,
            startedAt:AppState?.workspace?.startedAt||null,
            active:!!AppState?.workspace?.active,
            selectedOrderNumber:
                AppState?.workspace?.selectedOrderNumber||"",
            selectedOrderNumbers:deepClone(
                AppState?.workspace?.selectedOrderNumbers||[]
            ),
            handheldOrderNumbers:deepClone(
                AppState?.workspace?.handheldOrderNumbers||[]
            ),
            handheldScopeConfigured:
                AppState?.workspace?.handheldScopeConfigured===true,
            orderFiles:deepClone(AppState?.workspace?.orderFiles||[]),
            mappingFiles:deepClone(AppState?.workspace?.mappingFiles||[]),
            orderData:deepClone(AppState?.workspace?.orderData||[]),
            mappingData:deepClone(AppState?.workspace?.mappingData||[])
        }
        : null;

    const preserveLedger=
        PharmFlowCloudWorkspace.receivingBootstrapComplete===true;
    const authoritativeHistory=preserveLedger
        ? deepClone(AppState?.workspace?.receivingHistory||[])
        : null;

    const restored=restoreWorkspaceState(cloudState);
    if(!restored){
        return restored;
    }

    if(manifestStructure){
        Object.assign(AppState.workspace,manifestStructure);
    }

    if(preserveLedger){
        AppState.workspace.receivingHistory=authoritativeHistory;
    }

    rebuildStateIndexes();

    if(preserveLedger){
        rebuildReceivingQuantitiesFromLedger();
    }

    recalculateStatistics();
    return true;
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
        correctionReason:toSafeString(payload?.correctionReason||""),
        correctsTransactionId:toSafeString(payload?.correctsTransactionId||""),
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

async function pullCloudWorkspaceTransactions(options={}){
    const pharmacyId=cloudWorkspacePharmacyId();
    const now=Date.now();

    if(
        options?.force!==true &&
        PharmFlowCloudWorkspace.lastTransactionReadAt>0 &&
        now-PharmFlowCloudWorkspace.lastTransactionReadAt<2500
    ){
        return true;
    }

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
    PharmFlowCloudWorkspace.lastTransactionReadAt=now;

    try{
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

        /* B10 Clean 14: the first read after login is a bounded bootstrap.
           Every later poll asks only for rows AFTER the server-created cursor.
           This preserves deterministic ledger authority without repeatedly
           downloading up to 5,000 historical transactions every second. */
        const pageLimit=500;
        let changedAny=false;
        let pages=0;

        while(pages<10){
            const rows=await authRpc(
                "list_pharmflow_cloud_transactions_delta_v3",
                {
                    p_pharmacy_id:pharmacyId,
                    p_after_created_at:PharmFlowCloudWorkspace.receivingBootstrapComplete
                        ? PharmFlowCloudWorkspace.receivingCursorCreatedAt
                        : null,
                    p_after_transaction_id:PharmFlowCloudWorkspace.receivingBootstrapComplete
                        ? PharmFlowCloudWorkspace.receivingCursorTransactionId
                        : null,
                    p_limit:pageLimit
                }
            );

            const batch=Array.isArray(rows)?rows:[];
            if(!batch.length){
                PharmFlowCloudWorkspace.receivingBootstrapComplete=true;
                break;
            }

            PharmFlowCloudWorkspace.applyingRemote=true;
            if(mergeCloudReceivingLedger(batch)){
                changedAny=true;
            }

            const last=batch[batch.length-1];
            PharmFlowCloudWorkspace.receivingCursorCreatedAt=
                last?.sync_created_at || PharmFlowCloudWorkspace.receivingCursorCreatedAt;
            PharmFlowCloudWorkspace.receivingCursorTransactionId=
                last?.transaction_id || PharmFlowCloudWorkspace.receivingCursorTransactionId;
            PharmFlowCloudWorkspace.receivingBootstrapComplete=true;
            pages+=1;

            if(batch.length<pageLimit) break;
        }

        if(changedAny){
            rebuildStateIndexes();
            recalculateStatistics();
            saveWorkspaceSnapshot();

            AppEvents.emit(
                "receiving:updated",
                {source:"cloud-ledger-delta",synchronized:true}
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
        Logger.warn("Receiving delta pull failed",error);
        PharmFlowCloudWorkspace.lastReceivingSyncError=error?.message || String(error);
        setCloudWorkspaceStatus("offline","Receiving sync unavailable");
        return false;
    }
    finally{
        PharmFlowCloudWorkspace.applyingRemote=false;
        PharmFlowCloudWorkspace.receivingSyncBusy=false;
    }
}

async function pollActiveOrderManifestMeta(){
    const pharmacyId=cloudWorkspacePharmacyId();
    if(
        !navigator.onLine || !pharmacyId || typeof authRpc!=="function" ||
        PharmFlowCloudWorkspace.manifestMetaBusy ||
        PharmFlowCloudWorkspace.contextSwitching
    ) return false;

    PharmFlowCloudWorkspace.manifestMetaBusy=true;
    try{
        const result=await authRpc(
            "get_pharmflow_active_order_manifest_meta_v1",
            {p_pharmacy_id:pharmacyId}
        );
        const row=Array.isArray(result)?result[0]:result;
        const serverPresent=!!row?.manifest_present;
        const serverRevision=Number(row?.revision||0);
        const localHasOrders=!!(
            Array.isArray(AppState?.workspace?.orderData) &&
            AppState.workspace.orderData.length
        );

        if(!serverPresent){
            if(PharmFlowCloudWorkspace.activeManifestPresent || localHasOrders){
                await pullActiveOrderManifest({clearIfMissing:true});
            }
            return true;
        }

        if(
            !localHasOrders ||
            !PharmFlowCloudWorkspace.activeManifestPresent ||
            serverRevision>Number(PharmFlowCloudWorkspace.activeManifestRevision||0)
        ){
            await pullActiveOrderManifest({clearIfMissing:true});
        }
        return true;
    }catch(error){
        Logger.warn("Active Order Manifest metadata poll failed",error);
        return false;
    }finally{
        PharmFlowCloudWorkspace.manifestMetaBusy=false;
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
        await pullActiveOrderManifestAuthority({clearIfMissing:true});
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
                restoreCompatibilityWorkspaceState(cloudState);
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
                PharmFlowCloudWorkspace.lastSavedWorkspaceSignature=
                    PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature;
                markCurrentStructureCloudSynced();
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
                applyAuthoritativeEmptyActiveOrders("startup-authority-empty");

                PharmFlowCloudWorkspace.applyingRemote=false;
            }

            await pullActiveOrderManifestAuthority({clearIfMissing:true});
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


async function ensureStartupCloudAuthority(){
    ensureCloudAccountContextIsolation();
    const pharmacyId=cloudWorkspacePharmacyId();
    if(!pharmacyId) return false;

    if(
        PharmFlowCloudWorkspace.startupAuthorityReady===true &&
        PharmFlowCloudWorkspace.hydratedPharmacyId===pharmacyId
    ){
        return true;
    }

    if(PharmFlowCloudWorkspace.startupAuthorityPromise){
        return PharmFlowCloudWorkspace.startupAuthorityPromise;
    }

    PharmFlowCloudWorkspace.startupAuthorityPromise=(async()=>{
        PharmFlowCloudWorkspace.loginAuthorityReady=false;
        try{
            const restored=await restoreCloudWorkspaceOnLogin();
            if(restored!==true) return false;
            await repairSharedReceivingLedgerFromLocal();
            await flushCloudWorkspaceQueue();
            PharmFlowCloudWorkspace.loginAuthorityReady=true;
            PharmFlowCloudWorkspace.startupAuthorityReady=true;
            const now=Date.now();
            PharmFlowCloudWorkspace.lastGenerationPollAt=now;
            PharmFlowCloudWorkspace.lastManifestMetaPollAt=now;
            PharmFlowCloudWorkspace.lastReceivingPollAt=now;
            setCloudWorkspaceStatus("synced","Server authority reconciled after sign-in");
            return true;
        }catch(error){
            PharmFlowCloudWorkspace.loginAuthorityReady=false;
            PharmFlowCloudWorkspace.startupAuthorityReady=false;
            Logger.error("Sign-in cloud authority bootstrap failed",error);
            setCloudWorkspaceStatus("offline",error?.message||"Unable to reconcile server authority");
            return false;
        }finally{
            PharmFlowCloudWorkspace.startupAuthorityPromise=null;
        }
    })();

    return PharmFlowCloudWorkspace.startupAuthorityPromise;
}
window.ensureStartupCloudAuthority=ensureStartupCloudAuthority;

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

                    /* B11 Clean5: Last Scan is device-local UI state. Preserve
                       the current device result while applying the legacy
                       workspace snapshot; a remote snapshot must never clear
                       or replace the operator's newer scan card. */
                    const deviceLocalLastScan=AppState?.workspace?.lastScan
                        ? deepClone(AppState.workspace.lastScan)
                        : null;

                    restoreCompatibilityWorkspaceState(cloudState);
                    AppState.workspace.lastScan=deviceLocalLastScan;

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

                applyAuthoritativeEmptyActiveOrders("reconcile-authority-empty");

                PharmFlowCloudWorkspace
                    .lastAppliedWorkspaceSignature="EMPTY";

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

    /* Active Order structure has explicit owners: upload, remove, finalize
       and reset. Generic files:updated events are render/local-persistence
       notifications only. They must never write the server Manifest because
       a stale browser snapshot could replace newer orders from another PC. */
    AppEvents.on("files:updated",event=>{
        try{
            saveWorkspaceSnapshot?.();
        }catch(_){}
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
        PharmFlowCloudWorkspace.startupAuthorityReady=false;
        ensureStartupCloudAuthority();
    });

    /* B10 Clean20 — Idle polling consolidation (building on Clean16).
       Clean14 already made receiving reads incremental, but this branch had
       regressed to independent fixed 1 s + 3 s loops. Restore one adaptive
       scheduler: immediate writes remain immediate; background READs back off. */
    /* B10 Clean20 — receiving activity, not generic page activity, owns the
       fast-sync window. Merely touching/focusing the page must not keep a
       workstation in 3-second cloud polling indefinitely. */
    const markReceivingCloudActivity=()=>{
        PharmFlowCloudWorkspace.lastReceivingActivityAt=Date.now();
    };
    AppEvents.on("receiving:transaction",markReceivingCloudActivity);
    AppEvents.on("receiving:transaction",()=>window.PharmFlowIdleSleep?.markActivity());

    const runAdaptiveCloudSync=async()=>{
        PharmFlowCloudWorkspace.pollTimer=null;
        PharmFlowCloudWorkspace.receivingSyncTimer=null;

        if(document.visibilityState!=="visible"){
            PharmFlowCloudWorkspace.pollTimer=setTimeout(runAdaptiveCloudSync,15000);
            return;
        }

        ensureCloudAccountContextIsolation();
        if(PharmFlowCloudWorkspace.startupAuthorityReady!==true){
            await ensureStartupCloudAuthority();
            PharmFlowCloudWorkspace.pollTimer=setTimeout(runAdaptiveCloudSync,3000);
            return;
        }
        if(PharmFlowCloudWorkspace.contextSwitching){
            PharmFlowCloudWorkspace.pollTimer=setTimeout(runAdaptiveCloudSync,3000);
            return;
        }

        const now=Date.now();
        const receivingActive=(now-Number(PharmFlowCloudWorkspace.lastReceivingActivityAt||0))<30000;
        const receivingEvery=receivingActive ? 3000 : 15000;
        /* The metadata RPC returns one tiny row. Fifteen seconds keeps other
           workstations current without re-downloading the full Manifest. */
        const manifestEvery=15000;
        const generationEvery=60000;

        try{
            await repairSharedReceivingLedgerFromLocal();
            await flushCloudWorkspaceQueue();

            if(now-PharmFlowCloudWorkspace.lastReceivingPollAt>=receivingEvery){
                PharmFlowCloudWorkspace.lastReceivingPollAt=now;
                await pullCloudWorkspaceTransactions();
            }
            if(now-PharmFlowCloudWorkspace.lastManifestMetaPollAt>=manifestEvery){
                PharmFlowCloudWorkspace.lastManifestMetaPollAt=now;
                await pollActiveOrderManifestMeta();
            }
            if(now-PharmFlowCloudWorkspace.lastGenerationPollAt>=generationEvery){
                PharmFlowCloudWorkspace.lastGenerationPollAt=now;
                await reconcileWorkspaceGeneration();
            }
            attemptCloudWorkspaceHydration();
        }finally{
            PharmFlowCloudWorkspace.pollTimer=setTimeout(
                runAdaptiveCloudSync,
                receivingActive ? 3000 : 15000
            );
        }
    };

    /* focus + visibilitychange commonly fire together on mobile. Run exactly
       one foreground authority reconciliation and reuse it for both events. */
    const syncForegroundAuthority=()=>{
        const now=Date.now();
        if(PharmFlowCloudWorkspace.foregroundSyncPromise){
            return PharmFlowCloudWorkspace.foregroundSyncPromise;
        }
        if(now-PharmFlowCloudWorkspace.lastForegroundSyncAt<1500){
            return Promise.resolve(true);
        }
        PharmFlowCloudWorkspace.lastForegroundSyncAt=now;

        PharmFlowCloudWorkspace.foregroundSyncPromise=(async()=>{
            if(PharmFlowCloudWorkspace.startupAuthorityReady!==true){
                return await ensureStartupCloudAuthority();
            }
            const hasLocalOrders=
                Array.isArray(AppState?.workspace?.orderFiles) &&
                AppState.workspace.orderFiles.length &&
                Array.isArray(AppState?.workspace?.orderData) &&
                AppState.workspace.orderData.length;

            if(hasLocalOrders){
                await pullActiveOrderManifest({clearIfMissing:true});
            }else{
                await bootstrapActiveOrdersOnEmptyDevice();
            }

            if(PharmFlowCloudWorkspace.loginAuthorityReady===true){
                await reconcileWorkspaceGeneration();
                await reconcileCloudWorkspaceAuthority();
            }

            await flushCloudWorkspaceQueue();
            await pullCloudWorkspaceTransactions();
            return true;
        })().finally(()=>{
            PharmFlowCloudWorkspace.foregroundSyncPromise=null;
        });
        return PharmFlowCloudWorkspace.foregroundSyncPromise;
    };

    PharmFlowCloudWorkspace.contextWatchTimer=setInterval(
        attemptCloudWorkspaceHydration,
        10000
    );
    runAdaptiveCloudSync();

    window.addEventListener("focus",()=>{
        syncForegroundAuthority();
    });

    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState==="visible"){
            syncForegroundAuthority();
        }
    });
    attemptCloudWorkspaceHydration();
}

/* Bind immediately; do not wait 100 ms and risk missing auth:context-ready. */
initializePharmFlowCloudWorkspace();
