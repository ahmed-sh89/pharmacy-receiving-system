(function(){
 'use strict';
 const preview=document.body.hasAttribute('data-duty-synthetic');
 if(!preview&&(typeof APP_CONFIG==='undefined'||APP_CONFIG.environment!=='staging'||typeof CLOUD_CONFIG==='undefined'||!CLOUD_CONFIG.url.includes('tovkcakucyagvbzvlnks.supabase.co')))return;
 const M=window.DutyModel,root=document.getElementById('page-duty');if(!root)return;
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const monthLabel=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const currentMonth=today().slice(0,7);
 const state={month:preview?'2026-11':currentMonth,tab:'schedule',demo:preview,data:null,scope:'',sequence:0,loading:false,error:'',lastRead:0};
 const demos=new Map(),demoRules=[];let demoStaff=M.demo(),demoSeedMonth=state.month,demoPharmacyCode='DEMO',demoDefaultBasic=M.DEFAULT_BASIC;
 const customKey='pharmflow-duty-synthetic-custom-v1';
 let demoCustom=null;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=()=>typeof AuthState==='undefined'?null:AuthState.context;
 const scope=()=>preview?'synthetic':!AuthState.session||AuthState.mustChangePassword?'':(context()?.user_id||AuthState.user?.id||'')+'/'+(context()?.pharmacy_id||'');
 const active=()=>typeof AppRouter!=='undefined'&&AppRouter.currentRoute==='duty';
 const demoMonth=month=>{if(!demos.has(month)){const d=M.demoMonth(month);if(month!==demoSeedMonth)d.entries=[];
 Object.assign(d,demoStaff,{hour_rules:demoRules});
 if(preview&&month===demoSeedMonth){
  const assign=(index,day,payload)=>{const row=d.entries.find(e=>e.code===d.employees[index].code&&e.date===month+'-'+day);row.payload=payload;};
  assign(0,'01',M.normalize({status:'WORK',manual_minutes:{basic:540}}));
  assign(1,'02',M.normalize({status:'ANNUAL_LEAVE'}));
  assign(1,'04',M.parse('12 PM – 9:30 PM'));
  d.holidays=[{date:month+'-05',active:true,name:'Public holiday',revision:1}];
 }demos.set(month,d);}return Object.assign(demos.get(month),{default_basic:demoDefaultBasic});};
 const view=()=>state.demo?demoMonth(state.month):state.data||{positions:M.defaults,employees:[],entries:[],holidays:[],can_write:false};
 function reset(){if(pendingConfirm)pendingConfirm(false);state.sequence++;state.data=null;state.error='';state.loading=false;state.scope=scope();state.demo=false;demos.clear();demoRules.length=0;demoStaff=M.demo();demoPharmacyCode='DEMO';demoDefaultBasic=M.DEFAULT_BASIC;DutySchedule.clear();closePanel();render();}
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
  const d=view();root.innerHTML=`<div class="duty-shell duty-stage-b"><div class="duty-toolbar"><div class="duty-month-picker"><button type="button" data-duty-action="previous" aria-label="Previous month">‹</button><span class="duty-active-month"><span aria-hidden="true">${monthLabel.format(new Date(state.month+'-01T12:00Z'))}</span><input id="duty-month" title="${state.month===currentMonth?'Current month':'Selected month'}" type="month" value="${state.month}" aria-label="Duty month" min="1900-01" max="2199-12"></span><button type="button" data-duty-action="next" aria-label="Next month">›</button></div><nav class="duty-tabs" role="tablist" aria-label="Duty workspace">${['schedule','employees','positions','reports'].map(t=>`<button type="button" role="tab" aria-selected="${state.tab===t}" data-duty-tab="${t}">${t==='reports'?'Duty Reports':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</nav><div class="duty-actions">${state.demo?`<span class="duty-demo-badge" title="Schedule edits reset on reload; saved Custom View lasts for this tab session">Synthetic demo · ${esc(demoPharmacyCode)}</span>`:''}<button type="button" data-duty-action="retry" title="Refresh Duty">↻</button>${preview?'':`<button type="button" data-duty-action="demo">${state.demo?'Exit demo':'View demo'}</button>`}${state.tab==='schedule'?`<button type="button" data-duty-action="calendar" ${!d.can_write?'disabled':''}>Calendar Settings</button>`:''}${state.tab!=='reports'?`<button type="button" class="duty-primary" data-duty-action="add-employee" ${!d.can_write?'disabled':''}>+ Employee</button>`:''}</div></div>

  ${state.error?`<div class="duty-banner duty-error" role="alert">${esc(state.error)}</div>`:''}${state.loading?'<div class="duty-inline-message" role="status">Updating Duty…</div>':''}
  ${state.tab==='schedule'?'<div id="duty-schedule-body"></div>':state.tab==='reports'?'<div id="duty-reports-body"></div>':list(d)}</div>`;
  if(state.tab==='schedule')DutySchedule.mount(root.querySelector('#duty-schedule-body'),d,scheduleConfig());
  if(state.tab==='reports')window.DutyReports.mount(root.querySelector('#duty-reports-body'),d,{month:state.month,demo:state.demo,pharmacyCode:state.demo?demoPharmacyCode:context()?.pharmacy_code});
 }
 function scheduleConfig(){return {month:state.month,demo:state.demo,loading:state.loading,save,confirm:confirmReplace,panel:customPanel,
   loadCustom:()=>{try{const raw=sessionStorage.getItem(customKey);if(raw!==null){const ids=JSON.parse(raw);if(Array.isArray(ids)&&ids.every(id=>typeof id==='string'))return ids;}}catch{/* Session memory fallback. */}return demoCustom;},
   saveCustom:ids=>{demoCustom=ids;try{sessionStorage.setItem(customKey,JSON.stringify(ids));}catch{/* Session memory fallback. */}},
   holiday:async(dates,active,name,note)=>{
    if(!state.demo){
     if(dates.length!==1||!dates[0].startsWith(state.month+'-'))throw Error('Choose one date in the selected month.');
     const date=dates[0],revision=state.data.holidays.find(h=>h.date===date)?.revision||0;
     return mutate('set_pharmflow_duty_holiday_v1',{p_date:date,p_active:active,p_expected_revision:revision});
    }
    const targets=dates.map(date=>({date,month:demoMonth(date.slice(0,7))}));
    if(targets.some(t=>t.month.month?.status==='Completed'))throw Error('A selected month is completed.');
    for(const {date,month} of targets){
     const i=month.holidays.findIndex(h=>h.date===date),row={date,active,revision:(month.holidays[i]?.revision||0)+1,name,note};
     if(i<0)month.holidays.push(row);else month.holidays[i]=row;
    }
    return demoMonth(state.month);
   },
   today,planBasic:(minutes,from)=>M.basicUpdates(demoStaff.employees,minutes,from,today()),
   saveBasic:(minutes,updates)=>{
    if(updates)for(const {employee,defaults} of updates)employee.basic_defaults=defaults;
    else demoDefaultBasic=minutes;
    return demoMonth(state.month);
   },
   hourRules:rules=>{demoRules.splice(0,demoRules.length,...rules);return demoMonth(state.month);}

  };
 }
 function list(data){
  const positions=state.tab==='positions';
  const editIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12 4 4L8 20H4zM14 6l4 4"/></svg>';
  const cards=positions?data.positions.map(p=>`<article class="duty-directory-card"><div><strong>${esc(p.label)}</strong><small>${data.employees.filter(e=>e.position_key===p.key).length} staff${p.active?'':' · Inactive'}</small></div><button type="button" class="duty-icon" data-duty-position="${esc(p.key)}" aria-label="Edit ${esc(p.label)}" ${!data.can_write?'disabled':''}>${editIcon}</button></article>`):
   data.employees.map(e=>`<article class="duty-directory-card"><div><strong>${esc(e.name)}</strong><small>${esc(e.display_code||e.code)} · ${esc(data.positions.find(p=>p.key===e.position_key)?.label||'Position')}${e.active?'':' · Inactive'}</small><small>${M.hours(M.basicDefault(e))} h Basic</small></div><button type="button" class="duty-icon" data-duty-employee="${esc(e.code)}" aria-label="${data.can_write?'Edit':'View'} ${esc(e.name)}">${editIcon}</button></article>`);
  return `<section class="duty-directory"><div class="duty-directory-heading"><strong>${positions?'Positions':'Employees'}</strong>${positions?`<button type="button" data-duty-action="add-position" ${!data.can_write?'disabled':''}>+ Add position</button>`:state.demo?'<button type="button" data-duty-action="hour-rules">Working Hours Settings</button>':''}</div><div class="duty-directory-grid">${cards.join('')||'No employees yet.'}</div></section>`;
 }
 let returnFocus=null,panelScope='';
 function closePanel(){const panel=root.querySelector('.duty-panel-backdrop');if(panel){panel.remove();if(returnFocus?.isConnected)returnFocus.focus();}}
 function panel(kind,item){
  const data=view();if(!data.can_write&&!(kind==='employee'&&item))return;
  closePanel();returnFocus=document.activeElement;panelScope=scope();
  const isEmployee=kind==='employee',editing=!!item,readOnly=!data.can_write;
  const backdrop=document.createElement('div');backdrop.className='duty-panel-backdrop';
  const choices=data.positions.filter(p=>p.active||p.key===item?.position_key);
  backdrop.innerHTML=`<form class="duty-panel" role="dialog" aria-modal="true" aria-labelledby="duty-panel-title"><div class="duty-panel-header"><div><h3 id="duty-panel-title">${readOnly?'View':editing?'Edit':'Add'} ${isEmployee?'employee':'position'}</h3><p class="duty-subtitle">${state.demo?'Synthetic demo · Changes reset on reload.':'Duty · '+esc(context()?.pharmacy_code||'Staging')}</p></div><button type="button" data-duty-close aria-label="Close panel">×</button></div><div class="duty-panel-body">${isEmployee?`<label class="duty-field">Employee Code<input name="code" autocomplete="off" required maxlength="40" value="${esc(item?.display_code||item?.code||'')}" ${editing&&!state.demo?'readonly':''}><small>${editing&&!state.demo?'Code changes require database support.':'Unique within this pharmacy.'}</small></label><label class="duty-field">Employee Name<input name="name" autocomplete="off" required maxlength="120" value="${esc(item?.name||'')}"></label><label class="duty-field">Position<select name="position_key" required>${choices.map(p=>`<option value="${esc(p.key)}" ${item?.position_key===p.key?'selected':''}>${esc(p.label)}${p.active?'':' (inactive)'}</option>`).join('')}</select></label><div class="duty-detail-grid"><label class="duty-field">Pharmacy Code<input name="pharmacyCode" maxlength="40" required value="${esc(state.demo?demoPharmacyCode:context()?.pharmacy_code||data.pharmacy_id||'')}" ${state.demo?'':'readonly'}></label><label class="duty-field">Default Basic hours<input name="basic" type="number" min="0" max="24" step="any" value="${(item?M.basicDefault(item):state.demo?demoDefaultBasic:M.DEFAULT_BASIC)/60}" ${state.demo?'':'readonly'}></label></div>`:`<label class="duty-field">Position Name<input name="label" required maxlength="60" value="${esc(item?.label||'')}"></label>`}<label class="duty-field duty-field-check"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}> Active ${isEmployee?'employee':'position'}</label><p class="duty-panel-error" role="alert"></p></div><div class="duty-panel-footer"><button type="button" data-duty-close>Cancel</button>${!readOnly?'<button class="duty-primary" type="submit">Save</button>':''}</div></form>`;
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
     if(isEmployee){
      const input=M.validateEmployee({code:fields.get('code'),name:fields.get('name'),position_key:fields.get('position_key'),active:fields.has('active')});
      if(d.employees.some(e=>e.code!==item?.code&&(e.display_code||e.code).toLowerCase()===input.code.toLowerCase()))throw Error('This employee code already exists.');
      // The synthetic schedule key stays immutable even when the displayed code changes.
      const pharmacyCode=fields.get('pharmacyCode').trim();
      if(!pharmacyCode)throw Error('Enter a Pharmacy Code.');
      const minutes=M.hourMinutes(fields.get('basic')),unchanged=item&&minutes===M.basicDefault(item);
      const value={...input,display_code:input.code,code:item?.code||crypto.randomUUID(),basic_minutes:unchanged?item.basic_minutes:minutes,basic_defaults:unchanged?item.basic_defaults:undefined,revision:(item?.revision||0)+1};
      demoPharmacyCode=pharmacyCode;
      const index=d.employees.findIndex(e=>e.code===value.code);
      if(index<0)d.employees.push(value);else d.employees[index]=value;
     }
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
 function confirmReplace(message,action='Replace'){
  return new Promise(resolve=>{
   const backdrop=document.createElement('div');backdrop.className='duty-confirm-backdrop';backdrop.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="duty-confirm-title" class="duty-confirm-card"><h3 id="duty-confirm-title">${action} Duty entries?</h3><p>${esc(message)}</p><div class="duty-actions"><button type="button" data-confirm-cancel>Cancel</button><button type="button" class="duty-primary" data-confirm-replace>${action}</button></div></section>`;
   const finish=result=>{backdrop.remove();pendingConfirm=null;resolve(result);};pendingConfirm=finish;root.append(backdrop);
   backdrop.onclick=e=>{if(e.target===backdrop||e.target.closest('[data-confirm-cancel]'))finish(false);else if(e.target.closest('[data-confirm-replace]'))finish(true);};
   backdrop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finish(false);}if(e.key==='Tab'){e.preventDefault();const buttons=[...backdrop.querySelectorAll('button')];buttons[document.activeElement===buttons[0]?1:0].focus();}};backdrop.querySelector('button').focus();
  });
 }
 function customPanel(title,body,onSubmit,label='Apply'){
  closePanel();returnFocus=document.activeElement;const requestScope=scope();
  const backdrop=document.createElement('div');backdrop.className='duty-panel-backdrop';
  backdrop.innerHTML=`<form class="duty-panel" role="dialog" aria-modal="true" aria-labelledby="duty-custom-title"><div class="duty-panel-header"><h3 id="duty-custom-title">${esc(title)}</h3><button type="button" data-custom-close aria-label="Close panel">×</button></div><div class="duty-panel-body">${body}<p class="duty-panel-error" role="alert"></p></div><div class="duty-panel-footer"><button type="button" data-custom-close>Cancel</button>${onSubmit?`<button type="submit" class="duty-primary">${esc(label)}</button>`:' '}</div></form>`;
  root.append(backdrop);const form=backdrop.querySelector('form');
  backdrop.onclick=e=>{if(e.target===backdrop||e.target.closest('[data-custom-close]'))closePanel();};
  backdrop.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closePanel();}if(e.key==='Tab'){const items=[...form.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}};
  form.onsubmit=async e=>{e.preventDefault();if(!onSubmit)return;const button=form.querySelector('[type=submit]');button.disabled=true;try{if(requestScope!==scope())throw Error('Duty identity changed. Reopen this panel.');await onSubmit(new FormData(form));if(form.isConnected)closePanel();}catch(error){if(form.isConnected){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}}};
  form.querySelector('input,select,textarea,button')?.focus();return form;
 }
 function month(value){if(DutySchedule.isEditing()){state.error='Save with Enter or cancel with Escape before changing month.';return;}try{M.days(value);}catch(_){return;}state.month=value;state.lastRead=0;state.sequence++;state.loading=false;state.data=null;DutySchedule.clear(true);render();load(true);}
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
   case 'calendar':DutySchedule.calendar();break;case 'hour-rules':if(state.demo)DutySchedule.rules(view(),scheduleConfig());break;
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
