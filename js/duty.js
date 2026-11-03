(function(){
 'use strict';
 if(typeof APP_CONFIG==='undefined'||APP_CONFIG.environment!=='staging'||typeof CLOUD_CONFIG==='undefined'||!CLOUD_CONFIG.url.includes('tovkcakucyagvbzvlnks.supabase.co'))return;
 const M=window.DutyModel;
 const state={month:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}),tab:'schedule',demo:false,data:null,scope:'',sequence:0,loading:false,error:'',lastRead:0};
 // Explicit ISO month construction does not depend on browser locale ordering.
 const todayParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 state.month=todayParts.find(p=>p.type==='year').value+'-'+todayParts.find(p=>p.type==='month').value;
 const root=document.getElementById('page-duty');if(!root)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=()=>typeof AuthState==='undefined'?null:AuthState.context;
 const scope=()=>!AuthState.session||AuthState.mustChangePassword?'':(context()?.user_id||AuthState.user?.id||'')+'/'+(context()?.pharmacy_id||'');
 const active=()=>typeof AppRouter!=='undefined'&&AppRouter.currentRoute==='duty';
 const view=()=>state.demo?M.demo():state.data||{positions:M.defaults,employees:[],can_write:false};
 function reset(){state.sequence++;state.data=null;state.error='';state.loading=false;state.scope=scope();closePanel();render();}
 async function load(force=false){
  if(!active()||!context()?.pharmacy_id||!scope())return;
  const key=scope();if(key!==state.scope)reset();
  if(state.loading||(!force&&state.data&&Date.now()-state.lastRead<30000))return;
  const seq=++state.sequence;state.loading=true;state.error='';render();
  try{
   const data=await authRpc('get_pharmflow_duty_foundation_v1',{p_pharmacy_id:context().pharmacy_id,p_month:state.month+'-01'});
   if(seq!==state.sequence||key!==scope())return;
   if(data.pharmacy_id!==context().pharmacy_id)throw Error('Duty pharmacy context changed. Reopen Duty.');
   state.data=data;state.scope=key;state.lastRead=Date.now();
  }catch(error){if(seq===state.sequence&&key===scope())state.error=error.message||'Unable to load Duty.';}
  finally{if(seq===state.sequence){state.loading=false;render();}}
 }
 function render(){
  const previousScroll=root.querySelector('.duty-grid-scroll');
  const scrollPosition=previousScroll?{left:previousScroll.scrollLeft,top:previousScroll.scrollTop}:null;
  const data=view(),days=M.days(state.month),staff=data.employees.filter(e=>e.active),fridays=days.filter(d=>d.friday).length;
  const monthTitle=new Date(state.month+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
  root.innerHTML=`<div class="duty-shell"><header class="duty-title-row"><div><h2>Duty</h2><p class="duty-subtitle">Monthly planning · ${esc(context()?.pharmacy_code||'Staging pharmacy')}</p></div><div class="duty-actions"><span class="duty-stage">Stage A · Foundation</span><button type="button" data-duty-action="demo">${state.demo?'Exit demo':'View demo'}</button><button type="button" class="duty-primary" data-duty-action="add-employee" ${!data.can_write?'disabled':''}>+ Add employee</button></div></header>
  ${state.demo?'<div class="duty-banner"><span><strong>Visual demo</strong> · Synthetic employees and sample times. Nothing in this view is saved.</span><span>Preview only</span></div>':''}
  ${state.error?`<div class="duty-banner duty-error" role="alert"><span>${esc(state.error)}</span><button type="button" data-duty-action="retry">Retry</button></div>`:''}
  <div class="duty-toolbar"><div class="duty-month-picker"><button type="button" data-duty-action="previous" aria-label="Previous month">‹</button><label><span class="sr-only">Month </span><input id="duty-month" type="month" value="${state.month}" aria-label="Duty month" min="1900-01" max="2199-12"></label><button type="button" data-duty-action="next" aria-label="Next month">›</button></div><nav class="duty-tabs" role="tablist" aria-label="Duty workspace">${['schedule','employees','positions'].map(tab=>`<button type="button" role="tab" aria-selected="${state.tab===tab}" data-duty-tab="${tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</nav></div>
  <div class="duty-meta"><strong>${esc(monthTitle)}</strong><span>${staff.length} employees</span><span><i class="duty-dot"></i>${fridays} Fridays</span><span>${state.demo?'Sample plan':esc(data.month?.status||'Draft')} · ${state.demo?'Not saved':'Empty schedule'}</span>${state.loading?'<span role="status">Updating…</span>':''}</div>
  ${state.tab==='schedule'?grid(data,days):list(data)}
  <footer class="duty-footnote"><span>${state.tab==='schedule'?'Scheduling and hour calculations become available after visual acceptance.':'Changes preserve employee and position history.'}</span><span>${state.demo?'Demo · memory only':state.data?'Saved to Staging':'Staging only'}</span></footer></div>`;
  const nextScroll=root.querySelector('.duty-grid-scroll');if(scrollPosition&&nextScroll){nextScroll.scrollLeft=scrollPosition.left;nextScroll.scrollTop=scrollPosition.top;}
 }
 function grid(data,days){
  const employees=data.employees.filter(e=>e.active);
  if(!employees.length)return `<div class="duty-empty"><h3>${state.loading?'Loading employees…':'Start your Duty workspace'}</h3><p>${state.loading?'Retrieving this pharmacy’s records.':'Add employees manually, or open the synthetic visual demo.'}</p><button type="button" data-duty-action="demo">View demo</button></div>`;
  let rows='';
  for(const position of data.positions){
   const members=employees.filter(e=>e.position_key===position.key);if(!members.length)continue;
   rows+=`<tr class="duty-group"><td colspan="${days.length+2}"><span>${esc(position.label)} · ${members.length}</span></td></tr>`;
   for(const employee of members){
    const idx=employees.indexOf(employee);
    rows+=`<tr class="duty-employee-row"><td class="duty-employee-col"><button type="button" class="duty-name-button" data-duty-employee="${esc(employee.code)}"><span class="duty-name">${esc(employee.name)}</span><span class="duty-code">${esc(employee.code)}</span></button></td><td class="duty-total-col"><span class="duty-total">${state.demo?'—':'0'}</span><span class="duty-hours-unit">hours${state.demo?' · sample':''}</span></td>`;
    rows+=days.map(d=>{const off=state.demo&&(d.day+idx)%7===0;return `<td class="duty-cell duty-day-col ${d.friday?'duty-friday':''}" tabindex="0" aria-label="${esc(employee.name)}, ${d.date}, ${state.demo?'sample duty':'empty'}">${state.demo?off?'<span class="duty-sample">OFF</span>':`<span class="duty-sample">${idx%3===0?'19:00 – 04:00':idx%3===1?'09:00 – 18:00':'15:00 – 00:00'}${idx%3===0?'<small>+1 day</small>':''}</span>`:'—'}</td>`;}).join('')+'</tr>';
   }
  }
  return `<div class="duty-grid-scroll" role="region" aria-label="Monthly duty schedule" tabindex="0"><table aria-label="Duty schedule for ${state.month}"><colgroup><col style="width:215px"><col style="width:84px">${days.map(()=>'<col style="width:88px">').join('')}</colgroup><thead><tr><th class="duty-employee-col" scope="col">Employee</th><th class="duty-total-col" scope="col">Total hours</th>${days.map(d=>`<th class="duty-day-col ${d.friday?'duty-friday':''}" scope="col">${d.weekday}<span class="duty-date">${String(d.day).padStart(2,'0')}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
   if(state.demo){error.textContent='Demo is for visual review only. Exit demo to manage saved employees.';return;}
   if(panelScope!==scope()){closePanel();reset();return;}
   const requestScope=scope(),fields=new FormData(form);save.disabled=true;
   try{
    const pid=context().pharmacy_id;
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
 function month(value){try{M.days(value);}catch(_){render();return;}state.month=value;state.lastRead=0;state.sequence++;state.loading=false;render();load(true);}
 root.addEventListener('change',e=>{if(e.target.id==='duty-month'&&e.target.value)month(e.target.value);});
 root.addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target)return;
  if(target.dataset.dutyTab){state.tab=target.dataset.dutyTab;render();return;}
  if(target.dataset.dutyEmployee){panel('employee',view().employees.find(x=>x.code===target.dataset.dutyEmployee));return;}
  if(target.dataset.dutyPosition){panel('position',view().positions.find(x=>x.key===target.dataset.dutyPosition));return;}
  switch(target.dataset.dutyAction){
   case 'demo':state.demo=!state.demo;render();break;
   case 'previous':month(M.shiftMonth(state.month,-1));break;
   case 'next':month(M.shiftMonth(state.month,1));break;
   case 'retry':load(true);break;
   case 'add-employee':panel('employee');break;
   case 'add-position':panel('position');break;
  }
 });
 root.addEventListener('keydown',e=>{
  if(!e.target.matches('.duty-cell'))return;
  const cells=[...root.querySelectorAll('.duty-cell')],index=cells.indexOf(e.target),width=M.days(state.month).length;
  const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:width,ArrowUp:-width}[e.key];
  if(delta!==undefined&&cells[index+delta]){e.preventDefault();cells[index+delta].focus();}
 });
 window.addEventListener('auth:context-ready',()=>{if(scope()!==state.scope)reset();if(active()&&!root.querySelector('.duty-panel'))load(true);});
 window.addEventListener('focus',()=>{if(scope()!==state.scope)reset();if(active()&&!root.querySelector('.duty-panel'))load();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&active()&&!root.querySelector('.duty-panel'))load();});
 window.addEventListener('storage',event=>{if(event.key===AUTH_STORAGE_KEY){reset();if(active())load(true);}});
 // Duty has no shared Receiving/Expiry synchronization path. One bounded read,
 // only while this module is visible, keeps its own records consistent across PCs.
 setInterval(()=>{if(active()&&document.visibilityState==='visible'&&!root.querySelector('.duty-panel'))load();},30000);
 AppEvents.on('route:changed',event=>{closePanel();if(event.routeName==='duty')load(true);});
 render();
})();
