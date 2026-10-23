"use strict";
/* Presentation only. The existing #btnLogout handler owns authentication. */
(function(){
    if(document.body.classList.contains("zebraDevice")){return;}
    const trigger=document.getElementById("btnHeaderLogoutToggle");
    const menu=document.getElementById("headerLogoutMenu");
    const action=document.getElementById("btnLogout");
    if(!trigger || !menu || !action){ return; }
    function close(restoreFocus=false){
        menu.hidden=true;
        trigger.setAttribute("aria-expanded","false");
        if(restoreFocus){ trigger.focus(); }
    }
    function open(){
        menu.hidden=false;
        trigger.setAttribute("aria-expanded","true");
        action.focus();
    }
    trigger.addEventListener("click",()=>menu.hidden ? open() : close(true));
    trigger.addEventListener("keydown",event=>{
        if(event.key==="ArrowDown" || event.key==="ArrowUp"){
            event.preventDefault();
            open();
        }
    });
    menu.addEventListener("keydown",event=>{
        if(event.key==="ArrowDown" || event.key==="ArrowUp" || event.key==="Home" || event.key==="End"){
            event.preventDefault();
            action.focus();
        }
    });
    document.addEventListener("click",event=>{
        if(!menu.hidden && !trigger.contains(event.target) && !menu.contains(event.target)){ close(); }
    });
    document.addEventListener("focusin",event=>{
        if(!menu.hidden && !trigger.contains(event.target) && !menu.contains(event.target)){ close(); }
    });
    document.addEventListener("keydown",event=>{
        if(event.key==="Escape" && !menu.hidden){ event.preventDefault();close(true); }
    });
    action.addEventListener("click",()=>close());
})();
