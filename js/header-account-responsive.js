"use strict";
/* Handheld uses Modes, not the hidden Desktop header/sidebar. Keep the same
   identity fields and AuthState handlers; only provide a reachable surface. */
(function(){
    if(!document.body.classList.contains("zebraDevice")){return;}
    const byId=id=>document.getElementById(id);
    const overlay=byId("handheldAccountOverlay"),panel=byId("handheldAccountSettings");
    for(const id of ["settingsIdentityView","settingsIdentityEdit","settingsAccessMessage"]){
        const element=byId(id);
        if(element){panel.appendChild(element);}
    }
    const password=byId("settingsPasswordOverlay");
    password.classList.remove("accountSecurityOverlay");
    const close=()=>{
        if(!overlay.hidden){
            byId("btnCancelSettingsIdentity")?.click();
            overlay.hidden=true;
            if(byId("zebraHome")){byId("zebraHome").inert=false;}
            byId("btnZebraAccount")?.focus();
        }
    };
    window.openHandheldAccount=()=>{overlay.hidden=false;if(byId("zebraHome")){byId("zebraHome").inert=true;}panel.focus();};
    overlay.querySelectorAll("[data-handheld-account-close]").forEach(button=>button.addEventListener("click",close));
    document.addEventListener("keydown",event=>{
        if(overlay.hidden || !password.hidden){return;}
        if(event.key==="Escape"){event.preventDefault();close();}
        if(event.key==="Tab"){
            const nodes=[...panel.querySelectorAll("button,input")].filter(el=>!el.disabled && !el.closest("[hidden],.hidden"));
            const first=nodes[0],last=nodes[nodes.length-1];
            if(event.shiftKey && (document.activeElement===first || document.activeElement===panel)){event.preventDefault();last?.focus();}
            if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
        }
    });
})();
