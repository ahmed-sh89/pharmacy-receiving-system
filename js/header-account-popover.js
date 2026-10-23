"use strict";
/* Shared presentation only: no account service, credentials or persistence. */
(function(){
    if(document.body.classList.contains("zebraDevice")){return;}
    const button=document.getElementById("btnAccountModalOpen");
    const panel=document.getElementById("accountPopover");
    if(!button || !panel){return;}
    function close(restoreFocus=false){
        panel.hidden=true;
        button.setAttribute("aria-expanded","false");
        if(restoreFocus){button.focus();}
    }
    function open(){
        panel.hidden=false;
        button.setAttribute("aria-expanded","true");
        panel.focus();
    }
    button.addEventListener("click",()=>panel.hidden ? open() : close(true));
    button.addEventListener("keydown",event=>{
        if(event.key==="ArrowDown"){event.preventDefault();open();}
    });
    panel.querySelectorAll("[data-account-launch]").forEach(action=>action.addEventListener("click",()=>close()));
    document.addEventListener("click",event=>{
        if(!panel.hidden && !button.contains(event.target) && !panel.contains(event.target)){close();}
    });
    document.addEventListener("focusin",event=>{
        if(!panel.hidden && !button.contains(event.target) && !panel.contains(event.target)){close();}
    });
    document.addEventListener("keydown",event=>{
        if(event.key==="Escape" && !panel.hidden){event.preventDefault();close(true);}
    });
    document.addEventListener("pharmflow:account-feedback",open);
})();
