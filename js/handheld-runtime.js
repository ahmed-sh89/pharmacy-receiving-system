"use strict";

/* ============================================================
   PHARMFLOW 2C.10.7.0 — HANDHELD RUNTIME

   One owner for Handheld hardware input + session readiness.
   Diagnostic evidence from the production Zebra proved DataWedge delivers
   the complete GS1 payload as one browser input insertion while keyboard
   events are Unidentified. This runtime therefore observes INPUT VALUE only.

   Existing scanner.js remains the shared parser/business entry point for PC.
   Existing expiry.js remains the Expiry business resolver. This module owns
   only the Handheld transport boundary and prevents legacy Handheld listeners
   from competing for the same event.
============================================================ */

const HandheldRuntime={
    installed:false,
    receivingBusy:false,
    expiryBusy:false,
    terminationBusy:false,
    terminationTimer:null,
    focusTimer:null,
    lastRaw:"",
    lastAt:0
};

function hhIsDevice(){
    return typeof isLikelyZebraDevice==="function" && isLikelyZebraDevice();
}

function hhMode(){
    if(!hhIsDevice()) return "NONE";
    if(document.body.classList.contains("zebraReceivingActive")) return "RECEIVING";
    if(document.body.classList.contains("zebraExpiryActive")) return "EXPIRY";
    return "IDLE";
}

function hhReceivingSessionReady(){
    /* 2C.11.0: READY means authenticated pharmacy + authoritative Active
       Order data. There is intentionally no Create/Join session dependency. */
    return !!(
        typeof AuthState!=="undefined" &&
        AuthState?.context?.pharmacy_id &&
        Array.isArray(AppState?.workspace?.orderFiles) &&
        AppState.workspace.orderFiles.length>0 &&
        Array.isArray(AppState?.workspace?.orderData) &&
        AppState.workspace.orderData.length>0
    );
}

function hhSetVisualState(state,label){
    const body=document.body;
    body.dataset.hhState=state||"idle";
    const scan=document.getElementById("scanBox");
    if(scan) scan.dataset.hhLabel=label||"";
    const expiry=document.querySelector("#page-expiry .expiryScannerCard");
    if(expiry) expiry.dataset.hhLabel=label||"";
}

function hhRefreshReadyState(){
    const mode=hhMode();
    if(mode==="RECEIVING"){
        const items=Array.isArray(AppState?.workspace?.orderData)?AppState.workspace.orderData.length:0;
        const orders=Array.isArray(AppState?.workspace?.orderFiles)?AppState.workspace.orderFiles.length:0;
        if(hhReceivingSessionReady()){
            hhSetVisualState("ready",`ONLINE · WORKSPACE SYNCED · ${orders} ORDERS · ${items} ITEMS`);
        }else{
            hhSetVisualState("blocked",`WAITING FOR ACTIVE ORDER · ${orders} ORDERS · ${items} ITEMS`);
        }
    }else if(mode==="EXPIRY"){
        hhSetVisualState("ready","READY TO SCAN");
    }else{
        hhSetVisualState("idle","");
    }
}

function hhIsImmediateDuplicate(raw){
    const now=Date.now();
    const duplicate=raw===HandheldRuntime.lastRaw && (now-HandheldRuntime.lastAt)<180;
    HandheldRuntime.lastRaw=raw;
    HandheldRuntime.lastAt=now;
    return duplicate;
}

async function hhProcessReceiving(raw,input){
    if(HandheldRuntime.receivingBusy) return false;
    if(!hhReceivingSessionReady()){
        if(input) input.value="";
        hhSetVisualState("blocked","SESSION / ORDERS NOT READY");
        showToast("No synchronized Active Order is available for this pharmacy","warning");
        return false;
    }
    if(hhIsImmediateDuplicate(raw)) return false;

    HandheldRuntime.receivingBusy=true;
    if(input) input.value="";
    hhSetVisualState("processing","PROCESSING…");
    try{
        const cleaned=typeof cleanScannerInput==="function"?cleanScannerInput(raw):String(raw||"").trim();
        const parsed=typeof parseGS1Barcode==="function"?parseGS1Barcode(cleaned):null;
        if(!parsed?.gtin){
            throw new Error("GTIN could not be extracted from the scanned barcode");
        }
        if(typeof receiveParsedBarcode!=="function") throw new Error("Receiving resolver is unavailable");
        const result=await receiveParsedBarcode(parsed);
        return result;
    }catch(error){
        Logger?.error?.("Handheld receiving pipeline failed",error);
        showToast(error?.message||"Unable to process barcode","error");
        return false;
    }finally{
        HandheldRuntime.receivingBusy=false;
        setTimeout(()=>{ hhRefreshReadyState(); hhFocusActiveScanner(); },80);
    }
}

async function hhProcessExpiry(raw,input){
    if(HandheldRuntime.expiryBusy) return false;
    if(hhIsImmediateDuplicate(raw)) return false;
    HandheldRuntime.expiryBusy=true;
    if(input) input.value="";
    hhSetVisualState("processing","PROCESSING…");
    try{
        if(typeof resolveExpiryScannedValue!=="function") throw new Error("Expiry resolver is unavailable");
        return await resolveExpiryScannedValue(raw);
    }catch(error){
        Logger?.error?.("Handheld expiry pipeline failed",error);
        showToast(error?.message||"Unable to process expiry barcode","error");
        return false;
    }finally{
        HandheldRuntime.expiryBusy=false;
        setTimeout(()=>{ hhRefreshReadyState(); hhFocusActiveScanner(); },80);
    }
}

function hhCaptureInput(event){
    if(!hhIsDevice()) return;
    const target=event.target;
    if(!target) return;
    const mode=hhMode();
    const receiving=mode==="RECEIVING" && target.id==="barcodeInput";
    const expiry=mode==="EXPIRY" && target.id==="expiryBarcodeInput";
    if(!receiving && !expiry) return;

    const raw=String(target.value||"");
    if(!raw) return;

    /* Capture phase owns Handheld scanner input. Prevent scanner.js/expiry.js
       target listeners from starting a second competing transaction. */
    event.stopImmediatePropagation();
    event.stopPropagation();

    if(receiving) hhProcessReceiving(raw,target);
    else hhProcessExpiry(raw,target);
}

function hhCaptureKey(event){
    if(!hhIsDevice()) return;
    const target=event.target;
    if(!target || !["barcodeInput","expiryBarcodeInput"].includes(target.id)) return;
    /* Diagnostic showed key=Unidentified. Ignore keyboard boundaries entirely.
       Enter/Tab are suppressed so they cannot create a second transaction. */
    if(event.key==="Enter" || event.key==="Tab"){
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
    }
}

function hhWorkerIsEditing(){
    const active=document.activeElement;
    if(!active || active===document.body) return false;

    if(active.id==="barcodeInput" || active.id==="expiryBarcodeInput") return false;

    const tag=String(active.tagName||"").toUpperCase();
    const type=String(active.getAttribute?.("type")||"").toLowerCase();
    const editable=active.isContentEditable===true;
    const operationalInput=(tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT" || editable);
    const actionCard=!!active.closest?.(
        "#handheldReceivingReviewCard,#handheldKnownExtraCard,.expiryEntryCard,.expiryCaptureCard,.modal"
    );

    return operationalInput || actionCard || type==="file";
}

function hhFocusActiveScanner(force=false){
    if(!hhIsDevice()) return;

    /* Never fight the worker for focus. This is the root cause of the numeric
       keypad opening/closing while Quantity is being entered. Scanner focus is
       restored only after Save/Next, mode entry, or when no operational field
       owns focus. */
    if(!force && hhWorkerIsEditing()) return;

    const mode=hhMode();
    const input=mode==="RECEIVING"
        ? document.getElementById("barcodeInput")
        : mode==="EXPIRY"
            ? document.getElementById("expiryBarcodeInput")
            : null;
    if(!input) return;
    input.setAttribute("inputmode","none");
    input.setAttribute("autocomplete","off");
    input.setAttribute("autocapitalize","off");
    input.setAttribute("spellcheck","false");
    try{ input.focus({preventScroll:true}); }catch(_){ try{input.focus();}catch(__){} }
}

async function hhRefreshWorkspaceAuthority(){
    if(!hhIsDevice() || !navigator.onLine) return false;
    if(typeof refreshUnifiedHandheldWorkspace!=="function") return false;
    if(HandheldRuntime.terminationBusy) return false;
    HandheldRuntime.terminationBusy=true;
    try{
        return await refreshUnifiedHandheldWorkspace({silent:true});
    }catch(error){
        Logger?.warn?.("Handheld workspace authority refresh failed",error);
        return false;
    }finally{
        HandheldRuntime.terminationBusy=false;
    }
}

function hhStartWorkspaceWatch(){
    clearInterval(HandheldRuntime.terminationTimer);
    HandheldRuntime.terminationTimer=setInterval(()=>{
        if(document.visibilityState!=="hidden") hhRefreshWorkspaceAuthority();
    },2200);
}

function hhInstall(){
    if(HandheldRuntime.installed || !hhIsDevice()) return;
    HandheldRuntime.installed=true;

    /* INPUT capture is the single hardware boundary for BOTH workflows. */
    document.addEventListener("input",hhCaptureInput,true);
    document.addEventListener("keydown",hhCaptureKey,true);
    document.addEventListener("focusin",()=>setTimeout(hhRefreshReadyState,0),true);
    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState==="visible"){
            hhRefreshReadyState();
            hhFocusActiveScanner();
            hhRefreshWorkspaceAuthority();
        }
    });

    if(typeof AppEvents!=="undefined"){
        AppEvents.on?.("session:updated",()=>{hhRefreshReadyState();setTimeout(hhFocusActiveScanner,30);});
        AppEvents.on?.("workspace:updated",hhRefreshReadyState);
        AppEvents.on?.("receiving:updated",hhRefreshReadyState);
    }

    hhStartWorkspaceWatch();
    setInterval(()=>{ hhRefreshReadyState(); },1500);
    setTimeout(()=>{hhRefreshReadyState();hhFocusActiveScanner(true);hhRefreshWorkspaceAuthority();},100);
}

window.HandheldRuntime=HandheldRuntime;
window.hhRefreshReadyState=hhRefreshReadyState;

window.addEventListener("load",()=>setTimeout(hhInstall,120));
