/* Duty-only scheduler. All persisted writes pass through scoped, versioned RPCs. */
(function(){
 'use strict';
 const M=window.DutyModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S={range:null,group:'pharmacists',staffPage:0,custom:new Set(),month:'',selected:[],anchor:null,cursor:null,clipboard:[],busy:false,confirming:false,notice:'',editing:null};
 let host,data,options,scopeVersion=0,drag=null,skipClick=false;
 const palette=[['blue','Blue'],['mint','Mint'],['violet','Violet'],['rose','Rose'],['','Clear Color']];
 const past=[],future=[],localRevisions=new Map();
 const canOverride=()=>options.demo||data.manual_hours===true;
 const categoryLabels={...M.categories,basic:'Basic',total:'Total'};
 const formatDate=date=>new Date(date+'T12:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
 const clearHistory=()=>{past.length=0;future.length=0;localRevisions.clear();};
 const key=(code,date)=>code+'|'+date;
 const entry=(code,date)=>data.entries?.find(e=>e.code===code&&e.date===date);
 const payload=(code,date)=>entry(code,date)?.payload||M.normalize();
 function roster(){
  const history=data.entries||[],all=data.employees.filter(e=>e.active||history.some(x=>x.code===e.code&&x.payload.status!=='EMPTY'));
  return all.map(e=>{const h=history.find(x=>x.code===e.code);return h&&!options.demo?{...e,...h.identity}:e;});
 }
 const staffList=()=>roster().filter(e=>S.group==='custom'?S.custom.has(e.code):(e.position_key==='pharmacist')===(S.group==='pharmacists'));
 const employees=()=>staffList().slice(S.staffPage*6,S.staffPage*6+6);
 const hoursFor=(code,date,p)=>M.effectiveHours(date,p,!!holiday(date),data.employees.find(e=>e.code===code),data.hour_rules);
 const dates=()=>M.calendarRange(S.month,S.range);
 const selected=(code,date)=>S.selected.some(s=>s.code===code&&s.date===date);
 const writable=()=>data.can_write&&!S.busy&&!S.confirming&&!options.loading&&data.month?.status!=='Completed';
 const writableDateForMonth=date=>date.startsWith(S.month+'-');
 const writableDate=date=>writable()&&writableDateForMonth(date);
 const holiday=date=>data.holidays.find(h=>h.date===date&&h.active);
 function mount(el,d,config){
  host=el;data={entries:[],holidays:[],...d};options=config;
  if(S.month!==config.month){S.month=config.month;S.range=null;clearSelection();S.editing=null;S.notice='';}
  render();
 }
 function clearSelection(){S.selected=[];S.anchor=null;S.cursor=null;S.rowAnchor=null;}
 function render(){
  if(!host?.isConnected)return;
  const scroll=host.querySelector('.duty-grid-scroll'),scrollPosition={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
  const days=dates(),count=staffList().length,pages=Math.max(1,Math.ceil(count/6));
  S.staffPage=Math.min(S.staffPage,pages-1);
  const staff=employees(),totals=M.totals(data.entries,data.holidays,data.employees,data.hour_rules);
  const rosterOptions=roster();
  const monthDays=M.days(S.month),first=monthDays[0].date,last=monthDays.at(-1).date;
  const groups=[['pharmacists','Pharmacists'],['support','Labor + Beauty'],['custom','Custom']];
  host.innerHTML=`<div class="duty-schedule-controls">
   ${dropdown('staff','Staff',groups.find(([id])=>id===S.group)[1],groups,S.group)}
   ${S.group==='custom'?dropdown('custom','Choose staff','Choose staff',rosterOptions.map(e=>[e.code,e.name]),S.custom):''}
   <div class="duty-period" aria-label="Staff pages"><button type="button" data-s-action="staff-back" aria-label="Previous staff page" ${S.staffPage?'':'disabled'}>‹</button><span>${S.staffPage+1}/${pages}</span><button type="button" data-s-action="staff-next" aria-label="Next staff page" ${S.staffPage+1<pages?'':'disabled'}>›</button></div>
   <details class="duty-date-range"><summary>${S.range?formatDate(S.range.from)+' – '+formatDate(S.range.to):'Date Range'}</summary>
   <form data-date-range><label>From <input name="from" type="date" required min="${first}" max="${last}" value="${S.range?.from||first}"></label><label>To <input name="to" type="date" required min="${first}" max="${last}" value="${S.range?.to||last}"></label><button type="submit">Apply</button></form></details>
   ${S.range?'<button type="button" data-s-action="full-month">Full Month</button>':''}
   <div class="duty-actions duty-selection-tools" role="group" aria-label="Schedule actions">
   <button type="button" data-s-action="copy">Copy</button><button type="button" data-s-action="paste">Paste</button>
   ${[['delete','Delete','Delete','M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7'],['undo','Undo','Ctrl+Z','M8 4L3 9l5 5M3 9h11a5 5 0 0 1 0 10h-3'],['redo','Redo','Ctrl+Y','M16 4l5 5-5 5m5-5H10a5 5 0 0 0 0 10h3']].map(([id,label,shortcut,path])=>`<button type="button" class="duty-icon duty-icon-${id}" data-s-action="${id}" aria-label="${label}" title="${label} (${shortcut})" ${id==='undo'&&(!past.length||!writable())||id==='redo'&&(!future.length||!writable())?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`).join('')}
   ${dropdown('status','Apply status to selection','Status…',Object.entries({...M.statuses,OTHER_LEAVE:'Unpaid Leave',EMPTY:'Clear Cell'}))}
   <button type="button" data-s-action="color">Cell Color</button></div></div>
   <div class="duty-grid-scroll duty-vertical" role="region" aria-label="Duty schedule"><table aria-label="Duty schedule" style="min-width:${78+staff.length*148}px">
    <colgroup><col style="width:78px">${staff.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col" class="duty-date-heading">Duty</th>
    ${staff.map(e=>`<th scope="col"><div class="duty-staff-card"><div class="duty-staff-title"><span class="duty-name">${esc(e.name)}</span><span class="duty-code">${esc(e.display_code||e.code)}${e.active?'':' · inactive'}</span></div><div class="duty-kpi-wrap"><div class="duty-mini-kpis">${Object.entries(categoryLabels).map(([k,label])=>`<span class="duty-category-${k}">${label} <b>${M.hours(totals[e.code]?.[k]||0)}</b></span>`).join('')}</div></div></div></th>`).join('')}</tr></thead>
    <tbody>${staff.length?days.map(d=>`<tr class="${d.friday?'duty-friday-row':holiday(d.date)?'duty-holiday-row':''}"><th scope="row"><button class="duty-date-button" type="button" data-s-column="${d.date}" aria-label="Select ${d.date}"><strong>${formatDate(d.date)}</strong><span>${new Date(d.date+'T12:00Z').toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'})}</span>${holiday(d.date)?`<small>${esc(holiday(d.date).name||'Holiday')}</small>`:''}</button></th>${staff.map(e=>cell(e,d)).join('')}</tr>`).join(''):'<tr><td class="duty-empty">No employees in this view</td></tr>'}</tbody></table></div>
   <div class="duty-footnote"><span role="status">${esc(S.notice||(!canOverride()?'Manual hours and hour-rule settings are available in the synthetic preview pending database approval.':'Double-click to edit · Drag to select a range'))}</span></div>`;
  const grid=host.querySelector('.duty-grid-scroll');
  grid.scrollTo?.(scrollPosition);
  bind();updateSelection();
 }
 function cell(e,d){
  const p=payload(e.code,d.date),n=hoursFor(e.code,d.date,p);
  const times=p.periods.map(t=>`<span>${M.formatTime(t.start)} – ${M.formatTime(t.end)}</span>`).join('');
  const categories=Object.entries(categoryLabels).filter(([k])=>k!=='total'&&n[k]>0).map(([k,label])=>{
   const manual=Object.hasOwn(p.manual_minutes||{},k);
   return `<span data-s-hours="${k}" class="duty-category-${k} ${manual?'duty-manual':''}">${label} <b>${M.hours(n[k])}</b></span>`;
  }).join('');
  const status=p.working_pending?'Working':p.status!=='WORK'&&p.status!=='EMPTY'?(p.status==='OTHER_LEAVE'?'Unpaid Leave':M.statuses[p.status]):'';
  return `<td tabindex="-1" aria-label="${esc(e.name)}, ${d.date}, ${esc(M.text(p)||(categories?'Hours only':'Empty'))}${p.note?', note: '+esc(p.note):''}" data-s-code="${esc(e.code)}" data-s-date="${d.date}" class="duty-cell ${['ANNUAL_LEAVE','SICK_LEAVE','OTHER_LEAVE'].includes(p.status)?'duty-leave':''} ${p.highlight?'duty-mark-'+p.highlight:''}">
   ${times?`<div data-s-time class="duty-cell-time">${times}</div>`:status?`<span class="duty-cell-status">${status}</span>`:''}
   ${p.note?'<span class="duty-note-dot" aria-hidden="true">•</span>':''}
   ${categories?`<div class="duty-cell-categories">${categories}</div>`:''}</td>`;
 }
 function select(code,date,range){
  S.rowAnchor=null;
  if(range&&S.anchor){const staff=employees(),ds=dates(),a=staff.findIndex(e=>e.code===S.anchor.code),b=staff.findIndex(e=>e.code===code),x=ds.findIndex(d=>d.date===S.anchor.date),y=ds.findIndex(d=>d.date===date);if(a<0||b<0)return;S.selected=[];for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(x,y);j<=Math.max(x,y);j++)S.selected.push({code:staff[i].code,date:ds[j].date});}
  else {S.selected=[{code,date}];S.anchor={code,date};}
  S.cursor={code,date};updateSelection();
 }
 function selectRows(date,extend=false,toggle=false){
  const staff=employees(),days=dates(),target=days.findIndex(d=>d.date===date);
  if(!staff.length||target<0)return;
  const start=extend?days.findIndex(d=>d.date===S.rowAnchor):-1;
  const chosen=toggle?new Set(S.selected.filter(c=>staff.every(e=>selected(e.code,c.date))).map(c=>c.date)):new Set();
  if(toggle&&chosen.has(date))chosen.delete(date);
  else for(let i=start<0?target:Math.min(start,target);i<=(start<0?target:Math.max(start,target));i++)chosen.add(days[i].date);
  if(start<0)S.rowAnchor=date;
  S.selected=staff.flatMap(e=>days.filter(d=>chosen.has(d.date)).map(d=>({code:e.code,date:d.date})));
  S.anchor={code:staff[0].code,date:S.rowAnchor};
  S.cursor={code:staff[0].code,date};
  updateSelection();
 }
 function findCell(code,date){return host.querySelector(`[data-s-code="${CSS.escape(code)}"][data-s-date="${date}"]`);}
 function focus(code,date,scroll=false){findCell(code,date)?.focus({preventScroll:!scroll});}
 function focusSelection(){if(S.cursor)focus(S.cursor.code,S.cursor.date);}
 function updateSelection(){
  const keys=new Set(S.selected.map(c=>key(c.code,c.date)));
  const cells=[...host.querySelectorAll('[data-s-code]')];
  const isSelected=td=>td?.hasAttribute('data-s-code')&&keys.has(key(td.dataset.sCode,td.dataset.sDate));
  for(const td of cells){
   const {sCode:code,sDate:date}=td.dataset,active=isSelected(td),row=td.parentElement;
   td.classList.toggle('duty-selected',active);
   td.classList.toggle('duty-edge-top',active&&!isSelected(row.previousElementSibling?.children[td.cellIndex]));
   td.classList.toggle('duty-edge-bottom',active&&!isSelected(row.nextElementSibling?.children[td.cellIndex]));
   td.classList.toggle('duty-edge-left',active&&!isSelected(td.previousElementSibling));
   td.classList.toggle('duty-edge-right',active&&!isSelected(td.nextElementSibling));
   td.tabIndex=(S.cursor?code===S.cursor.code&&date===S.cursor.date:td===cells[0])?0:-1;
  }
  const hasSelection=!!S.selected.length&&!S.editing;
  const canEdit=hasSelection&&S.selected.every(c=>writableDate(c.date));
  const tools=host.querySelector('.duty-selection-tools');
  tools.querySelector('[data-s-action="copy"]').disabled=!hasSelection;
  tools.querySelector('[data-s-action="paste"]').disabled=!canEdit||!S.clipboard.length;
  tools.querySelector('[data-s-action="delete"]').disabled=!canEdit;
  tools.querySelector('[data-dropdown-trigger=status]').disabled=!canEdit;
  host.querySelector('[data-s-action="color"]').disabled=!canEdit;
 }
 function timeFields(periods,hasTimes){
  const picker=(name,value)=>`<input type="hidden" name="${name}" value="${value%1440}"><button type="button" class="duty-time-trigger" data-time-picker="${name}" aria-label="${name}, ${M.formatTime(value)}" aria-haspopup="dialog" aria-expanded="false">${M.formatTime(value)}</button>`;
  const row=(p,i)=>`<div class="duty-time-fields"><strong>Shift ${i}</strong><span>IN</span>${picker('Shift '+i+' In',p.start)}<span>OUT</span>${picker('Shift '+i+' Out',p.end)}</div>`;
  return `<label><input type="checkbox" name="hasTimes" ${hasTimes?'checked':''}> Use IN / OUT</label><div data-time-fields ${hasTimes?'':'hidden'}>${row(periods[0]||{start:540,end:1080},1)}<label><input type="checkbox" name="split" ${periods.length===2?'checked':''}> Add second shift</label><div data-split-fields ${periods.length===2?'':'hidden'}>${row(periods[1]||{start:1020,end:1320},2)}</div></div>`;
 }
 function readTimes(fields){
  if(!fields.has('hasTimes'))return [];
  return (fields.has('split')?[1,2]:[1]).map(i=>({start:Number(fields.get('Shift '+i+' In')),end:Number(fields.get('Shift '+i+' Out'))}));
 }
 function wireTimePicker(editor,scale,changed){
  const picker=editor.querySelector('.duty-time-picker');
  let trigger,parts;
  function draw(){
   const groups=[['Hour',Array.from({length:12},(_,i)=>String(i+1))],['Minute',[...new Set(['00','30',parts[1]])].sort()],['AM / PM',['AM','PM']]];
   picker.innerHTML=groups.map(([label,values],i)=>`<div class="duty-time-group duty-time-group-${i}" role="group" aria-label="${label}"><strong>${label}</strong><div class="duty-time-options">${values.map(v=>`<button type="button" data-part="${i}" data-value="${v}" aria-pressed="${parts[i]===v}">${v}</button>`).join('')}</div></div>`).join('')+'<button type="button" class="duty-primary" data-time-done>Done</button>';
  }
  editor.onclick=e=>{
   const button=e.target.closest('[data-time-picker]');if(!button)return;
   if(picker.matches(':popover-open'))picker.hidePopover();
   trigger?.setAttribute('aria-expanded','false');
   trigger=button;parts=M.formatTime(Number(editor.elements[button.dataset.timePicker].value)).split(/[: ]/);
   picker.setAttribute('aria-label',button.dataset.timePicker);
   draw();picker.showPopover();button.setAttribute('aria-expanded','true');
   const rect=button.getBoundingClientRect(),box=picker.getBoundingClientRect();
   picker.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-box.width-8))/scale+'px';
   picker.style.top=Math.max(8,rect.bottom+box.height+8<=window.innerHeight?rect.bottom+4:rect.top-box.height-4)/scale+'px';
   picker.querySelector('[aria-pressed=true]').focus();
  };
  picker.onclick=e=>{
   const button=e.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-time-done')){picker.hidePopover();trigger.focus();return;}
   parts[Number(button.dataset.part)]=button.dataset.value;
   const input=editor.elements[trigger.dataset.timePicker];
   input.value=M.time(parts[0]+':'+parts[1]+' '+parts[2]);
   trigger.textContent=M.formatTime(Number(input.value));trigger.setAttribute('aria-label',trigger.dataset.timePicker+', '+trigger.textContent);
   button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   changed();
  };
  picker.onkeydown=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();picker.hidePopover();trigger.focus();return;}
   if(!e.target.matches('[data-part]'))return;
   const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-1,ArrowDown:1}[e.key];if(!delta)return;
   const buttons=[...e.target.parentElement.querySelectorAll('button')];e.preventDefault();buttons[(buttons.indexOf(e.target)+delta+buttons.length)%buttons.length].focus();
  };
  picker.addEventListener('toggle',()=>{if(!picker.matches(':popover-open'))trigger?.setAttribute('aria-expanded','false');});
 }
 function edit(code,date,forceWork=false){
  if(!writableDate(date))return;
  const before=payload(code,date),revision=entry(code,date)?.revision||0;
  const td=findCell(code,date);
  if(!td)return;
  S.editing={code,date};td.classList.add('duty-editing');updateSelection();
  const editor=document.createElement('form');editor.className='duty-cell-editor';
  editor.setAttribute('aria-label','Edit Duty cell');
  const effective=hoursFor(code,date,before),manualEnabled=canOverride(),initial=M.editorDefaults(before);
  const status=forceWork||before.status==='EMPTY'?'WORK':before.status;
  const longLeave=!['EMPTY','WORK','OFF'].includes(status);
  editor.innerHTML=`<div class="duty-editor-head"><strong>Edit Duty</strong><small>${formatDate(date)}</small></div>
   <label class="duty-editor-status">Status <select name="status">${(longLeave?[status,'WORK','OFF']:['WORK','OFF']).map(k=>`<option value="${k}" ${k===status?'selected':''}>${k==='OTHER_LEAVE'?'Unpaid Leave':M.statuses[k]}</option>`).join('')}</select></label>
   <fieldset class="duty-work-fields" data-work-fields ${status==='WORK'?'':'hidden disabled'}>${timeFields(before.periods,initial.hasTimes)}
   ${manualEnabled?`<fieldset class="duty-allocation"><legend>Hours Calculation</legend><div>${['Auto','Manual'].map(label=>`<label><input type="radio" name="allocation" value="${label.toLowerCase()}" ${initial.allocation===label.toLowerCase()?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>
   <small data-auto-hours aria-live="polite"></small>
   <fieldset class="duty-manual-fields" ${before.manual_minutes?'':'hidden disabled'}><legend>Manual allocation</legend>
    ${Object.entries(M.categories).map(([k,label])=>`<label>${label}<input name="${k}" type="number" min="0" max="24" step="any" value="${effective[k]/60}"></label>`).join('')}
    <small data-hours-difference aria-live="polite"></small></fieldset>`:''}</fieldset>
   <label class="duty-editor-note">Note <input name="note" maxlength="300" value="${esc(before.note)}"></label><span class="duty-cell-error" role="alert"></span><div class="duty-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="duty-primary">Save</button></div>
   <div class="duty-time-picker" popover="auto" role="dialog"></div>`;
  // Keep the editor above the scroll container so edge cells never clip it.
  host.append(editor);
  const rect=td.getBoundingClientRect(),bounds=editor.getBoundingClientRect(),scale=bounds.width/editor.offsetWidth;
  const positionEditor=()=>{editor.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-editor.getBoundingClientRect().height-8))/scale+'px';};
  editor.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-bounds.width-8))/scale+'px';
  positionEditor();
  const finish=()=>{S.editing=null;render();focus(code,date);};
  editor.querySelector('[data-cancel]').onclick=finish;
  const currentAuto=()=>{
   const periods=readTimes(new FormData(editor));
   const p=M.normalize({...before,status:periods.length?'WORK':'EMPTY',periods,manual_minutes:undefined});
   return hoursFor(code,date,p);
  };
  let allocationChanged=false;
  const difference=()=>{
   const output=editor.querySelector('[data-hours-difference]');
   if(!output)return;
   const auto=editor.querySelector('[data-auto-hours]');
   auto.hidden=editor.elements.allocation.value==='manual';
   if(!auto.hidden){
    try{
     const n=currentAuto();
     auto.textContent=Object.entries(categoryLabels).filter(([k])=>n[k]>0).map(([k,label])=>label+' '+M.hours(n[k])+' h').join(' · ');
    }catch{auto.textContent='Check the selected times.';}
    return;
   }
   try{
    const manual=Object.keys(M.categories).reduce((sum,k)=>sum+M.hourMinutes(editor.elements[k].value||'0'),0);
    const duration=currentAuto().total,delta=manual-duration;
    output.textContent=`Total ${M.hours(manual)} h${delta&&editor.elements.hasTimes.checked?' · '+(delta>0?'+':'−')+M.hours(Math.abs(delta))+' h vs IN / OUT':''}`;
   }catch{output.textContent='Check the times and manual hours.';}
  };
  wireTimePicker(editor,scale,difference);
  editor.oninput=e=>{if(Object.hasOwn(M.categories,e.target.name))allocationChanged=true;difference();};
  editor.onchange=e=>{
   if(e.target.name==='status'){
    const work=editor.querySelector('[data-work-fields]');
    work.disabled=work.hidden=e.target.value!=='WORK';
   }
   if(e.target.name==='hasTimes')editor.querySelector('[data-time-fields]').hidden=!e.target.checked;
   if(e.target.name==='split')editor.querySelector('[data-split-fields]').hidden=!e.target.checked;
   if(e.target.name==='allocation'){
    allocationChanged=true;
    const manual=editor.querySelector('.duty-manual-fields'),enabled=e.target.value==='manual';
    manual.disabled=manual.hidden=!enabled;
    if(enabled){
     try{const auto=currentAuto();for(const k of Object.keys(M.categories))editor.elements[k].value=auto[k]/60;}catch{/* Save validates the selected times. */}
    }
   }
   difference();positionEditor();
  };
  difference();
  editor.onkeydown=e=>{if(e.key==='Escape'&&!S.busy){e.preventDefault();e.stopPropagation();finish();}};
  editor.onsubmit=async event=>{
   event.preventDefault();if(S.busy)return;
   const fields=new FormData(editor),button=editor.querySelector('[type=submit]');
   const manual={...before.manual_minutes};
   try{
    let status=fields.get('status');
    const periods=status==='WORK'?readTimes(fields):[];
    if(status!=='WORK'||(manualEnabled&&fields.get('allocation')==='auto')){
     for(const k of Object.keys(manual))delete manual[k];
    }else if(manualEnabled&&(allocationChanged||!before.manual_minutes)){
     for(const k of Object.keys(M.categories))manual[k]=M.hourMinutes(fields.get(k)||'0');
    }
    const workingPending=status==='WORK'&&!periods.length&&!Object.keys(manual).length&&options.demo;
    if(status==='WORK'&&!periods.length&&!Object.keys(manual).length&&!workingPending)throw Error('Enter working times before saving.');
    const next=M.normalize({...before,status,periods,manual_minutes:manual,working_pending:workingPending,note:fields.get('note')});
    button.disabled=true;
    if(await save([{code,date,payload:next,expected_revision:revision}],'Edit Duty cell'))finish();
    else if(editor.isConnected)editor.querySelector('[role=alert]').textContent=S.notice;
   }catch(error){editor.querySelector('[role=alert]').textContent=error.message;}
   finally{button.disabled=false;}
  };
  editor.elements.status.focus();
 }
 async function save(changes,reason,confirmOverwrite=false,record=true){
  if(!writable())return false;
  const version=scopeVersion,config=options;
  S.busy=true;
  try{
   if(changes.some(c=>!writableDateForMonth(c.date)))throw Error('Select dates in the active month.');
   const existing=c=>entry(c.code,c.date);
   const normalized=changes.map(c=>({...c,payload:M.normalize(c.payload),expected_revision:c.expected_revision??existing(c)?.revision??0}));
   if(confirmOverwrite){
    const count=normalized.filter(c=>existing(c)&&existing(c).payload.status!=='EMPTY').length;
    const deleting=confirmOverwrite==='delete';
    if(deleting||count){
     S.confirming=true;
     const message=deleting?`Clear ${normalized.length} selected Duty entries?`:`Replace ${count} populated destination cell${count===1?'':'s'}?`;
     if(!await config.confirm(message,deleting?'Delete':'Replace')){if(version===scopeVersion)S.notice=deleting?'Deletion canceled.':'Replacement canceled.';return false;}
     if(version!==scopeVersion)return false;
     S.confirming=false;
    }
   }
   const before=normalized.map(({code,date})=>({code,date,payload:existing({code,date})?.payload||M.normalize()}));
   const next=await config.save(normalized,reason);
   if(version!==scopeVersion)return false;
   data=next;
   if(record){
    if(normalized.some(c=>localRevisions.has(key(c.code,c.date))&&localRevisions.get(key(c.code,c.date))!==c.expected_revision))clearHistory();
    past.push({before,after:normalized});future.length=0;
    if(past.length>50)past.shift();
   }
   for(const c of normalized)localRevisions.set(key(c.code,c.date),Number(c.expected_revision)+1);
   if(version!==scopeVersion)return false;
   S.notice=`Saved ${normalized.length} cell${normalized.length===1?'':'s'}.`;return true;
  }catch(error){
   if(version===scopeVersion)S.notice=String(error.message).includes('DUTY_CONFLICT')?'Another session changed a destination. Refresh Duty and review before trying again.':error.message;
   return false;
  }finally{
   if(version===scopeVersion){S.busy=false;S.confirming=false;if(!S.editing)render();}
  }
 }
 async function history(redo){
  const source=redo?future:past,destination=redo?past:future,frame=source.at(-1);
  if(!frame)return;
  const changes=(redo?frame.after:frame.before).map(c=>({...c,expected_revision:localRevisions.get(key(c.code,c.date))}));
  if(await save(changes,redo?'Redo schedule edit':'Undo schedule edit',false,false)){source.pop();destination.push(frame);render();}
 }
 function copy(){S.clipboard=S.selected.map(s=>({...s,payload:structuredClone(payload(s.code,s.date))}));S.notice=`Copied ${S.clipboard.length} cell${S.clipboard.length===1?'':'s'}. Select a destination and Paste.`;render();}
 async function paste(){
  const first=S.selected[0],source=S.clipboard;if(!first||!source.length)return;
  if(source.length===1){await save(S.selected.map(c=>({...c,payload:source[0].payload})),'Paste Duty cells');return;}
  const staff=employees(),sourceCodes=[...new Set(source.map(s=>s.code))],base=source.map(s=>s.date).sort()[0],destIndex=staff.findIndex(e=>e.code===first.code);
  const changes=source.map(s=>({code:staff[destIndex+sourceCodes.indexOf(s.code)]?.code,date:M.addDays(first.date,Math.round((Date.parse(s.date)-Date.parse(base))/86400000)),payload:s.payload}));
  const targets=new Set(S.selected.map(c=>key(c.code,c.date)));
  if(changes.some(c=>!c.code||!dates().some(d=>d.date===c.date)||!writableDate(c.date))||
     (targets.size>1&&(targets.size!==changes.length||changes.some(c=>!targets.has(key(c.code,c.date)))))){
   S.notice='Select a top-left cell or a matching rectangle on this staff page.';render();return;
  }
  await save(changes,'Paste schedule range');
 }
 async function deleteSelection(){
  if(!S.selected.length||S.selected.some(c=>!writableDate(c.date)))return;
  const changes=S.selected.filter(c=>{
   const p=payload(c.code,c.date);
   return p.status!=='EMPTY'||p.note||p.highlight||p.basic_limit!==540;
  }).map(c=>({...c,payload:M.normalize()}));
  if(!changes.length){S.notice='Selected cells are already empty.';render();return;}
  await save(changes,'Delete Duty cells',S.selected.length>1?'delete':false);
 }
 function smallPanel(title,body,onSubmit,label){
  return options.panel(title,body,onSubmit,label);
 }
 function color(){
  const targets=S.selected.map(c=>({...c,payload:payload(c.code,c.date),expected_revision:entry(c.code,c.date)?.revision||0}));
  if(!targets.length)return;
  smallPanel('Cell Color',`<label class="duty-field">Color<select name="color">${palette.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`,async fields=>{
   if(!await save(targets.map(c=>({...c,payload:{...c.payload,highlight:fields.get('color')}})),'Set Duty cell color'))throw Error(S.notice||'Selection is read only.');
  });
 }
 function dayType(){
  const initial=S.selected[0]?.date||M.days(S.month)[0].date;
  const form=smallPanel('Calendar settings',`<div class="duty-detail-grid"><label class="duty-field">${options.demo?'From date':'Date'}<input name="from" type="date" required value="${initial}" ${options.demo?'':`min="${S.month}-01" max="${M.days(S.month).at(-1).date}"`}></label>
   ${options.demo?`<label class="duty-field">To date<input name="to" type="date" required value="${initial}"></label>`:''}</div>
   <label class="duty-field">Type<select name="type"><option value="normal">Calendar default</option><option value="holiday">Public holiday</option></select></label>
   ${options.demo?`<label class="duty-field">Holiday name<input name="name" maxlength="80" placeholder="Eid Al-Fitr"></label><label class="duty-field">Note<input name="note" maxlength="300"></label>`:''}`,async fields=>{
   if(!writable())throw Error('Calendar is read only.');
   const from=fields.get('from'),to=fields.get('to')||from,active=fields.get('type')==='holiday',name=fields.get('name')?.trim();
   if(options.demo&&active&&!name)throw Error('Enter a holiday name.');
   data=await options.holiday(M.dateRange(from,to),active,name,fields.get('note')?.trim());render();
  },'Save');
  const sync=()=>{const row=data.holidays.find(h=>h.date===form.elements.from.value);form.elements.type.value=row?.active?'holiday':'normal';if(options.demo){form.elements.name.value=row?.name||'';form.elements.note.value=row?.note||'';}};
  form.elements.from.onchange=()=>{if(options.demo)form.elements.to.value=form.elements.from.value;sync();};sync();
 }
 function hourRules(){
  const rules=data.hour_rules||[];
  const form=smallPanel('Working-hour rules',`<div class="duty-default-hours"><label class="duty-field">Basic Hours<input name="defaultBasic" type="number" min="0" max="24" step="any" value="${(data.default_basic??M.DEFAULT_BASIC)/60}"></label><div class="duty-actions"><button type="button" data-basic-save>Save Default for New Employees</button></div><label class="duty-field">Effective date for existing employees<input type="date" name="effectiveDate" value="${options.today()}" min="${options.today()}"></label><div class="duty-actions"><button type="button" data-basic-bulk>Apply to Existing Employees</button></div><small data-basic-message role="status"></small></div><button type="button" data-rule-add>Add rule</button>
   <div class="duty-rule-list">${rules.map((r,i)=>`<div class="duty-list-row"><span><strong>${esc(r.name)}</strong><small class="duty-code">${esc(r.start.replace('T',' '))} – ${esc(r.end.replace('T',' '))}<br>${r.codes.length?esc(r.codes.map(code=>roster().find(e=>e.code===code)?.name||code).join(', ')):'All employees'} · ${M.hours(r.basic)} h Basic</small></span><button type="button" data-rule-edit="${i}">Edit</button><button type="button" data-rule-delete="${i}">Delete</button></div>`).join('')||'No rules yet.'}</div>`);
  form.onclick=async e=>{
   const button=e.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-basic-save')||button.hasAttribute('data-basic-bulk')){
    const message=form.querySelector('[data-basic-message]');
    try{
     const minutes=M.hourMinutes(form.elements.defaultBasic.value),bulk=button.hasAttribute('data-basic-bulk');
     const timing=form.elements.effectiveDate.value,updates=bulk?options.planBasic(minutes,timing):null;
     if(!bulk){data=options.saveBasic(minutes);message.textContent='Saved for new employees. Existing employees keep their own defaults.';return;}
     const count=updates.length;
     if(!count){message.textContent='No active employee defaults need changing.';return;}
     const scope=updates.map(({employee:e})=>`${e.name} (${e.display_code||e.code})`).join(', ');
     if(!await options.confirm(`Apply ${M.hours(minutes)} h Basic from ${timing} to ${count} active employee${count===1?'':'s'}: ${scope}. Auto hours on or after this date may recalculate. Earlier shifts, Manual allocations, and higher-priority rules are preserved.`,'Apply'))return;
     data=options.saveBasic(minutes,updates);
     message.textContent=`Updated ${count} employee defaults. Effective: ${timing}.`;
    }catch(error){message.textContent=error.message;}
    return;
   }
   if(button.hasAttribute('data-rule-add'))editRule();
   if(button.hasAttribute('data-rule-edit'))editRule(Number(button.dataset.ruleEdit));
   if(button.hasAttribute('data-rule-delete')){
    const i=Number(button.dataset.ruleDelete);
    if(!await options.confirm('Delete '+rules[i].name+'?','Delete'))return;
    data=options.hourRules(rules.filter((_,index)=>index!==i));render();hourRules();
   }
  };
 }
 function editRule(index){
  const rules=data.hour_rules||[],rule=rules[index];
  const start=(rule?.start||S.month+'-01T00:00').split('T'),end=(rule?.end||M.days(S.month).at(-1).date+'T23:59').split('T');
  const form=smallPanel(rule?'Edit hour rule':'Add hour rule',`
   <label class="duty-field">Rule name<input name="name" required maxlength="80" value="${esc(rule?.name||'')}"></label>
   <div class="duty-detail-grid"><label class="duty-field">Start Date<input name="startDate" type="date" required value="${start[0]}"></label><label class="duty-field">Start Time<input name="startTime" type="time" required value="${start[1]}"></label></div>
   <div class="duty-detail-grid"><label class="duty-field">End Date<input name="endDate" type="date" required value="${end[0]}"></label><label class="duty-field">End Time<input name="endTime" type="time" required value="${end[1]}"></label></div>
   <label class="duty-field">Apply To<select name="scope"><option value="all">All employees</option><option value="selected" ${rule?.codes.length?'selected':''}>Selected employees</option></select></label>
   <fieldset data-rule-staff ${rule?.codes.length?'':'hidden'}><legend>Employees</legend>${roster().map(e=>`<label><input type="checkbox" name="employee" value="${esc(e.code)}" ${rule?.codes.includes(e.code)?'checked':''}> ${esc(e.name)}</label>`).join('')}</fieldset>
   <label class="duty-field">Basic Hours<input name="basic" required type="number" min="0" max="24" step="any" value="${(rule?.basic??420)/60}"></label>`,async fields=>{
   const name=fields.get('name').trim(),start=fields.get('startDate')+'T'+fields.get('startTime'),end=fields.get('endDate')+'T'+fields.get('endTime');
   const codes=fields.get('scope')==='all'?[]:fields.getAll('employee');
   if(!name||start>end||(fields.get('scope')==='selected'&&!codes.length))throw Error('Enter a valid interval and choose at least one employee for a selected scope.');
   data=options.hourRules([...rules.filter((_,i)=>i!==index),{name,start,end,codes,basic:M.hourMinutes(fields.get('basic'))}]);
   render();hourRules();
  },'Save');
  form.querySelector('[name="scope"]').onchange=e=>{form.querySelector('[data-rule-staff]').hidden=e.target.value==='all';};
 }
 function dropdown(id,label,text,items,selection){
  const multiple=selection instanceof Set;
  const itemMarkup=items.map(([value,name])=>multiple
   ?`<label class="duty-dropdown-option"><input type="checkbox" value="${esc(value)}" ${selection.has(value)?'checked':''}> ${esc(name)}</label>`
   :`<button type="button" class="duty-dropdown-option" data-dropdown-value="${esc(value)}" ${selection===undefined?'':`aria-pressed="${selection===value}"`}>${esc(name)}</button>`).join('');
  return `<div class="duty-dropdown"><button type="button" class="duty-dropdown-trigger" data-dropdown-trigger="${id}" popovertarget="duty-dropdown-${id}" aria-haspopup="dialog" aria-label="${esc(label+(id==='staff'?': '+text:''))}">${esc(text)}</button>
   <div class="duty-dropdown-popup" popover="auto" id="duty-dropdown-${id}" role="dialog" aria-label="${esc(label)}">${itemMarkup||'No employees'}${multiple&&options.demo?'<button type="button" data-save-custom>Save as Default Custom View</button>':''}</div></div>`;
 }
 function wireDropdowns(){
  for(const popup of host.querySelectorAll('.duty-dropdown-popup')){
   const trigger=popup.previousElementSibling,id=trigger.dataset.dropdownTrigger;
   const controls=()=>[...popup.querySelectorAll('button,input')];
   popup.addEventListener('toggle',()=>{
    if(!popup.matches(':popover-open'))return;
    const rect=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect(),scale=box.width/popup.offsetWidth;
    popup.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-box.width-8))/scale+'px';
    popup.style.top=Math.max(8,rect.bottom+box.height+8<=window.innerHeight?rect.bottom+4:rect.top-box.height-4)/scale+'px';
    if(!popup.contains(document.activeElement))(popup.querySelector('[aria-pressed=true]')||controls()[0])?.focus();
   });
   popup.onkeydown=e=>{
    const items=controls(),index=items.indexOf(e.target);
    const next={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:items.length-1}[e.key];
    if(next===undefined||!items.length)return;
    e.preventDefault();items[(next+items.length)%items.length].focus();
   };
   popup.onclick=async e=>{
    const button=e.target.closest('button');if(!button)return;
    popup.hidePopover();
    if(button.hasAttribute('data-save-custom')){
     options.saveCustom([...S.custom]);S.notice='Default Custom View saved for this demo session.';render();
    }else if(id==='staff'){
     S.group=button.dataset.dropdownValue;
     if(S.group==='custom'&&options.demo){const saved=options.loadCustom();if(saved)S.custom=new Set(saved);}
     S.staffPage=0;clearSelection();render();
    }else await applyStatus(button.dataset.dropdownValue);
    host.querySelector(`[data-dropdown-trigger="${id}"]:not(:disabled)`)?.focus();
   };
   if(id==='custom')popup.onchange=e=>{
    const {value,checked}=e.target;
    if(checked)S.custom.add(value);else S.custom.delete(value);
    S.staffPage=0;clearSelection();render();
    const replacement=host.querySelector('#duty-dropdown-custom');
    replacement.showPopover({source:replacement.previousElementSibling});
    [...replacement.querySelectorAll('input')].find(input=>input.value===value)?.focus();
   };
  }
 }
 function bind(){
  host.onclick=async event=>{
   if(event.target.closest('.duty-cell-editor,.duty-date-range,.duty-dropdown,select'))return;
   if(S.editing||S.busy||S.confirming)return;
   try{
    const button=event.target.closest('button'),cellEl=event.target.closest('[data-s-code]'),row=event.target.closest('[data-s-column]');
    if(row){if(!skipClick){selectRows(row.dataset.sColumn,event.shiftKey,event.ctrlKey||event.metaKey);focusSelection();}return;}
    if(cellEl){
     if(skipClick)return;
     const {sCode:code,sDate:date}=cellEl.dataset;
     select(code,date,event.shiftKey);focusSelection();return;
    }
    switch(button?.dataset.sAction){
     case 'copy':copy();break;
     case 'paste':await paste();break;
     case 'delete':await deleteSelection();break;
     case 'undo':await history(false);break;
     case 'redo':await history(true);break;
     case 'staff-back':case 'staff-next':S.staffPage+=button.dataset.sAction==='staff-back'?-1:1;clearSelection();render();break;
     case 'color':color();break;
     case 'full-month':S.range=null;clearSelection();render();break;
    }
    if(!document.activeElement?.closest('[role=dialog]'))focusSelection();
   }catch(error){S.notice=error.message||'Duty action could not be completed.';render();}
  };
  host.ondblclick=event=>{
   const td=event.target.closest('[data-s-code]');
   if(!td||S.editing||S.busy||S.confirming||skipClick||event.shiftKey||event.ctrlKey||event.metaKey)return;
   const {sCode:code,sDate:date}=td.dataset;
   select(code,date,false);edit(code,date);
  };
  const grid=host.querySelector('.duty-grid-scroll');
  const dragTarget=(x,y)=>document.elementFromPoint(x,y)?.closest(drag.row?'tbody tr':'[data-s-code]');
  const extendDrag=target=>{
   if(!target||!grid.contains(target)||target===drag.last)return;
   drag.last=target;
   if(drag.row)selectRows(target.querySelector('[data-s-column]').dataset.sColumn,true);
   else select(target.dataset.sCode,target.dataset.sDate,true);
  };
  const scrollDrag=()=>{
   if(!drag?.moved)return;
   const bounds=grid.getBoundingClientRect(),head=grid.querySelector('thead th').getBoundingClientRect();
   const top=Math.max(bounds.top,head.bottom),bottom=bounds.top+grid.clientHeight*(bounds.width/grid.offsetWidth);
   const left=drag.row?bounds.left:grid.querySelector('tbody th').getBoundingClientRect().right;
   const right=bounds.left+grid.clientWidth*(bounds.width/grid.offsetWidth);
   const speed=(point,min,max)=>point<min+28?-Math.min(24,(min+28-point)*0.45):point>max-28?Math.min(24,(point-max+28)*0.45):0;
   const dx=drag.row?0:speed(drag.x,left,right),dy=speed(drag.y,top,bottom);
   if(dx||dy){
    grid.scrollBy(dx,dy);
    extendDrag(dragTarget(Math.max(left+2,Math.min(right-3,drag.x)),Math.max(top+2,Math.min(bottom-3,drag.y))));
   }
   drag.frame=requestAnimationFrame(scrollDrag);
  };
  host.onpointerdown=event=>{
   skipClick=false;
   const dateButton=event.target.closest('[data-s-column]'),target=dateButton?.closest('tr')||event.target.closest('[data-s-code]');
   if(!target||event.button!==0||event.pointerType!=='mouse'||S.editing||S.busy||S.confirming)return;
   drag={id:event.pointerId,start:target,last:target,row:!!dateButton,moved:false,x:event.clientX,y:event.clientY};
  };
  const finishDrag=event=>{
   if(!drag||drag.id!==event.pointerId)return;
   skipClick=drag.moved;
   if(drag.frame)cancelAnimationFrame(drag.frame);
   drag=null;
   if(skipClick)focusSelection();
  };
  host.onpointermove=event=>{
   if(!drag||drag.id!==event.pointerId)return;
   if(!(event.buttons&1)){finishDrag(event);return;}
   drag.x=event.clientX;drag.y=event.clientY;
   const target=dragTarget(drag.x,drag.y);
   if(!drag.moved){
    if(!target||target===drag.start||!grid.contains(target))return;
    drag.moved=true;host.setPointerCapture(event.pointerId);
    if(drag.row)selectRows(drag.start.querySelector('[data-s-column]').dataset.sColumn);
    else select(drag.start.dataset.sCode,drag.start.dataset.sDate,false);
    drag.frame=requestAnimationFrame(scrollDrag);
   }
   extendDrag(target);
  };
  host.onpointerup=host.onpointercancel=host.onlostpointercapture=finishDrag;
  host.onpointerleave=()=>{if(drag&&!drag.moved)drag=null;};
  host.ondragstart=event=>{if(event.target.closest('[data-s-code],[data-s-column]'))event.preventDefault();};
  host.onsubmit=e=>{
   if(!e.target.matches('[data-date-range]'))return;
   e.preventDefault();
   const fields=new FormData(e.target),from=fields.get('from'),to=fields.get('to');
   if(!writableDateForMonth(from)||!writableDateForMonth(to)||from>to){S.notice='Choose dates within the selected month in order.';render();return;}
   S.range={from,to};S.notice='';clearSelection();render();
  };
  wireDropdowns();bindKeyboard();
 }
 async function applyStatus(status){
   if(status==='WORK'&&!options.demo){
    const target=S.selected.length===1?S.selected[0]:null;
    if(target){edit(target.code,target.date,true);return;}
    S.notice='Working needs hours. Open each cell to enter times.';render();return;
   }
   const changes=S.selected.filter(c=>writableDate(c.date)).map(c=>{
    const before=payload(c.code,c.date);
    return {...c,payload:status==='EMPTY'?M.normalize():status==='WORK'?{...before,status,working_pending:true}:{...before,status,periods:[],manual_minutes:undefined,working_pending:false}};
   });
   if(changes.length)await save(changes,'Set Duty status');
   render();focusSelection();
 }
 function bindKeyboard(){
  const fromSchedule=e=>!S.editing&&!S.busy&&!S.confirming&&!e.target.closest('input,select,textarea,[contenteditable],.duty-dropdown');
  host.oncopy=e=>{
   if(!fromSchedule(e)||!S.selected.length)return;
   e.preventDefault();copy();
   focusSelection();
  };
  host.onpaste=async e=>{
   if(!fromSchedule(e)||!S.selected.length||!S.clipboard.length)return;
   e.preventDefault();await paste();
   focusSelection();
  };
  host.onkeydown=async e=>{
   if(!fromSchedule(e))return;
   const k=/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():e.key.toLowerCase();
   if((e.ctrlKey||e.metaKey)&&['c','v','z','y'].includes(k)){
    e.preventDefault();
    if(k==='c'&&S.selected.length)copy();
    if(k==='v')await paste();
    if(k==='z'||k==='y')await history(k==='y'||e.shiftKey);
    focusSelection();
    return;
   }
   const cellEl=e.target.closest('[data-s-code]');if(!cellEl)return;
   if(e.key==='Delete'){e.preventDefault();if(!S.selected.length)select(cellEl.dataset.sCode,cellEl.dataset.sDate,false);await deleteSelection();focusSelection();return;}
   if(e.key==='Escape'){clearSelection();updateSelection();return;}
   const {sCode:code,sDate:date}=cellEl.dataset;
   if(e.key==='Enter'||e.key==='F2'){e.preventDefault();select(code,date,false);edit(code,date);return;}
   const staff=employees(),days=dates(),x=staff.findIndex(v=>v.code===code),y=days.findIndex(v=>v.date===date);
   const offset={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
   if(!offset)return;
   const next=staff[x+offset[0]]?.code,nextDate=days[y+offset[1]]?.date;
   if(next&&nextDate){e.preventDefault();select(next,nextDate,e.shiftKey);focus(next,nextDate,true);}
  };
 }
 window.DutySchedule={mount,calendar:dayType,rules(d,config){host=null;data=d;options=config;S.month=config.month;hourRules();},isEditing:()=>!!S.editing||S.busy||S.confirming||!!drag?.moved,clear(keepClipboard=false){
  if(drag?.frame)cancelAnimationFrame(drag.frame);
  drag=null;skipClick=false;scopeVersion++;clearHistory();
  if(!keepClipboard){S.clipboard=[];S.custom.clear();S.staffPage=0;S.group='pharmacists';S.range=null;}
  Object.assign(S,{range:null,editing:null,selected:[],anchor:null,cursor:null,month:'',notice:'',busy:false,confirming:false});
 }};
})();
