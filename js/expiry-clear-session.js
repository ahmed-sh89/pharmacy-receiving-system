/* Durable Desktop rotation intent. Server receipts own the cutover; no historical deletes. */
let expiryClearInFlight=null;
function expiryClearIntentKey(){return 'pharmflow_expiry_clear_v1/'+expiryDraftScope()+'/'+expirySignedAuthIdentity()+'/'+expiryDeviceId();}
function expiryHasClearIntent(){return !expiryIsHandheld() && !!localStorage.getItem(expiryClearIntentKey());}
async function expiryAssertClearSafe(){
    const e=ExpiryCaptureEngine;
    if((e.busy && !e.sessionClearing) || e.resolving || e.saveUncertain || e.currentItem || e.operation || e.pendingDraft)throw new Error('Save or reconcile the current capture before clearing the session');
    const scope=expiryDraftScope(),auth=expirySignedAuthIdentity();
    await reconcileExpiryDesktopDrafts();
    const drafts=[await ExpiryDraftStore.get(scope),...(await ExpiryDraftStore.list(scope)).map(x=>x.draft)];
    if(scope!==expiryDraftScope() || auth!==expirySignedAuthIdentity())throw new Error('Clear account changed');
    if(drafts.some(x=>x && (x.item || x.operation || x.status==='UNCERTAIN')))throw new Error('A durable capture is pending — reconcile it before clearing');
    if((e.busy && !e.sessionClearing) || e.resolving || e.saveUncertain || e.currentItem || e.operation || e.pendingDraft)throw new Error('A capture started while checking — reconcile it first');
    const prefix='pharmflow_expiry_desktop_intent/'+scope+'/'+auth;
    for(let i=0;i<sessionStorage.length;i++){
        const k=sessionStorage.key(i);
        if(k?.startsWith(prefix) || k?.startsWith('pharmflow_expiry_correction_'+scope+'/'))throw new Error('A correction is pending — check or retry it first');
    }
}
async function reconcileExpiryClearSession(){
    if(expiryIsHandheld())return false;
    const key=expiryClearIntentKey(),stored=localStorage.getItem(key);
    if(ExpiryCaptureEngine.sessionClearing && ExpiryCaptureEngine.sessionClearingKey && ExpiryCaptureEngine.sessionClearingKey!==key){
        // Old identity's durable request stays scoped in storage; its UI freeze cannot lock another account.
        ExpiryCaptureEngine.sessionClearing=false;ExpiryCaptureEngine.busy=false;
    }
    if(!stored)return false;
    if(expiryClearInFlight?.key===key)return expiryClearInFlight.promise;
    const scope=expiryDraftScope(),auth=expirySignedAuthIdentity(),engine=ExpiryCaptureEngine;
    const args=JSON.parse(stored);
    if(args.p_pharmacy_id!==expiryPharmacyId() || args.p_device_id!==expiryDeviceId())throw new Error('Clear intent scope mismatch');
    engine.busy=true;engine.sessionClearing=true;engine.sessionClearingKey=key;
    const promise=(async()=>{
        const ack=await authRpc('clear_pharmflow_expiry_desktop_session_v1',args);
        if(scope!==expiryDraftScope() || auth!==expirySignedAuthIdentity() || ack?.status!=='CLEARED' || ack.request_id!==args.p_request_id || ack.previous_session_id!==args.p_session_id || !ack.session_id || ack.session_id===args.p_session_id || ack.auth_session_id!==auth)throw new Error('Clear acknowledgement mismatch — retry the same request');
        // A later Clear may have superseded this stable ACK. Always hydrate the latest OPEN session.
        expirySessionOpenPromise=null;
        await ensureExpiryActiveSession({fresh:true});
        if(scope!==expiryDraftScope() || auth!==expirySignedAuthIdentity())throw new Error('Clear account changed');
        if(localStorage.getItem(key)!==stored)throw new Error('Clear intent changed during reconciliation');
        localStorage.removeItem(key);
        window.resetExpiryDesktopSession?.();
        if(!engine.currentItem && !engine.operation && !engine.pendingDraft)resetExpiryCaptureForm({focus:false});
        engine.sessionClearing=false;engine.busy=false;
        setExpiryStatus('success','Session cleared — history preserved');
        renderExpiryEvidence();focusExpiryScanner();
        return true;
    })();
    const entry={key,promise};expiryClearInFlight=entry;
    try{return await promise;}finally{if(expiryClearInFlight===entry)expiryClearInFlight=null;}
}
async function startExpiryClearSession(sessionId){
    const ownScope=expiryDraftScope(),ownAuth=expirySignedAuthIdentity();
    if(!expiryHasClearIntent()){
        await expiryAssertClearSafe();
        const engine=ExpiryCaptureEngine;engine.busy=true;engine.sessionClearing=true;engine.sessionClearingKey=expiryClearIntentKey();
        const current=await ensureExpiryActiveSession({fresh:true});
        if(ownScope!==expiryDraftScope() || ownAuth!==expirySignedAuthIdentity())throw new Error('Clear account changed');
        if(current!==sessionId)throw new Error('Session changed — reload before clearing');
        localStorage.setItem(expiryClearIntentKey(),JSON.stringify({p_pharmacy_id:expiryPharmacyId(),p_session_id:sessionId,p_request_id:crypto.randomUUID(),p_device_id:expiryDeviceId()}));
    }
    return reconcileExpiryClearSession();
}

function releaseExpiryClearConfirmation(){
    if(ExpiryCaptureEngine.sessionClearing && !expiryHasClearIntent()){
        ExpiryCaptureEngine.sessionClearing=false;ExpiryCaptureEngine.busy=false;
        renderExpiryEvidence();focusExpiryScanner();
    }
}
