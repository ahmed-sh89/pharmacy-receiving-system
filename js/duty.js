(function(){
 'use strict';
 const preview=document.body.hasAttribute('data-duty-synthetic');
 if(!preview&&(typeof APP_CONFIG==='undefined'||APP_CONFIG.environment!=='staging'||typeof CLOUD_CONFIG==='undefined'||!CLOUD_CONFIG.url.includes('tovkcakucyagvbzvlnks.supabase.co')))return;
 const M=window.DutyModel,root=document.getElementById('page-duty');if(!root)return;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const state={month:preview?'2026-11':parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value,tab:'schedule',demo:preview,data:null,scope:'',sequence:0,loading:false,error:'',lastRead:0};
 const demos=new Map();let demoSeedMonth=state.month;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=()=>typeof AuthState==='undefined'?null:AuthState.context;
 const scope=()=>preview?'synthetic':!AuthState.session||AuthState.mustChangePassword?'':(context()?.user_id||AuthState.user?.id||'')+'/'+(context()?.pharmacy_id||'');
 const active=()=>typeof AppRouter!=='undefined'&&AppRouter.currentRoute==='duty';
 const demoMonth=month=>{if(!demos.has(month)){const d=M.demoMonth(month);if(month!==demoSeedMonth)d.entries=[];
 if(preview&&month===demoSeedMonth){
  const assign=(index,day,payload)=>{const row=d.entries.find(e=>e.code===d.employees[index].code&&e.date===month+'-'+day);row.payload=payload;};
  assign(0,'01',M.normalize({status:'WORK',manual_minutes:{basic:540}}));
  assign(1,'02',M.normalize({status:'ANNUAL_LEAVE'}));
  assign(1,'04',M.parse('12 PM – 9:30 PM'));
  d.holidays=[{date:month+'-05',active:true,revision:1}];
 }demos.set(month,d);}return demos.get(month);};
 const view=()=>state.demo?demoMonth(state.month):state.data||{positions:M.defaults,employees:[],entries:[],holidays:[],can_write:false};
 function reset(){if(pendingConfirm)pendingConfirm(false);state.sequence++;state.data=null;state.error='';state.loading=false;state.scope=scope();state.demo=false;demos.clear();DutySchedule.clear();closePanel();render();}
 async function readMonth(month){
  const pharmacy=context()?.pharmacy_id,identity=scope();
  if(preview||!pharmacy||!identity)throw Error('Sign in to read Duty.');
  const result=await authRpc('get_pharmflow_duty_schedule_v1',{p_pharmacy_id:pharmacy,p_month:month+'-01'});
  if(result.pharmacy_id!==pharmacy||scope()!==identity)throw Error('Duty pharmacy context changed. Reopen Duty.');
  return result;
 }
 async function load(force=false){
  if(!active()||!context()?.pharmacy_id||!scope()||state.demo)return;
  const key=scope();if(key!==state.scope)reset();
  if(state.loading||DutySchedule.isEditing()||root.querySelector('.duty-panel')||(!force&&state.data&&Date.now()-state.lastRead<15000))return;
  const seq=++state.sequence,month=state.month;state.loading=true;state.error='';render();
  try{const data=await readMonth(month);if(seq!==state.sequence||key!==scope()||month!==state.month||state.demo)return;
   if(data.pharmacy_id!==context().pharmacy_id)throw Error('Duty pharmacy context changed. Reopen Duty.');state.data=data;state.scope=key;state.lastRead=Date.now();
  }catch(error){if(seq===state.sequence&&key===scope())state.error=error.message||'Unable to load Duty.';}
  finally{if(seq===state.sequence){state.loading=false;render();}}
 }
 async function mutate(name,args){
  const key=scope(),month=state.month;if(preview||!key)throw Error('Sign in to manage Duty.');
  await authRpc(name,{p_pharmacy_id:context().pharmacy_id,...args});
  const result=await readMonth(month);if(key!==scope()||month!==state.month)throw Error('Duty context changed. Reopen this month.');state.data=result;state.lastRead=Date.now();return result;
 }
 async function save(changes,reason){
  if(!state.demo)return mutate('save_pharmflow_duty_entries_v1',{p_changes:changes,p_reason:reason});
  const proposed=new Map();
  for(const c of changes){const month=c.date.slice(0,7);if(!proposed.has(month))proposed.set(month,structuredClone(demoMonth(month).entries));const entries=proposed.get(month),i=entries.findIndex(e=>e.code===c.code&&e.date===c.date),old=entries[i];if((old?.revision||0)!==c.expected_revision)throw Error('DUTY_CONFLICT');if(demoMonth(month).month?.status==='Completed')throw Error('Duty month is completed');const employee=demoMonth(month).employees.find(e=>e.code===c.code),value={...c,revision:(old?.revision||0)+1,identity:old?.identity||{name:employee.name,position_key:employee.position_key}};if(i<0)entries.push(value);else entries[i]=value;}
  M.validateOverlaps([...demos].flatMap(([month,d])=>proposed.get(month)||d.entries));for(const [month,entries] of proposed)demoMonth(month).entries=entries;return demoMonth(state.month);
 }
 function render(){
  const d=view();root.innerHTML=`<div class="duty-shell duty-stage-b"><div class="duty-toolbar"><div class="duty-month-picker"><strong class="duty-compact-title">Duty</strong><button type="button" data-duty-action="previous" aria-label="Previous month">‹</button><input id="duty-month" type="month" value="${state.month}" aria-label="Duty month" min="1900-01" max="2199-12"><button type="button" data-duty-action="next" aria-label="Next month">›</button></div><nav class="duty-tabs" role="tablist" aria-label="Duty workspace">${['schedule','employees','positions'].map(t=>`<button type="button" role="tab" aria-selected="${state.tab===t}" data-duty-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</nav><div class="duty-actions"><button type="button" data-duty-action="retry" title="Refresh Duty">↻</button>${preview?'':`<button type="button" data-duty-action="demo">${state.demo?'Exit demo':'View demo'}</button>`}<button type="button" class="duty-primary" data-duty-action="add-employee" ${!d.can_write?'disabled':''}>+ Employee</button></div></div>
  ${state.demo?'<div class="duty-banner"><span><strong>Interactive demo</strong> · Synthetic schedules. Edits stay in memory and reset on reload.</span></div>':''}
  ${state.error?`<div class="duty-banner duty-error" role="alert">${esc(state.error)}</div>`:''}${state.loading?'<div class="duty-inline-message" role="status">Updating Duty…</div>':''}
  ${state.tab==='schedule'?'<div id="duty-schedule-body"></div>':list(d)}</div>`;
  if(state.tab==='schedule')DutySchedule.mount(root.querySelector('#duty-schedule-body'),d,{month:state.month,demo:state.demo,loading:state.loading,save,readMonth:async month=>state.demo?demoMonth(month):readMonth(month),confirm:confirmReplace,panel:customPanel,
   holiday:async(date,active,revision)=>{if(!state.demo)return mutate('set_pharmflow_duty_holiday_v1',{p_date:date,p_active:active,p_expected_revision:revision});const d=demoMonth(date.slice(0,7)),i=d.holidays.findIndex(h=>h.date===date),v={date,active,revision:revision+1};if(i<0)d.holidays.push(v);else d.holidays[i]=v;return demoMonth(state.month);},
   monthStatus:async(status,revision,reason)=>{if(!state.demo)return mutate('set_pharmflow_duty_month_v1',{p_month:state.month+'-01',p_status:status,p_expected_revision:revision,p_reason:reason});const d=demoMonth(state.month);d.month={status,revision:revision+1};return d;}
  });
 }
 function list(data){
  if(state.tab==='positions')return `<div class="duty-list"><div class="duty-list-row"><strong>Positions</strong><button type="button" data-duty-action="add-position" ${!data.can_write?'disabled':''}>+ Add position</button></div>${data.positions.map(p=>`<div class="duty-list-row ${p.active?'':'duty-inactive'}"><span><strong>${esc(p.label)}</strong> <span class="duty-count">${p.active?'':'· Inactive'}</span></span><button type="button" data-duty-position="${esc(p.key)}" ${!data.can_write?'disabled':''}>Edit</button></div>`).join('')}</div>`;
  return `<div class="duty-list">${data.employees.length?data.employees.map(e=>`<div class="duty-list-row ${e.active?'':'duty-inactive'}"><span><strong>${esc(e.name)}</strong><span class="duty-code">${esc(e.code)} · ${esc(data.positions.find(p=>p.key===e.position_key)?.label||'Position')} ${e.active?'':'· Inactive'}</span></span><button type="button" data-duty-employee="${esc(e.code)}">${data.can_write?'Edit':'View'}</button></div>`).join(''):'<div class="duty-empty"><h3>No employees yet</h3><p>Employee records are entered manually.</p></div>'}</div>`;
 }
 let returnFocus=null,panelScope='';
 function closePanel(){const panel=root.querySelector('.duty-panel-backdrop');if(panel){panel.remove();if(returnFocus?.isConnected)returnFocus.focus();}}
 function panel(kind,item){
  const data=view();if(!data.can_write&&!(kind==='employee'&&item))return;
  closePanel();returnFocus=document.activeElement;panelScope=scope();
  const isEmployee=kind==='employee',editing=!!item,readOnly=!data.can_write;
  const backdrop=document.createElement('div');backdrop.className='duty-panel-backdrop';
  const choices=data.positions.filter(p=>p.active||p.key===item?.position_key);
  backdrop.innerHTML=`<form class="duty-panel" role="dialog" aria-modal="true" aria-labelledby="duty-panel-title"><div class="duty-panel-header"><div><h3 id="duty-panel-title">${readOnly?'View':editing?'Edit':'Add'} ${isEmployee?'employee':'position'}</h3><p class="duty-subtitle">${state.demo?'Synthetic demo · Changes are not saved.':'Duty · '+esc(context()?.pharmacy_code||'Staging')}</p></div><button type="button" data-duty-close aria-label="Close panel">×</button></div><div class="duty-panel-body">${isEmployee?`<label class="duty-field">Employee Code<input name="code" autocomplete="off" required maxlength="40" value="${esc(item?.code||'')}" ${editing?'readonly':''}><small>${editing?'Employee Code is the permanent identifier.':'Unique within this pharmacy.'}</small></label><label class="duty-field">Employee Name<input name="name" autocomplete="off" required maxlength="120" value="${esc(item?.name||'')}"></label><label class="duty-field">Position<select name="position_key" required>${choices.map(p=>`<option value="${esc(p.key)}" ${item?.position_key===p.key?'selected':''}>${esc(p.label)}${p.active?'':' (inactive)'}</option>`).join('')}</select></label>`:`<label class="duty-field">Position Name<input name="label" required maxlength="60" value="${esc(item?.label||'')}"></label>`}<label class="duty-field duty-field-check"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}> Active ${isEmployee?'employee':'position'}</label><p class="duty-panel-error" role="alert"></p></div><div class="duty-panel-footer"><button type="button" data-duty-close>Cancel</button>${!readOnly?'<button class="duty-primary" type="submit">Save</button>':''}</div></form>`;
  root.append(backdrop);const form=backdrop.querySelector('form');
  if(readOnly)form.querySelectorAll('input,select').forEach(el=>el.disabled=true);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop||e.target.closest('[data-duty-close]'))closePanel();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();const save=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');error.textContent='';
   if(panelScope!==scope()){closePanel();reset();return;}
   const requestScope=scope(),fields=new FormData(form);save.disabled=true;
   try{
    const pid=context()?.pharmacy_id;
    if(state.demo){
     const d=view();
     if(isEmployee){const input=M.validateEmployee({code:fields.get('code'),name:fields.get('name'),position_key:fields.get('position_key'),active:fields.has('active')});if(!item&&d.employees.some(e=>e.code.toLowerCase()===input.code.toLowerCase()))throw Error('This employee code already exists.');const value={...input,revision:(item?.revision||0)+1};for(const current of demos.values()){const index=current.employees.findIndex(e=>e.code===input.code);if(index<0)current.employees.push({...value});else current.employees[index]={...value};}}
     else {const label=String(fields.get('label')||'').trim();if(!label)throw Error('Enter a position name.');if(d.positions.some(p=>p.key!==item?.key&&p.label.toLowerCase()===label.toLowerCase()))throw Error('This position name already exists.');const value={key:item?.key||crypto.randomUUID(),label,active:fields.has('active'),revision:(item?.revision||0)+1};for(const current of demos.values()){const index=current.positions.findIndex(p=>p.key===value.key);if(index<0)current.positions.push({...value});else current.positions[index]={...value};}}
     closePanel();render();return;
    }
    if(isEmployee){const input=M.validateEmployee({code:fields.get('code'),name:fields.get('name'),position_key:fields.get('position_key'),active:fields.has('active')});
     await authRpc('save_pharmflow_duty_employee_v1',{p_pharmacy_id:pid,p_code:input.code,p_name:input.name,p_position_key:input.position_key,p_active:input.active,p_expected_revision:item?.revision||0});
    }else{
     const label=String(fields.get('label')||'').trim();if(!label)throw Error('Enter a position name.');
     await authRpc('save_pharmflow_duty_position_v1',{p_pharmacy_id:pid,p_key:item?.key||crypto.randomUUID(),p_label:label,p_active:fields.has('active'),p_expected_revision:item?.revision||0});
    }
    if(requestScope!==scope()||!form.isConnected)return;
    closePanel();await load(true);
   }catch(e){if(panelScope===scope()&&form.isConnected){error.textContent=String(e.message).includes('DUTY_CONFLICT')?'Changed on another device. Close this panel and refresh Duty before trying again.':String(e.message).includes('duplicate key')?'This employee code or position name already exists.':e.message;save.disabled=false;}}
  });
  backdrop.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closePanel();return;}
   if(e.key!=='Tab')return;
   const focusable=[...form.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];const first=focusable[0],last=focusable.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  form.querySelector('input:not([readonly])')?.focus();
 }

 let pendingConfirm=null;
 function confirmReplace(message){
  return new Promise(resolve=>{
   const backdrop=document.createElement('div');backdrop.className='duty-confirm-backdrop';backdrop.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="duty-confirm-title" class="duty-confirm-card"><h3 id="duty-confirm-title">Replace Duty entries?</h3><p>${esc(message)}</p><div class="duty-actions"><button type="button" data-confirm-cancel>Cancel</button><button type="button" class="duty-primary" data-confirm-replace>Replace</button></div></section>`;
   const finish=result=>{backdrop.remove();pendingConfirm=null;resolve(result);};pendingConfirm=finish;root.append(backdrop);
   backdrop.onclick=e=>{if(e.target===backdrop||e.target.closest('[data-confirm-cancel]'))finish(false);else if(e.target.closest('[data-confirm-replace]'))finish(true);};
   backdrop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finish(false);}if(e.key==='Tab'){e.preventDefault();const buttons=[...backdrop.querySelectorAll('button')];buttons[document.activeElement===buttons[0]?1:0].focus();}};backdrop.querySelector('button').focus();
  });
 }
 function customPanel(title,body,onSubmit){
  closePanel();returnFocus=document.activeElement;const requestScope=scope();
  const backdrop=document.createElement('div');backdrop.className='duty-panel-backdrop';
  backdrop.innerHTML=`<form class="duty-panel" role="dialog" aria-modal="true" aria-labelledby="duty-custom-title"><div class="duty-panel-header"><h3 id="duty-custom-title">${esc(title)}</h3><button type="button" data-custom-close aria-label="Close panel">×</button></div><div class="duty-panel-body">${body}<p class="duty-panel-error" role="alert"></p></div><div class="duty-panel-footer"><button type="button" data-custom-close>Cancel</button><button type="submit" class="duty-primary">Apply</button></div></form>`;
  root.append(backdrop);const form=backdrop.querySelector('form');
  backdrop.onclick=e=>{if(e.target===backdrop||e.target.closest('[data-custom-close]'))closePanel();};
  backdrop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closePanel();}if(e.key==='Tab'){const items=[...form.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}};
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{if(requestScope!==scope())throw Error('Duty identity changed. Reopen this panel.');await onSubmit(new FormData(form));if(form.isConnected)closePanel();}catch(error){if(form.isConnected){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}}};
  form.querySelector('input,select,textarea,button')?.focus();return form;
 }
 function month(value){if(DutySchedule.isEditing()){state.error='Save with Enter or cancel with Escape before changing month.';return;}try{M.days(value);}catch(_){return;}state.month=value;state.lastRead=0;state.sequence++;state.loading=false;state.data=null;DutySchedule.clear();render();load(true);}
 root.addEventListener('change',e=>{if(e.target.id==='duty-month'&&e.target.value)month(e.target.value);});
 root.addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target)return;
  if(target.closest('#duty-schedule-body,.duty-panel-backdrop'))return;
  if(DutySchedule.isEditing()){state.error='Press Enter to save or Escape to cancel the current edit.';return;}
  if(target.dataset.dutyTab){state.tab=target.dataset.dutyTab;render();return;}
  if(target.dataset.dutyEmployee){panel('employee',view().employees.find(x=>x.code===target.dataset.dutyEmployee));return;}
  if(target.dataset.dutyPosition){panel('position',view().positions.find(x=>x.key===target.dataset.dutyPosition));return;}
  switch(target.dataset.dutyAction){
   case 'demo':if(preview)return;if(!demos.size)demoSeedMonth=state.month;state.demo=!state.demo;DutySchedule.clear();render();if(!state.demo)load(true);break;
   case 'previous':month(M.shiftMonth(state.month,-1));break;case 'next':month(M.shiftMonth(state.month,1));break;
   case 'retry':load(true);break;case 'add-employee':panel('employee');break;case 'add-position':panel('position');break;
  }
 });
 if(preview){render();return;}
 window.addEventListener('auth:context-ready',()=>{if(scope()!==state.scope)reset();if(active())load(true);});
 window.addEventListener('focus',()=>{if(scope()!==state.scope)reset();if(active())load();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&active())load();});
 window.addEventListener('storage',e=>{if(e.key===AUTH_STORAGE_KEY){reset();if(active())load(true);}});
 setInterval(()=>{if(active()&&document.visibilityState==='visible')load();},15000);
 AppEvents.on('route:changed',event=>{if(pendingConfirm)pendingConfirm(false);closePanel();DutySchedule.clear();if(event.routeName==='duty')load(true);});
 render();
})();
