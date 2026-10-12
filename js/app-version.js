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
    const fieldBaselines=new WeakMap();

    function currentFieldValue(field){
        if(field.isContentEditable) return field.innerHTML;
        if(field.type==="checkbox" || field.type==="radio") return field.checked;
        if(field.tagName==="SELECT" && field.multiple){
            return [...field.options].map(option=>option.selected);
        }
        return field.value;
    }

    function rememberFormState(root=document){
        root.querySelectorAll?.("input,textarea,select,[contenteditable='true']")
            .forEach(field=>fieldBaselines.set(field,currentFieldValue(field)));
    }

    function hasChangedFormState(){
        return [...document.querySelectorAll("input,textarea,select,[contenteditable='true']")]
            .some(field=>{
                if(field.disabled || field.closest("#authGate")) return false;
                const baseline=fieldBaselines.get(field);
                return baseline!==undefined && JSON.stringify(currentFieldValue(field))!==JSON.stringify(baseline);
            });
    }

    function showNotice(){
        if(!notice){
            notice=document.createElement("aside");
            notice.id="pharmflowVersionNotice";
            notice.className="pharmflowVersionNotice";
            notice.setAttribute("role","status");
            notice.setAttribute("aria-live","polite");
            notice.innerHTML='<span>New PharmFlow version available — Refresh to update</span><button type="button" data-refresh>Refresh to update</button><small data-message></small>';
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
        return [...document.querySelectorAll('[role="dialog"],.modalOverlay,.quickKpiOverlay')]
            .some(el=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=="hidden");
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
        return false;
    }

    async function isSafeToRefresh(){
        if(document.visibilityState==="hidden" || window.PharmFlowIdleSleep?.active || isAuthTransition()) return false;
        if(hasOpenEditor() || hasChangedFormState()) return false;
        const scan=document.getElementById("barcodeInput");
        if(scan && String(scan.value||"").trim()) return false;
        return !(await hasPendingWork());
    }

    async function refreshWhenSafe(){
        const button=notice?.querySelector("[data-refresh]");
        const message=notice?.querySelector("[data-message]");
        if(button) button.disabled=true;
        try{
            if(!(await isSafeToRefresh())){
                if(message) message.textContent="Save or finish current work before refreshing.";
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
            if(deployed?.sha && localBuild && String(deployed.sha)!==localBuild) showNotice();
            return true;
        }catch(_){ return false; }
        finally{ checking=false; }
    }

    function initialize(){
        if(initialized) return;
        localBuild=String(document.querySelector('meta[name="pharmflow-build-sha"]')?.content||"");
        if(!localBuild || localBuild.includes("__PHARMFLOW_BUILD_SHA__")) return;
        initialized=true;
        rememberFormState();
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
