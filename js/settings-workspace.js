"use strict";
/* Presentation only. Existing card visibility remains the permission authority. */
(function(){
 function initialize(){
    const root=document.getElementById("page-settings");
    if(!root){return;}
    const tabs=[...root.querySelectorAll('[role="tab"]')];
    const panels=tabs.map(tab=>document.getElementById(tab.getAttribute('aria-controls')));
    function select(tab,focus=false){
        if(tab.hidden){return;}
        tabs.forEach((item,index)=>{
            const active=item===tab;
            item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;
            panels[index].hidden=!active;
        });
        if(focus){tab.focus();}
    }
    tabs.forEach(tab=>{
        tab.addEventListener('click',()=>select(tab));
        tab.addEventListener('keydown',event=>{
            const visible=tabs.filter(item=>!item.hidden),index=visible.indexOf(tab);
            let target;
            if(event.key==='ArrowRight'){target=visible[(index+1)%visible.length];}
            if(event.key==='ArrowLeft'){target=visible[(index-1+visible.length)%visible.length];}
            if(event.key==='Home'){target=visible[0];}
            if(event.key==='End'){target=visible[visible.length-1];}
            if(target){event.preventDefault();select(target,true);}
        });
    });
    const access=document.getElementById('ownerManagementCard');
    const operators=document.getElementById('expiryWorkersSettingsCard');
    function syncVisibility(){
        const tab=document.getElementById('settingsAccessTab');
        tab.hidden=!access || access.hidden;
        if(tab.hidden && tab.getAttribute('aria-selected')==='true'){select(tabs[0]);}
        const unavailable=document.getElementById('settingsOperatorsUnavailable');
        if(unavailable){unavailable.hidden=!!operators && !operators.hidden;}
    }
    [access,operators].filter(Boolean).forEach(card=>new MutationObserver(syncVisibility).observe(card,{attributes:true,attributeFilter:['hidden']}));
    syncVisibility();
    // Style the shared confirmation only while it belongs to this workspace.
    const confirm=document.getElementById('confirmModal');
    if(confirm){new MutationObserver(()=>{
        confirm.classList.toggle('settingsDialog',confirm.classList.contains('open') && root.classList.contains('active'));
    }).observe(confirm,{attributes:true,attributeFilter:['aria-hidden']});}
 }
 if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initialize);}else{initialize();}
})();

// Shared Settings prompt presentation; callers retain validation and backend calls.
function settingsDialog({title="Confirm",message="",label,value,readOnly=false,confirmText="Save"}){
 return new Promise(resolve=>{
    const previous=document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='settingsTextDialog settingsDialog';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('h2');heading.textContent=title;form.append(heading);
    if(message){const description=document.createElement('p');description.textContent=message;form.append(description);}
    let input;
    if(label){
        const field=document.createElement('label');field.textContent=label;
        input=document.createElement('input');input.value=value||'';input.type='text';input.autocomplete='off';input.readOnly=readOnly;field.append(input);form.append(field);
    }
    const actions=document.createElement('footer');
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondaryButton';cancel.textContent='Cancel';
    const save=document.createElement('button');save.type='submit';save.className='primaryButton';save.textContent=confirmText;
    if(!readOnly){actions.append(cancel);}actions.append(save);form.append(actions);dialog.append(form);document.body.append(dialog);
    let result=null;
    form.addEventListener('submit',()=>{result=input?input.value:true;});
    cancel.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();resolve(result);},{once:true});
    dialog.showModal();
    if(input){input.focus();input.select();}else{cancel.focus();}
 });
}
window.settingsTextPrompt=options=>settingsDialog(options);
window.settingsConfirm=options=>settingsDialog({...options,title:'Confirm Action',confirmText:'Confirm'}).then(result=>result===true);
