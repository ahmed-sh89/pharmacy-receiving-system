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

// Shared native modal presentation. Business handlers and server calls are unchanged.
function createSettingsModal({title,content,size='compact',onDismiss=async()=>true,initialFocus}){
 const previous=document.activeElement,dialog=document.createElement('dialog');
 dialog.className='settingsModal settingsModal-'+size;dialog.setAttribute('aria-modal','true');
 const headingId='settingsModalTitle'+(++createSettingsModal.serial);dialog.setAttribute('aria-labelledby',headingId);
 const header=document.createElement('header');header.className='settingsModalHeader';
 const heading=document.createElement('h2');heading.id=headingId;heading.textContent=title;
 const close=document.createElement('button');close.type='button';close.className='settingsModalClose';close.textContent='×';close.setAttribute('aria-label','Close '+title);close.title='Close';
 const body=document.createElement('div');body.className='settingsModalBody';body.append(content);header.append(heading,close);dialog.append(header,body);
 (document.getElementById('page-settings')||document.body).append(dialog);
 let dismissed=false,requesting=false,restoreDismiss;
 function destroy(){
  if(dismissed)return;dismissed=true;restoreDismiss?.();dialog.close();dialog.remove();
  if(previous?.isConnected)previous.focus({preventScroll:true});
 }
 async function requestClose(){
  if(dismissed)return true;if(requesting)return false;requesting=true;
  try{if(await onDismiss()){destroy();return true;}return false;}finally{requesting=false;}
 }
 close.onclick=requestClose;
 dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)requestClose();
 });
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const items=[...dialog.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&!el.hidden&&el.tabIndex!==-1);
  if(!items.length){event.preventDefault();return;}
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 restoreDismiss=window.SettingsAccessActions?.bindDismiss?.(requestClose);
 dialog.showModal();(initialFocus||content.querySelector('input,select,button')||close).focus();
 return {dialog,body,close:destroy,requestClose};
}
createSettingsModal.serial=0;
async function confirmSettingsDiscard(dirty){
 return !dirty || await window.settingsConfirm({title:'Discard changes?',message:'Discard unsaved changes and close this dialog?',confirmText:'Discard'});
}

function settingsDialog({title='Confirm',message='',label,value,readOnly=false,confirmText='Save',fields}){
 return new Promise(resolve=>{
  const form=document.createElement('form');form.className='settingsModalForm';
  if(message){const p=document.createElement('p');p.textContent=message;form.append(p);}
  const inputs=[];
  for(const spec of fields||(label?[{name:'value',label,value}]:[])){
   const field=document.createElement('label');field.textContent=spec.label;
   const input=document.createElement('input');input.name=spec.name;input.value=spec.value||'';input.type=spec.type||'text';input.autocomplete='off';input.readOnly=readOnly;field.append(input);form.append(field);inputs.push(input);
  }
  const original=inputs.map(input=>input.value);const dirty=()=>!readOnly&&inputs.some((input,i)=>input.value!==original[i]);
  const footer=document.createElement('footer'),cancel=document.createElement('button'),save=document.createElement('button');
  cancel.type='button';cancel.className='secondaryButton';cancel.textContent='Cancel';save.type='submit';save.className='primaryButton';save.textContent=confirmText;
  if(readOnly&&inputs[0]){
   const copy=document.createElement('button');copy.type='button';copy.className='secondaryButton';copy.textContent=title.includes('Password')?'Copy Password':'Copy Email';
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(inputs[0].value);copy.textContent='Copied';}catch(_){inputs[0].focus();inputs[0].select();copy.textContent='Select and copy';}};footer.append(copy);
  }
  if(!readOnly)footer.append(cancel);footer.append(save);form.append(footer);
  let settled=false,modal;
  function finish(result){if(settled)return;settled=true;resolve(result);}
  modal=createSettingsModal({title,content:form,onDismiss:async()=>{if(!(await confirmSettingsDiscard(dirty())))return false;modal.close();finish(null);return true;},initialFocus:inputs[0]||cancel});
  form.addEventListener('input',()=>window.SettingsAccessActions?.setDirty?.(dirty()));
  form.addEventListener('submit',event=>{event.preventDefault();finish(fields?Object.fromEntries(inputs.map(input=>[input.name,input.value])):inputs[0]?inputs[0].value:true);modal.close();});
  cancel.onclick=modal.requestClose;
 });
}
window.settingsConfirm=options=>settingsDialog({title:({identity:'Confirm Pharmacy Update',admin:'Confirm Admin Assignment','reset-password':'Reset Password',suspend:'Suspend Pharmacy',activate:'Reactivate Pharmacy'})[window.SettingsAccessActions?.action?.()]||'Confirm Action',confirmText:'Confirm',...options}).then(result=>result===true);
function settingsInlinePrompt(options){return settingsDialog({...options,confirmText:'Continue'});}
window.settingsTextPrompt=options=>settingsDialog(options);
window.settingsPharmacyIdentityPrompt=({name,code})=>settingsDialog({title:'Edit Pharmacy',confirmText:'Save',fields:[{name:'name',label:'Pharmacy Name',value:name},{name:'code',label:'Pharmacy Code',value:code}]});

// Keep the grid in place while the native top-layer dialog makes it inert.
(function(){
 let current=null;
 const list=()=>document.getElementById('ownerPharmacyList');
 async function back(){
  if(!current)return true;if(AuthState.busy)return false;
  return current.dismiss?current.dismiss():false;
 }
 async function run(button,handler){
  if(current||AuthState.busy)return;
  const row=button.closest('.ownerPharmacyRow');if(!row)return;
  const saved={id:row.dataset.pharmacyRow,action:button.dataset.ownerAction,scroll:list().scrollTop,dirty:false,dismiss:null};current=saved;
  try{await handler();}finally{
   if(current===saved){current=null;renderOwnerManagementPanel();
    const target=[...list().querySelectorAll('.ownerPharmacyRow')].find(el=>el.dataset.pharmacyRow===saved.id)?.querySelector(`[data-owner-action="${saved.action}"]`);
    target?.closest('.ownerPharmacyRow')?.querySelector('.ownerPharmacySummary')?.click();target?.focus({preventScroll:true});list().scrollTop=saved.scroll;
   }
  }
 }
 document.addEventListener('click',event=>{
  const navigation=event.target.closest?.('.sidebar [data-page]');
  if(current&&navigation){event.preventDefault();event.stopImmediatePropagation();back().then(ok=>{if(ok)navigation.click();});}
 },true);
 window.addEventListener?.('beforeunload',event=>{if(current?.dirty){event.preventDefault();event.returnValue='';}});
 window.SettingsAccessActions={target:()=>current?.id||null,action:()=>current?.action||null,retainDraft:()=>!!current,refresh(){},run,back,bindDismiss(fn){if(!current)return ()=>{};const saved=current,previous=saved.dismiss;saved.dismiss=fn;return ()=>{if(current===saved&&saved.dismiss===fn)saved.dismiss=previous;};},setDirty(value){if(current)current.dirty=value;}};
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
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondaryButton';cancel.textContent='Cancel';footer.append(save,cancel);form.append(status,footer);
  let modal;const finish=()=>{modal.close();if(window.editPharmacyPermissions.cancel===finish)delete window.editPharmacyPermissions.cancel;resolve();};
  const dismiss=async()=>{if(AuthState.busy||!(await confirmSettingsDiscard(form.dataset.dirty==='true')))return false;finish();return true;};
  modal=createSettingsModal({title:'Permissions',content:form,onDismiss:dismiss});
  window.editPharmacyPermissions.cancel=finish;
  form.addEventListener('change',()=>{form.dataset.dirty='true';window.SettingsAccessActions?.setDirty?.(true);status.textContent='Unsaved changes';});
  cancel.onclick=modal.requestClose;
  form.onsubmit=async event=>{
   event.preventDefault();if(AuthState.busy)return;
   const fields=Object.fromEntries(options.map(([name])=>[name,form.querySelector(`[name="${name}"]`).value]));
   setAuthBusy(true);save.disabled=cancel.disabled=true;form.querySelectorAll('select').forEach(el=>el.disabled=true);status.textContent='Saving…';
   try{
    row=await authRpc('owner_set_pharmflow_permissions_v1',{p_pharmacy_id:id,p_receiving:fields.receiving,p_expiry:fields.expiry,p_data_access:fields.data_access,p_expected_revision:row.revision});
    form.dataset.dirty='false';window.SettingsAccessActions?.setDirty?.(false);status.textContent='Permissions saved.';
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
  let modal=null;
  function open(){
   if(!isSystemOwner() || window.SettingsAccessActions?.target())return;
   if(modal)return;scroll=document.getElementById('ownerPharmacyList').scrollTop;panel.hidden=false;
   modal=createSettingsModal({title:'Create Pharmacy & Admin',size:'create',content:panel,onDismiss:close,initialFocus:fields()[0]});
  }
  const status=form.querySelector('[data-create-status]');form.insertBefore(status,form.querySelector('footer'));
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
   if((dirty||pending) && !(await window.settingsConfirm({title:'Discard draft?',message:'Discard this draft? Any incomplete pharmacy retains no operational access. Created records are retained.'})))return false;
   pending=null;dirty=false;sessionStorage.removeItem(key);form.reset();status.textContent='';panel.hidden=true;
   workspace.before(panel);modal?.close();modal=null;renderOwnerManagementPanel();document.getElementById('ownerPharmacyList').scrollTop=scroll;document.getElementById('btnOpenCreateAccount').focus();return true;
  }
  form.querySelector('[data-create-cancel]').onclick=close;
  
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
 try{await navigator.clipboard.writeText(button.dataset.copyEmail);button.setAttribute('aria-label','Email copied');button.title='Copied';button.classList.add('copied');
  let feedback=document.getElementById('ownerCopyFeedback');if(!feedback){feedback=document.createElement('span');feedback.id='ownerCopyFeedback';feedback.className='settingsSrOnly';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.getElementById('ownerManagementPanel')?.append(feedback);}feedback.textContent='Email copied';
  setTimeout(()=>{if(button.isConnected){button.setAttribute('aria-label','Copy admin email');button.title='Copy email';button.classList.remove('copied');}},1600);}
 catch(_){await window.settingsTextPrompt({title:'Admin Email',label:'Copy email',value:button.dataset.copyEmail,readOnly:true,confirmText:'Close'});}
};
