"use strict";
/* Presentation only. Existing card visibility remains the permission authority. */
(function(){
 function initialize(){
    const root=document.getElementById("page-settings");
    if(!root){return;}
    const tabs=[...root.querySelectorAll('[role="tab"]')];
    const panels=tabs.map(tab=>document.getElementById(tab.getAttribute('aria-controls')));
    function select(tab,focus=false,restored=false){
        if(!restored && tab.id!=="settingsAccessTab" && window.SettingsAccessActions?.target()){
            window.SettingsAccessActions.back().then(ok=>{if(ok)select(tab,focus,true);});return;
        }
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
    const dialog=document.createElement('dialog');dialog.className='settingsTextDialog settingsDialog';dialog.setAttribute('aria-label',title);
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
    if(readOnly && input){
      const copy=document.createElement('button');copy.type='button';copy.className='secondaryButton';copy.textContent=title.includes('Password')?'Copy Password':'Copy';
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Copied';}catch(_){input.focus();input.select();copy.textContent='Select and copy';}};actions.append(copy);
    }
    if(!readOnly){actions.append(cancel);}actions.append(save);form.append(actions);dialog.append(form);document.body.append(dialog);
    let result=null;
    form.addEventListener('submit',()=>{result=input?input.value:true;});
    cancel.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();resolve(result);},{once:true});
    dialog.showModal();
    if(input){input.focus();input.select();}else{cancel.focus();}
 });
}
window.settingsConfirm=options=>settingsDialog({...options,title:'Confirm Action',confirmText:'Confirm'}).then(result=>result===true);

// Row prompts reuse the existing validated Edit/Admin sequence and RPC handlers.
function settingsInlinePrompt({title,label,value,anchor}){
 settingsInlinePrompt.cancel?.();
 return new Promise(resolve=>{
    const row=anchor.closest('.ownerPharmacyRow'),host=row?.querySelector('.ownerPharmacyEditor');
    if(!host || row.querySelector('.ownerPharmacyDetails').hidden){resolve(null);return;}
    const edit=document.createElement('div');edit.className='ownerInlineEdit';
    const form=document.createElement('form');form.setAttribute('aria-label',title);
    const heading=document.createElement('h4');heading.textContent=title;
    const field=document.createElement('label');field.textContent=label;
    const input=document.createElement('input');input.value=value||'';input.type='text';input.autocomplete='off';field.append(input);
    const actions=document.createElement('footer');
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondaryButton';cancel.textContent='Cancel';
    const save=document.createElement('button');save.type='submit';save.className='primaryButton';save.textContent='Continue';
    actions.append(cancel,save);form.append(heading,field,actions);edit.append(form);host.replaceChildren(edit);
    let finished=false;
    const abort=()=>finish(null);
    const finish=value=>{
        if(finished)return;finished=true;observer.disconnect();row.removeEventListener('owner:collapse',abort);
        if(settingsInlinePrompt.cancel===abort){settingsInlinePrompt.cancel=null;}
        edit.remove();if(anchor.isConnected && !row.querySelector('.ownerPharmacyDetails').hidden)anchor.focus();resolve(value);
    };
    const observer=new MutationObserver(()=>{if(!edit.isConnected){finish(null);}});
    observer.observe(document.getElementById('ownerPharmacyList'),{childList:true,subtree:true});
    settingsInlinePrompt.cancel=abort;row.addEventListener('owner:collapse',abort);
    form.addEventListener('submit',event=>{event.preventDefault();finish(input.value);});
    form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish(null);}});
    cancel.addEventListener('click',abort);input.focus();input.select();
 });
}
window.settingsTextPrompt=options=>options.anchor?.closest('#ownerPharmacyList .ownerPharmacyRow')?settingsInlinePrompt(options):settingsDialog(options);

// Access action navigation owns presentation only; existing handlers own all mutations.
(function(){
 let current=null;
 const list=()=>document.getElementById('ownerPharmacyList');
 const busy=()=>typeof AuthState!=='undefined' && AuthState.busy===true;
 function refresh(){
    if(!current)return;
    const box=list();
    box.classList.add('ownerActionFocused');
    box.querySelectorAll('.ownerPharmacyRow').forEach(row=>{
        const selected=row.dataset.pharmacyRow===current.id;row.hidden=!selected;
        if(!selected)return;
        row.classList.add('expanded');
        const summary=row.querySelector('.ownerPharmacySummary');summary.setAttribute('aria-expanded','true');summary.disabled=true;
        row.querySelector('.ownerPharmacyDetails').hidden=false;
        row.querySelectorAll('[data-owner-action]').forEach(button=>{
            button.hidden=button.dataset.ownerAction!==current.action;
            button.disabled=current.running;
        });
    });
 }
 async function back(){
    if(!current)return true;
    if(busy())return false;
    const saved=current;
    if((list()?.querySelector('.ownerPermissionsForm') ? list().querySelector('.ownerPermissionsForm').dataset.dirty==='true' : saved.dirty) && !(await window.settingsConfirm({message:'Discard unsaved changes and return to pharmacies?'})))return false;
    // Check again after the asynchronous confirmation, before removing a form.
    if(current!==saved || busy())return false;
    settingsInlinePrompt.cancel?.();window.editPharmacyPermissions?.cancel?.();current=null;
    document.getElementById('ownerFocusedActionHeader')?.remove();
    saved.controls.forEach(([control,disabled])=>{control.disabled=disabled;});
    list().classList.remove('ownerActionFocused');
    renderOwnerManagementPanel();
    const row=[...list().querySelectorAll('.ownerPharmacyRow')].find(r=>r.dataset.pharmacyRow===saved.id);
    if(row){row.querySelector('.ownerPharmacySummary').click();row.querySelector(`[data-owner-action="${saved.action}"]`)?.focus();}
    list().scrollTop=saved.scroll;
    return true;
 }
 async function run(button,handler){
    if(current?.running || busy())return;
    const row=button.closest('.ownerPharmacyRow');if(!row)return;
    if(!current){
        const controls=[...document.querySelectorAll('#ownerManagementSearch,#ownerManagementSort,[data-owner-view],#btnOpenCreateAccount')].map(control=>[control,control.disabled]);
        current={id:row.dataset.pharmacyRow,action:button.dataset.ownerAction,scroll:list().scrollTop,controls,dirty:false,running:false};
        controls.forEach(([control])=>{control.disabled=true;});
        const header=document.createElement('header');header.id='ownerFocusedActionHeader';header.className='ownerFocusedActionHeader';
        const backButton=document.createElement('button');backButton.type='button';backButton.className='secondaryButton';backButton.textContent='← Back to pharmacies';backButton.addEventListener('click',back);
        const title=document.createElement('h3');title.textContent=({permissions:'Permissions',identity:'Edit Pharmacy',admin:'Pharmacy Admin','reset-password':'Reset Password',suspend:'Suspend Pharmacy',activate:'Activate Pharmacy'})[current.action] || 'Pharmacy action';
        header.append(backButton,title);list().before(header);list().scrollTop=0;
    }
    const active=current;active.running=true;refresh();
    try{await handler();}finally{if(current===active){active.running=false;active.dirty=false;refresh();}}
 }
 document.addEventListener('input',event=>{if(current && event.target.closest('.ownerPharmacyEditor'))current.dirty=true;});
 document.addEventListener('change',event=>{if(current && event.target.closest('.ownerPharmacyEditor'))current.dirty=true;});
 document.addEventListener('click',event=>{
    const navigation=event.target.closest?.('.sidebar [data-page]');
    if(current && navigation){event.preventDefault();event.stopImmediatePropagation();back().then(ok=>{if(ok)navigation.click();});}
 },true);
 window.addEventListener?.('beforeunload',event=>{if(current?.dirty){event.preventDefault();event.returnValue='';}});
 window.SettingsAccessActions={target:()=>current?.id || null,retainDraft:()=>!!(current?.running && list()?.querySelector('.ownerInlineEdit,.ownerPermissionsForm')),refresh,run,back};
})();

// Permission editing is part of the existing focused pharmacy action.
window.editPharmacyPermissions=async function(button){
 const id=button.dataset.pharmacyId,host=button.closest('.ownerPharmacyRow')?.querySelector('.ownerPharmacyEditor');
 if(!host || !isSystemOwner())return;
 let row;
 try{row=await authRpc('get_my_pharmflow_permissions_v1',{p_pharmacy_id:id});}
 catch(error){setOwnerManagementMessage(error.message,'error');return;}
 return new Promise(resolve=>{
  const form=document.createElement('form');form.className='ownerPermissionsForm';form.setAttribute('aria-label','Pharmacy permissions');
  const moduleOptions=[['DISABLED','Disabled'],['FULL','Enabled']];
  const options=[['receiving','Receiving',moduleOptions],['expiry','Expiry',moduleOptions],['data_access','Item & Barcode',[['READ_ONLY','Read Only'],['PHARMACY_ONLY','Pharmacy Only'],['PHARMACY_GLOBAL','Pharmacy + Global']]]];
  for(const [name,label,choices]of options){
   const field=document.createElement('label');field.textContent=label;
   const select=document.createElement('select');select.name=name;
   for(const [value,text]of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
   if(name!=='data_access' && row[name]==='READ_ONLY'){
    const legacy=document.createElement('option');legacy.value='READ_ONLY';legacy.textContent='Legacy Read Only — choose Enabled or Disabled';legacy.disabled=true;select.prepend(legacy);
   }
   select.value=row[name];field.append(select);form.append(field);
  }
  const status=document.createElement('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const footer=document.createElement('footer');
  const save=document.createElement('button');save.type='submit';save.className='primaryButton';save.textContent='Save';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondaryButton';cancel.textContent='Cancel';footer.append(save,cancel);form.append(footer,status);host.replaceChildren(form);
  const finish=()=>{form.remove();if(window.editPharmacyPermissions.cancel===finish)delete window.editPharmacyPermissions.cancel;resolve();};
  window.editPharmacyPermissions.cancel=finish;
  form.addEventListener('change',()=>{form.dataset.dirty='true';status.textContent='Unsaved changes';});
  cancel.onclick=async()=>{if(form.dataset.dirty==='true' && !(await window.settingsConfirm({message:'Discard unsaved permission changes?'})))return;finish();};
  form.onsubmit=async event=>{
   event.preventDefault();if(AuthState.busy)return;
   const fields=Object.fromEntries(options.map(([name])=>[name,form.querySelector(`[name="${name}"]`).value]));
   setAuthBusy(true);save.disabled=cancel.disabled=true;form.querySelectorAll('select').forEach(el=>el.disabled=true);status.textContent='Saving…';
   try{
    row=await authRpc('owner_set_pharmflow_permissions_v1',{p_pharmacy_id:id,p_receiving:fields.receiving,p_expiry:fields.expiry,p_data_access:fields.data_access,p_expected_revision:row.revision});
    form.dataset.dirty='false';status.textContent='Permissions saved.';
    if(AuthState.context?.pharmacy_id===id)await window.PharmFlowPermissions.load();
   }catch(error){status.textContent=error.message || 'Unable to save permissions.';}
   finally{setAuthBusy(false);save.disabled=cancel.disabled=false;form.querySelectorAll('select').forEach(el=>el.disabled=false);}
  };
  form.querySelector('select').focus();
 });
};

(function bindDirectAccountCreation(){
 function bind(){
  const form=document.getElementById('ownerCreateAccountForm');if(!form)return;
  const panel=document.getElementById('ownerCreateAccountPanel'), workspace=document.getElementById('ownerManagementPanel');
  const key='PHARMFLOW_ACCOUNT_PROVISION_DRAFT_V2';let pending=null,busy=false,dirty=false,scroll=0;
  try{pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch(_){}
  const names=['pharmacy_name','pharmacy_code','admin_email','receiving','expiry','data_access'];
  const fields=()=>names.map(name=>form.querySelector(`[name="${name}"]`));
  const controls=[...document.querySelectorAll('#ownerManagementSearch,#ownerManagementSort,[data-owner-view],#btnOpenCreateAccount')];
  let previousControls=[];
  function open(){
   if(!isSystemOwner() || window.SettingsAccessActions?.target())return;
   scroll=document.getElementById('ownerPharmacyList').scrollTop;workspace.hidden=true;panel.hidden=false;
   previousControls=controls.map(el=>[el,el.disabled]);controls.forEach(el=>el.disabled=true);fields()[0].focus();
  }
  const status=form.querySelector('[data-create-status]');
  if(pending){fields().forEach((el,index)=>{el.value=pending[names[index]]||'';});dirty=true;}
  document.getElementById('btnOpenCreateAccount').onclick=open;
  form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});
  form.onsubmit=async event=>{
   event.preventDefault();if(busy || !isSystemOwner() || !form.reportValidity())return;
   const values=Object.fromEntries(fields().map(el=>[el.name,el.value.trim()]));
   if(!['FULL','DISABLED'].includes(values.receiving)||!['FULL','DISABLED'].includes(values.expiry)||!['READ_ONLY','PHARMACY_ONLY','PHARMACY_GLOBAL'].includes(values.data_access)){status.textContent='Select all initial permissions.';return;}
   if(pending && names.some(name=>pending[name]!==values[name])){status.textContent='Retry the original values or cancel this draft before starting a different request.';return;}
   pending=pending||{...values,operation_id:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(pending));
   busy=true;setAuthBusy(true);form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);status.textContent='Creating pharmacy and saving initial permissions…';
   try{
    const result=await callPasswordAdmin({action:'create-account',...pending});
    if(result.temporary_password){
     await window.settingsTextPrompt({title:'Initial Temporary Password',label:'Copy and send securely. Replacement is mandatory at first login.',value:result.temporary_password,readOnly:true,confirmText:'Close'});
     delete result.temporary_password;
    }
    status.textContent=result.credential_status==='EXISTING_LOGIN'?'Pharmacy and permissions saved. Existing ADMIN password is unchanged.':result.credential_status==='USE_EXPLICIT_RESET'?'Pharmacy and permissions ready. Use the pharmacy Reset action to issue a new temporary password.':'Pharmacy, ADMIN and initial permissions saved. Password replacement is required.';
    pending=null;dirty=false;sessionStorage.removeItem(key);form.reset();await loadOwnerPharmacies();
   }catch(error){if(error.operationNotStarted){pending=null;sessionStorage.removeItem(key);}status.textContent=(error.message||'Unable to complete creation.')+' Retry preserves this operation and never resets an existing password.';}
   finally{busy=false;setAuthBusy(false);form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);}
  };
  async function close(){
   if(busy)return false;
   if((dirty||pending) && !(await window.settingsConfirm({message:'Discard this draft? Any incomplete pharmacy retains no operational access. Created records are retained.'})))return false;
   pending=null;dirty=false;sessionStorage.removeItem(key);form.reset();status.textContent='';panel.hidden=true;workspace.hidden=false;
   previousControls.forEach(([el,disabled])=>el.disabled=disabled);renderOwnerManagementPanel();document.getElementById('ownerPharmacyList').scrollTop=scroll;document.getElementById('btnOpenCreateAccount').focus();return true;
  }
  form.querySelector('[data-create-cancel]').onclick=close;
  document.getElementById('btnCreateAccountBack').onclick=close;
  document.addEventListener('click',event=>{
   const navigation=event.target.closest?.('.sidebar [data-page],#page-settings [role="tab"]');
   if(!panel.hidden&&navigation){event.preventDefault();event.stopImmediatePropagation();close().then(ok=>{if(ok)navigation.click();});}
  },true);
  window.addEventListener('beforeunload',event=>{if(busy||dirty){event.preventDefault();event.returnValue='';}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

window.pharmflowInitialPermissionFields=function(prefix){
 const select=(name,label,options)=>`<label>${label}<select data-initial-permission="${name}" data-permission-request="${escapeAuthHtml(prefix)}" required><option value="">Select…</option>${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
 return select('receiving','Receiving',[['FULL','Enabled'],['DISABLED','Disabled']])+select('expiry','Expiry',[['FULL','Enabled'],['DISABLED','Disabled']])+select('data_access','Item & Barcode',[['READ_ONLY','Read Only'],['PHARMACY_ONLY','Pharmacy Only'],['PHARMACY_GLOBAL','Pharmacy + Global']]);
};
window.copyPharmacyEmail=async function(button){
 try{await navigator.clipboard.writeText(button.dataset.copyEmail);button.textContent='Copied';}
 catch(_){await window.settingsTextPrompt({title:'Admin Email',label:'Copy email',value:button.dataset.copyEmail,readOnly:true,confirmText:'Close'});}
};
