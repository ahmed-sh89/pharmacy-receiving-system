"use strict";

/* Desktop Header controls. Existing account and operational actions remain owned
   by AuthState, the application status elements, and the Cloud Workspace runtime. */
(function(){
    if(document.body.classList.contains("zebraDevice")){return;}
    const statusButton=document.getElementById("btnHeaderStatus");
    const statusPopover=document.getElementById("headerStatusPopover");
    if(!statusButton || !statusPopover){ return; }

    function readStatus(){
        const master=document.getElementById("headerMasterGTINStatus");
        const ready=document.getElementById("systemStatus");
        const sync=document.getElementById("cloudWorkspaceStatus");
        const masterText=(master?.textContent||"").trim().replace(/\s+/g," ");
        const readyText=(ready?.textContent||"").trim().replace(/\s+/g," ");
        const syncText=(sync?.textContent||"").trim().replace(/^●\s*/,"").replace(/\s+/g," ");
        const masterActive=/\bACTIVE\b/i.test(masterText) && !/CACHED/i.test(masterText);
        const appReady=/^READY$/i.test(readyText) && ready?.classList.contains("ready");
        const workspaceSynced=/\bSYNCED\b/i.test(syncText) && !/PENDING|SYNCING/i.test(syncText);
        // Presentation only: success colors reuse the existing readiness results.
        [[master,masterActive],[ready,appReady],[sync,workspaceSynced]].forEach(([node,successful])=>{
            if(!node){ return; }
            const tone=successful ? "success" : (/error|failed|failure/i.test(node.textContent) || node.classList.contains("error") ? "error" : "warning");
            if(node.dataset.uiTone!==tone){ node.dataset.uiTone=tone; }
        });
        const cloudOffline=/\bOFFLINE\b/i.test(syncText) || document.documentElement.dataset.cloudWorkspaceState==="offline";
        const permissionState=window.PharmFlowPermissions?.state();
        const reconnecting=permissionState==='loading'||permissionState==='unavailable';
        const offline=!navigator.onLine || (!reconnecting && cloudOffline);
        const label=offline ? "OFFLINE" : reconnecting ? "RECONNECTING" : (masterActive && appReady && workspaceSynced ? "ONLINE" : "ATTENTION");
        const labelNode=document.getElementById("headerUnifiedStatusLabel");
        if(labelNode){ labelNode.textContent=label; }
        statusButton.classList.remove("is-online","is-offline","is-attention");
        statusButton.classList.add("is-"+(reconnecting&&!offline?'attention':label.toLowerCase()));
        statusButton.setAttribute("aria-label","System status: "+label);
        const sidebarStatus=document.getElementById("sidebarConnection");
        if(sidebarStatus && !document.body.classList.contains("zebraDevice")){
            sidebarStatus.dataset.headerStatusManaged="true";
            sidebarStatus.textContent=label;
            sidebarStatus.classList.toggle("isOffline",label==="OFFLINE");
            sidebarStatus.classList.toggle("isAttention",label==="ATTENTION"||label==="RECONNECTING");
        }
    }

    statusButton.addEventListener("click",()=>{
        statusPopover.hidden=!statusPopover.hidden;
        statusButton.setAttribute("aria-expanded",String(!statusPopover.hidden));
    });
    document.addEventListener("click",event=>{
        if(!statusPopover.hidden && !statusButton.contains(event.target) && !statusPopover.contains(event.target)){
            statusPopover.hidden=true;
            statusButton.setAttribute("aria-expanded","false");
        }
    });
    document.addEventListener("keydown",event=>{
        if(event.key!=="Escape"){ return; }
        const passwordPanel=document.getElementById("settingsPasswordOverlay");
        if(passwordPanel && !passwordPanel.hidden){ document.querySelector("[data-settings-password-close]")?.click(); }
        else if(document.getElementById("accountEditOverlay")?.hidden===false){ document.getElementById("btnCancelSettingsIdentity")?.click(); }
        if(!statusPopover.hidden){
            statusPopover.hidden=true;
            statusButton.setAttribute("aria-expanded","false");
            statusButton.focus();
        }
    });

    ["headerMasterGTINStatus","systemStatus","cloudWorkspaceStatus"].forEach(id=>{
        const element=document.getElementById(id);
        if(element){ new MutationObserver(readStatus).observe(element,{childList:true,subtree:true,characterData:true,attributes:true}); }
    });
    window.addEventListener("pharmflow:permission-state",readStatus);
    window.addEventListener("online",readStatus);
    window.addEventListener("offline",readStatus);
    readStatus();

    const editPanel=document.getElementById("settingsIdentityEdit");
    const editOverlay=document.getElementById("accountEditOverlay");
    const passwordOverlay=document.getElementById("settingsPasswordOverlay");
    let editFeedbackActive=false;
    function syncEditDialog(){
        if(!editPanel || !editOverlay){ return; }
        const open=!editPanel.classList.contains("hidden");
        const wasOpen=!editOverlay.hidden;
        editOverlay.hidden=!open;
        // AuthState owns the panel class; click listeners may run before it opens.
        // Retain the route after a save closes the dialog until its result arrives.
        if(open){ editFeedbackActive=true; }
        if(open && !wasOpen){ document.getElementById("settingsIdentityNameInput")?.focus(); }
        if(!open && wasOpen){ document.getElementById("btnAccountModalOpen")?.focus(); }
    }
    document.querySelectorAll("[data-account-edit-close]").forEach(button=>button.addEventListener("click",()=>document.getElementById("btnCancelSettingsIdentity")?.click()));
    if(editPanel){ new MutationObserver(syncEditDialog).observe(editPanel,{attributes:true,attributeFilter:["class"]}); }
    syncEditDialog();
    // Mirror the existing canonical feedback into the relocated account experience.
    const feedback=document.getElementById("settingsAccessMessage");
    document.getElementById("btnCancelSettingsIdentity")?.addEventListener("click",()=>{editFeedbackActive=false;});
    let passwordWasOpen=false;
    if(passwordOverlay){new MutationObserver(()=>{
        const open=!passwordOverlay.hidden;
        if(passwordWasOpen && !open){document.getElementById("btnAccountModalOpen")?.focus();}
        passwordWasOpen=open;
    }).observe(passwordOverlay,{attributes:true,attributeFilter:["hidden"]});}
    if(feedback){ new MutationObserver(()=>{
        if(!editFeedbackActive){ return; }
        ["accountIdentityEditMessage","accountFeedbackMessage"].forEach(id=>{
            const target=document.getElementById(id);
            if(target){target.textContent=feedback.textContent;target.className=feedback.className;}
        });
        if(editOverlay?.hidden && feedback.textContent.trim()){ document.dispatchEvent(new CustomEvent("pharmflow:account-feedback"));editFeedbackActive=false; }
    }).observe(feedback,{childList:true,characterData:true,subtree:true,attributes:true}); }
    // Modal keyboard containment only; validation and action handlers stay in AuthState.
    document.addEventListener("keydown",event=>{
        if(event.key!=="Tab"){ return; }
        const overlay=passwordOverlay && !passwordOverlay.hidden ? passwordOverlay : (editOverlay && !editOverlay.hidden ? editOverlay : null);
        if(!overlay){ return; }
        const nodes=[...overlay.querySelectorAll("button,input,[tabindex]")].filter(el=>!el.disabled && el.tabIndex>=0);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    });
})();
