"use strict";

/* Check for a newer Pages build only after startup and when this tab returns
   to the foreground. This is a tiny same-origin read, not a Supabase poll. */
(function installPharmFlowVersionCheck(){
    if(window.PharmFlowVersionCheck) return;

    const MIN_CHECK_GAP_MS=30000;
    let initialized=false;
    let checking=false;
    let lastCheckAt=0;
    let localBuild="";
    let notice=null;
    function showNotice(){
        if(!notice){
            notice=document.createElement("aside");
            notice.id="pharmflowVersionNotice";
            notice.className="pharmflowVersionNotice";
            notice.setAttribute("aria-label","PharmFlow update");
            notice.innerHTML=`
                <img class="pharmflowVersionMark" src="assets/pharmflow-mark-blue.svg" alt="" width="30" height="30">
                <strong class="pharmflowVersionCopy" role="status">Farm flow has been updated.</strong>
                <button type="button" data-refresh>Refresh</button>
                <small data-message aria-live="polite"></small>`;
            document.body.appendChild(notice);
            notice.querySelector("[data-refresh]").addEventListener("click",refreshWhenSafe);
        }
        notice.hidden=false;
    }

    function isAuthTransition(){
        const auth=typeof AuthState==="undefined"?null:AuthState;
        return !!(
            document.body.classList.contains("authLocked") ||
            document.body.classList.contains("authBooting") ||
            document.body.classList.contains("workspaceBooting") ||
            auth?.busy || auth?.contextLoading ||
            auth?.recoveryActive || window.__MEDRYVO_RECOVERY_ACTIVE
        );
    }

    function hasOpenEditor(){
        return [...document.querySelectorAll('[role="dialog"],dialog[open],.modalOverlay,.quickKpiOverlay')]
            .some(el=>!el.closest('[hidden], [aria-hidden="true"]') &&
                el.getClientRects().length>0 && getComputedStyle(el).visibility!=="hidden");
    }

    async function hasPendingWork(){
        const cloud=window.PharmFlowCloudWorkspace;
        if(cloud?.receivingFlushPromise) return true;
        if(typeof window.readCloudQueue==="function" && window.readCloudQueue().length) return true;

        const scanQueue=window.PharmFlowReceivingScanQueue;
        if(scanQueue?.pending){
            try{
                if((await scanQueue.pending()).length) return true;
            }catch(_){ return true; }
        }
        // Integration boundary: disabled Expiry fields may still own a durable write.
        if(typeof ExpiryCaptureEngine!=="undefined" && (ExpiryCaptureEngine.busy || ExpiryCaptureEngine.resolving || ExpiryCaptureEngine.saveUncertain || ExpiryCaptureEngine.operation || ExpiryCaptureEngine.currentItem || ExpiryCaptureEngine.pendingDraft))return true;
        if(typeof expiryHasClearIntent==="function" && expiryHasClearIntent())return true;
        // Stored drafts survive reload; only live capture state blocks it.
        return false;
    }

    function hasClearRefreshSurface(){
        if(document.visibilityState==="hidden" || window.PharmFlowIdleSleep?.active || isAuthTransition()) return false;
        if(hasOpenEditor()) return false;
        const scan=document.getElementById("barcodeInput");
        if(scan && String(scan.value||"").trim()) return false;
        return true;
    }

    async function isSafeToRefresh(){
        return hasClearRefreshSurface() && !(await hasPendingWork()) && hasClearRefreshSurface();
    }

    async function refreshWhenSafe(){
        const button=notice?.querySelector("[data-refresh]");
        const message=notice?.querySelector("[data-message]");
        if(button) button.disabled=true;
        if(message) message.textContent="";
        try{
            if(!(await isSafeToRefresh())){
                if(message) message.textContent="Wait for the current action to finish, then refresh.";
                return false;
            }
            window.location.reload();
            return true;
        }finally{
            if(button) button.disabled=false;
        }
    }

    async function check(){
        if(!initialized || checking || document.visibilityState==="hidden" || window.PharmFlowIdleSleep?.active || isAuthTransition()) return false;
        if(Date.now()-lastCheckAt<MIN_CHECK_GAP_MS) return false;
        checking=true;
        lastCheckAt=Date.now();
        try{
            const url=new URL("version.json",document.baseURI);
            url.searchParams.set("check",String(lastCheckAt));
            const response=await fetch(url.href,{cache:"no-store",credentials:"omit",headers:{"Accept":"application/json"}});
            if(!response.ok) return false;
            const deployed=await response.json();
            if(deployed?.sha && localBuild){
                if(String(deployed.sha)!==localBuild) showNotice();
                else if(notice) notice.hidden=true;
            }
            return true;
        }catch(_){ return false; }
        finally{ checking=false; }
    }

    function initialize(){
        if(initialized) return;
        localBuild=String(document.querySelector('meta[name="pharmflow-build-sha"]')?.content||"");
        if(!localBuild || localBuild.includes("__PHARMFLOW_BUILD_SHA__")) return;
        initialized=true;
        const idleRefresh=document.getElementById("pf-idle-refresh");
        if(idleRefresh) idleRefresh.addEventListener("click",()=>void check());
        void check();
    }

    window.addEventListener("focus",()=>void check());
    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState==="visible") void check();
    });
    window.PharmFlowVersionCheck={initialize,check,isSafeToRefresh,refreshWhenSafe};
    window.initializePharmFlowVersionCheck=initialize;
})();
