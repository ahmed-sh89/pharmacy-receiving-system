"use strict";

/* Desktop Header controls. Existing account and operational actions remain owned
   by AuthState, the application status elements, and the Cloud Workspace runtime. */
(function(){
    const accountButton=document.getElementById("btnAccountModalOpen");
    const accountModal=document.getElementById("accountModal");
    const statusButton=document.getElementById("btnHeaderStatus");
    const statusPopover=document.getElementById("headerStatusPopover");
    if(!accountButton || !accountModal || !statusButton || !statusPopover){ return; }

    const accountDialog=accountModal.querySelector(".accountModalDialog");
    let returnFocus=null;

    function setAccountOpen(open){
        accountModal.hidden=!open;
        accountButton.setAttribute("aria-expanded",String(open));
        if(open){
            returnFocus=document.activeElement;
            accountDialog?.focus();
        }else{
            const passwordPanel=document.getElementById("settingsPasswordOverlay");
            if(passwordPanel && !passwordPanel.hidden){
                passwordPanel.classList.remove("open");
                passwordPanel.hidden=true;
                passwordPanel.setAttribute("aria-hidden","true");
            }
            if(document.getElementById("settingsIdentityEdit")?.classList.contains("hidden")===false){
                document.getElementById("btnCancelSettingsIdentity")?.click();
            }
            if(returnFocus && typeof returnFocus.focus==="function"){ returnFocus.focus(); }
        }
    }

    accountButton.addEventListener("click",()=>setAccountOpen(accountModal.hidden));
    accountModal.querySelectorAll("[data-account-close]").forEach(button=>button.addEventListener("click",()=>setAccountOpen(false)));

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
        const cloudOffline=/\bOFFLINE\b/i.test(syncText) || document.documentElement.dataset.cloudWorkspaceState==="offline";
        const offline=!navigator.onLine || cloudOffline;
        const label=offline ? "OFFLINE" : (masterActive && appReady && workspaceSynced ? "ONLINE" : "ATTENTION");
        const labelNode=document.getElementById("headerUnifiedStatusLabel");
        if(labelNode){ labelNode.textContent=label; }
        statusButton.classList.remove("is-online","is-offline","is-attention");
        statusButton.classList.add("is-"+label.toLowerCase());
        statusButton.setAttribute("aria-label","System status: "+label);
        const sidebarStatus=document.getElementById("sidebarConnection");
        if(sidebarStatus && !document.body.classList.contains("zebraDevice")){
            sidebarStatus.dataset.headerStatusManaged="true";
            sidebarStatus.textContent=label;
            sidebarStatus.classList.toggle("isOffline",label==="OFFLINE");
            sidebarStatus.classList.toggle("isAttention",label==="ATTENTION");
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
        if(accountModal.hidden===false){
            const passwordPanel=document.getElementById("settingsPasswordOverlay");
            if(passwordPanel && !passwordPanel.hidden){
                document.querySelector("[data-settings-password-close]")?.click();
            }else{
                setAccountOpen(false);
            }
        }
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
    window.addEventListener("online",readStatus);
    window.addEventListener("offline",readStatus);
    readStatus();
})();
