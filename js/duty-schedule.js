/* Duty-only scheduler. All persisted writes pass through scoped, versioned RPCs. */
(function(){
 'use strict';
 const M=window.DutyModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S={mode:31,staffSize:6,staffPage:0,support:new Set(),start:0,month:'',selected:[],anchor:null,cursor:null,clipboard:[],busy:false,confirming:false,notice:'',editing:null};
 let host,data,options,scopeVersion=0,periodVersion=0,drag=null,skipClick=false;
 const palette=[['blue','Blue'],['mint','Mint'],['violet','Violet'],['rose','Rose'],['','Clear Color']];
 const adjacent=new Map(),past=[],future=[],localRevisions=new Map();
 const monthData=date=>date.slice(0,7)===S.month?data:adjacent.get(date.slice(0,7));
 const canOverride=()=>options.demo||data.manual_hours===true;
 const categoryLabels={...M.categories,basic:'Basic',total:'Total'};
 const formatDate=date=>new Date(date+'T12:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
 const clearHistory=()=>{past.length=0;future.length=0;localRevisions.clear();};
 const key=(code,date)=>code+'|'+date;
 const entry=(code,date)=>monthData(date)?.entries?.find(e=>e.code===code&&e.date===date);
 const payload=(code,date)=>entry(code,date)?.payload||M.normalize();
 function roster(){
  const history=data.entries||[],all=data.employees.filter(e=>e.active||history.some(x=>x.code===e.code&&x.payload.status!=='EMPTY'));
  return all.map(e=>{const h=history.find(x=>x.code===e.code);return h?{...e,...h.identity}:e;});
 }
 const staffList=()=>roster().filter(e=>e.position_key==='pharmacist'||S.support.has(e.code)).sort((a,b)=>Number(b.position_key==='pharmacist')-Number(a.position_key==='pharmacist'));
 const employees=()=>staffList().slice(S.staffPage*S.staffSize,(S.staffPage+1)*S.staffSize);
 const basic=(code,date,p)=>M.basicAllowance(date,p,monthData(date)?.employees?.find(e=>e.code===code),monthData(date)?.hour_rules);
 const dates=()=>M.calendarPeriod(S.month,S.start,S.mode);
 const selected=(code,date)=>S.selected.some(s=>s.code===code&&s.date===date);
 const writable=()=>data.can_write&&!S.busy&&!S.confirming&&!options.loading&&data.month?.status!=='Completed';
 const writableDate=date=>writable()&&!!monthData(date)?.can_write&&monthData(date).month?.status!=='Completed';
 const holiday=date=>monthData(date)?.holidays?.find(h=>h.date===date&&h.active);
 function mount(el,d,config){
  host=el;data={entries:[],holidays:[],...d};options=config;
  if(S.month!==config.month){S.month=config.month;S.start=0;clearSelection();S.editing=null;S.notice='';}
  render();if(!options.loading&&employees().length)loadBoundary();
 }
 async function loadBoundary(){
  const version=++periodVersion;
  const months=[...new Set(dates().map(d=>d.date.slice(0,7)))].filter(m=>m!==S.month);
  try{
   const snapshots=await Promise.all(months.map(async month=>[month,await options.readMonth(month)]));
   if(version!==periodVersion||!host?.isConnected||S.editing||S.confirming||S.busy||drag?.moved)return;
   for(const [month,snapshot] of snapshots)adjacent.set(month,snapshot);
   if(snapshots.length){const focused=document.activeElement?.closest('[data-s-code]');render();if(focused)focus(focused.dataset.sCode,focused.dataset.sDate);}
  }catch(error){
   if(version===periodVersion&&host?.isConnected){S.notice='Adjacent dates could not be loaded. '+error.message;render();}
  }
 }
 function clearSelection(){S.selected=[];S.anchor=null;S.cursor=null;}
 function render(){
  if(!host?.isConnected)return;
  const scroll=host.querySelector('.duty-grid-scroll'),scrollPosition={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
  const days=dates(),count=staffList().length,pages=Math.max(1,Math.ceil(count/S.staffSize));
  S.staffPage=Math.min(S.staffPage,pages-1);
  const staff=employees(),totals=M.totals(data.entries,data.holidays,data.employees,data.hour_rules);
  const support=roster().filter(e=>e.position_key!=='pharmacist');
  const next=days.at(-1).date<M.days(S.month).at(-1).date;
  host.innerHTML=`<div class="duty-schedule-controls">
   <details class="duty-staff-filter"><summary>Staff${S.support.size?' · +'+S.support.size:''}</summary><div>${support.map(e=>`<label><input type="checkbox" data-s-support="${esc(e.code)}" ${S.support.has(e.code)?'checked':''}> ${esc(e.name)}</label>`).join('')||'Pharmacists only'}</div></details>
   <label class="duty-staff-size">Columns <select id="duty-staff-size">${[2,4,6].map(n=>`<option ${S.staffSize===n?'selected':''}>${n}</option>`).join('')}</select></label>
   <div class="duty-period" aria-label="Staff pages"><button type="button" data-s-action="staff-back" aria-label="Previous staff page" ${S.staffPage?'':'disabled'}>‹</button><span>${S.staffPage+1}/${pages}</span><button type="button" data-s-action="staff-next" aria-label="Next staff page" ${S.staffPage+1<pages?'':'disabled'}>›</button></div>
   <div class="duty-period"><button type="button" data-s-action="back" aria-label="Previous period" ${!S.start||S.mode===31?'disabled':''}>‹</button><strong>${formatDate(days[0].date)} – ${formatDate(days.at(-1).date)}</strong><button type="button" data-s-action="forward" aria-label="Next period" ${!next||S.mode===31?'disabled':''}>›</button></div>
   <div class="duty-segment" role="group" aria-label="Calendar view">${[[31,'Month'],[14,'2 Weeks'],[7,'Week']].map(([n,label])=>`<button type="button" data-s-mode="${n}" aria-pressed="${S.mode===n}">${label}</button>`).join('')}</div>
   <div class="duty-actions duty-selection-tools" role="group" aria-label="Schedule actions">
   <button type="button" data-s-action="copy">Copy</button><button type="button" data-s-action="paste">Paste</button><button type="button" data-s-action="delete">Delete</button>
   <button type="button" data-s-action="undo" title="Ctrl+Z" ${!past.length||!writable()?'disabled':''}>↶ Undo</button><button type="button" data-s-action="redo" title="Ctrl+Y" ${!future.length||!writable()?'disabled':''}>↷ Redo</button>
   <button type="button" data-s-action="details">Details</button><select aria-label="Apply status to selection" id="duty-apply-status"><option value="">Status…</option>${Object.entries(M.statuses).filter(([k])=>k!=='WORK').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
   <button type="button" data-s-action="color">Cell Color</button><button type="button" data-s-action="day">Day Type</button>${options.demo?`<button type="button" data-s-action="rules">Hour Rules</button>`:''}</div>
   <div class="duty-grid-scroll duty-vertical ${S.mode===7?'duty-week-height':''}" role="region" aria-label="Duty schedule"><table aria-label="Duty schedule" style="min-width:${78+staff.length*148}px">
    <colgroup><col style="width:78px">${staff.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col" class="duty-date-heading">Calendar <small>Monthly totals · h</small></th>
    ${staff.map(e=>`<th scope="col"><div class="duty-staff-card"><span class="duty-name">${esc(e.name)}</span><span class="duty-code">${esc(e.code)}${e.active?'':' · inactive'}</span><div class="duty-kpi-wrap"><div class="duty-mini-kpis">${Object.entries(categoryLabels).map(([k,label])=>`<span class="duty-category-${k}">${label} <b>${M.hours(totals[e.code]?.[k]||0)}</b></span>`).join('')}</div></div></div></th>`).join('')}</tr></thead>
    <tbody>${staff.length?days.map(d=>`<tr class="${d.friday?'duty-friday-row':holiday(d.date)?'duty-holiday-row':''}"><th scope="row"><button class="duty-date-button" type="button" data-s-column="${d.date}" aria-label="Select ${d.date}"><strong>${formatDate(d.date)}</strong><span>${new Date(d.date+'T12:00Z').toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'})}</span>${holiday(d.date)?`<small>${esc(holiday(d.date).name||'Holiday')}</small>`:''}</button></th>${staff.map(e=>cell(e,d)).join('')}</tr>`).join(''):'<tr><td class="duty-empty">No employees in this view</td></tr>'}</tbody></table></div>
   <div class="duty-footnote"><span role="status">${esc(S.notice||(!canOverride()?'Manual hours and hour-rule settings are available in the synthetic preview pending database approval.':'Double-click to edit · Drag to select a range'))}</span></div>`;
  const grid=host.querySelector('.duty-grid-scroll');
  grid.scrollTo?.(scrollPosition);
  bind();updateSelection();
 }
 function cell(e,d){
  const p=payload(e.code,d.date),n=M.calculate(d.date,p,!!holiday(d.date),basic(e.code,d.date,p));
  const times=p.periods.map(t=>`<span class="duty-time-period">${M.formatTime(t.start)} – ${M.formatTime(t.end)}</span>`).join('');
  const categories=Object.entries(categoryLabels).filter(([k])=>k!=='total'&&n[k]>0).map(([k,label])=>{
   const manual=Object.hasOwn(p.manual_minutes||{},k);
   return `<span data-s-hours="${k}" class="duty-category-${k} ${manual?'duty-manual':''}">${label} <b>${M.hours(n[k])}</b></span>`;
  }).join('');
  const status=p.status!=='WORK'&&p.status!=='EMPTY'?M.statuses[p.status]:'';
  return `<td tabindex="-1" aria-label="${esc(e.name)}, ${d.date}, ${esc(M.text(p)||(categories?'Hours only':'Empty'))}${p.note?', note: '+esc(p.note):''}" data-s-code="${esc(e.code)}" data-s-date="${d.date}" class="duty-cell ${p.highlight?'duty-mark-'+p.highlight:''}">
   ${times?`<div data-s-time class="duty-cell-time ${p.periods.length===2?'duty-split':''}">${times}</div>`:status?`<span class="duty-cell-status">${status}</span>`:''}
   ${p.note?'<span class="duty-note-dot" aria-hidden="true">•</span>':''}
   ${categories?`<div class="duty-cell-categories">${categories}</div>`:''}</td>`;
 }
 function select(code,date,range){
  if(range&&S.anchor){const staff=employees(),ds=dates(),a=staff.findIndex(e=>e.code===S.anchor.code),b=staff.findIndex(e=>e.code===code),x=ds.findIndex(d=>d.date===S.anchor.date),y=ds.findIndex(d=>d.date===date);if(a<0||b<0)return;S.selected=[];for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(x,y);j<=Math.max(x,y);j++)S.selected.push({code:staff[i].code,date:ds[j].date});}
  else {S.selected=[{code,date}];S.anchor={code,date};}
  S.cursor={code,date};updateSelection();
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
  tools.querySelector('[data-s-action="details"]').disabled=!hasSelection;
  tools.querySelector('select').disabled=!canEdit;
  host.querySelector('[data-s-action="color"]').disabled=!canEdit;
  host.querySelector('[data-s-action="day"]').disabled=!canEdit||new Set(S.selected.map(c=>c.date)).size!==1;
 }
 function dropdowns(prefix,value){
  const [hour,minute,meridiem]=M.formatTime(value).split(/[: ]/);
  const select=(name,values,current)=>`<select name="${prefix}-${name}" aria-label="${prefix} ${name}">${values.map(v=>`<option ${String(v)===current?'selected':''}>${v}</option>`).join('')}</select>`;
  const minutes=[...new Set(['00','30',minute])].sort();
  return select('Hour',Array.from({length:12},(_,i)=>i+1),hour)+select('Minutes',minutes,minute)+select('AM-PM',['AM','PM'],meridiem);
 }
 function timeFields(periods){
  const row=(label,p,i)=>`<div class="duty-time-fields" data-period="${i}"><strong>${label}</strong><span>In</span>${dropdowns('Shift '+i+' In',p.start)}<span>Out</span>${dropdowns('Shift '+i+' Out',p.end)}</div>`;
  return `<label><input type="checkbox" name="hasTimes" ${periods.length?'checked':''}> Use IN / OUT</label><div data-time-fields ${periods.length?'':'hidden'}>${row('Shift 1',periods[0]||{start:540,end:1080},1)}<label><input type="checkbox" name="split" ${periods.length===2?'checked':''}> Add second shift</label><div data-split-fields ${periods.length===2?'':'hidden'}>${row('Shift 2',periods[1]||{start:1020,end:1320},2)}</div></div>`;
 }
 function readTimes(fields){
  if(!fields.has('hasTimes'))return [];
  const time=prefix=>M.time(`${fields.get(prefix+'-Hour')}:${fields.get(prefix+'-Minutes')} ${fields.get(prefix+'-AM-PM')}`);
  return (fields.has('split')?[1,2]:[1]).map(i=>({start:time('Shift '+i+' In'),end:time('Shift '+i+' Out')}));
 }
 function edit(code,date){
  if(!writableDate(date))return;
  const before=payload(code,date),revision=entry(code,date)?.revision||0;
  const td=findCell(code,date);
  if(!td)return;
  S.editing={code,date};td.classList.add('duty-editing');updateSelection();
  const editor=document.createElement('form');editor.className='duty-cell-editor';
  editor.setAttribute('aria-label','Edit Duty cell');
  const auto=M.calculate(date,{...before,status:before.periods.length?'WORK':'EMPTY',manual_minutes:undefined},!!holiday(date),basic(code,date,before));
  const manualEnabled=canOverride();
  const defaultTimes=before.periods.length||before.manual_minutes?before.periods:[{start:540,end:1080}];
  const status=before.status==='EMPTY'?'WORK':before.status;
  editor.innerHTML=`<div class="duty-editor-head"><strong>Edit Duty</strong><small>${formatDate(date)}</small></div>
   <label class="duty-editor-status">Status <select name="status">${Object.entries(M.statuses).map(([k,v])=>`<option value="${k}" ${k===status?'selected':''}>${v}</option>`).join('')}</select></label>
   <fieldset class="duty-work-fields" data-work-fields ${status==='WORK'?'':'hidden disabled'}>${timeFields(defaultTimes)}
   ${manualEnabled?`<fieldset class="duty-manual-fields"><legend>Manual hours</legend>
    ${Object.entries(M.categories).map(([k,label])=>`<label>${label}<input name="${k}" type="number" min="0" max="24" step="any" placeholder="Auto ${M.hours(auto[k])}" value="${Object.hasOwn(before.manual_minutes||{},k)?before.manual_minutes[k]/60:''}"></label>`).join('')}
    <small>Leave blank to calculate automatically.</small></fieldset>`:''}</fieldset>
   <label class="duty-editor-note">Note <input name="note" maxlength="300" value="${esc(before.note)}"></label><span class="duty-cell-error" role="alert"></span><div class="duty-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="duty-primary">Save</button></div>`;
  // Keep the editor above the scroll container so edge cells never clip it.
  host.append(editor);
  const rect=td.getBoundingClientRect(),bounds=editor.getBoundingClientRect(),scale=bounds.width/editor.offsetWidth;
  const positionEditor=()=>{editor.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-editor.getBoundingClientRect().height-8))/scale+'px';};
  editor.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-bounds.width-8))/scale+'px';
  positionEditor();
  const finish=()=>{S.editing=null;render();focus(code,date);if(dates().some(d=>!monthData(d.date)))loadBoundary();};
  editor.querySelector('[data-cancel]').onclick=finish;
  editor.onchange=e=>{
   if(e.target.name==='status'){
    const work=editor.querySelector('[data-work-fields]');
    work.disabled=work.hidden=e.target.value!=='WORK';
   }
   if(e.target.name==='hasTimes')editor.querySelector('[data-time-fields]').hidden=!e.target.checked;
   if(e.target.name==='split')editor.querySelector('[data-split-fields]').hidden=!e.target.checked;
   positionEditor();
  };
  editor.onkeydown=e=>{if(e.key==='Escape'&&!S.busy){e.preventDefault();e.stopPropagation();finish();}};
  editor.onsubmit=async event=>{
   event.preventDefault();if(S.busy)return;
   const fields=new FormData(editor),button=editor.querySelector('[type=submit]');
   const manual={...before.manual_minutes};
   try{
    let status=fields.get('status');
    const periods=status==='WORK'?readTimes(fields):[];
    if(status!=='WORK'){
     for(const k of Object.keys(manual))delete manual[k];
    }else if(manualEnabled){
     for(const k of Object.keys(M.categories)){
      const value=fields.get(k);
      if(value===''){delete manual[k];continue;}
      manual[k]=M.hourMinutes(value);
     }
    }
    if(status==='WORK'&&!periods.length&&!Object.keys(manual).length)status='EMPTY';
    const next=M.normalize({...before,status,periods,manual_minutes:manual,note:fields.get('note')});
    button.disabled=true;
    if(await save([{code,date,payload:next,expected_revision:revision}],'Edit Duty cell'))finish();
    else if(editor.isConnected)editor.querySelector('[role=alert]').textContent=S.notice;
   }catch(error){editor.querySelector('[role=alert]').textContent=error.message;}
   finally{button.disabled=false;}
  };
  editor.querySelector('input[name=hours], select, input[name=hasTimes]')?.focus();
 }
 async function save(changes,reason,confirmOverwrite=false,record=true){
  if(!writable())return false;
  const version=scopeVersion,config=options;
  S.busy=true;
  try{
   const snapshots=new Map([[S.month,data],...adjacent]);
   for(const month of new Set(changes.map(c=>c.date.slice(0,7))))if(!snapshots.has(month))snapshots.set(month,await config.readMonth(month));
   if(version!==scopeVersion)return false;
   const existing=c=>snapshots.get(c.date.slice(0,7))?.entries?.find(e=>e.code===c.code&&e.date===c.date);
   const normalized=changes.map(c=>({...c,payload:M.normalize(c.payload),expected_revision:c.expected_revision??existing(c)?.revision??0}));
   if(normalized.some(c=>snapshots.get(c.date.slice(0,7))?.month?.status==='Completed'))throw Error('A destination month is completed.');
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
   for(const month of new Set(normalized.map(c=>c.date.slice(0,7))))if(month!==S.month){
    adjacent.delete(month);
    try{const snapshot=await config.readMonth(month);if(version===scopeVersion)adjacent.set(month,snapshot);}catch{ /* Reload when this period opens again. */ }
   }
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
 function copy(){if(S.selected.some(c=>!monthData(c.date))){S.notice='Wait for adjacent dates to load before copying.';render();return;}S.clipboard=S.selected.map(s=>({...s,payload:structuredClone(payload(s.code,s.date))}));S.notice=`Copied ${S.clipboard.length} cell${S.clipboard.length===1?'':'s'}. Select a destination and Paste.`;render();}
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
 function smallPanel(title,body,onSubmit){
  return options.panel(title,body,onSubmit);
 }
 function details(){
  const selection=[...S.selected],first=selection[0];if(!first)return;
  const p=payload(first.code,first.date),datesSelected=selection.map(c=>c.date).sort();
  const opening=new Map([data,...adjacent.values()].flatMap(d=>d.entries||[]).map(e=>[key(e.code,e.date),e]));
  smallPanel(selection.length===1?`${first.code} · ${first.date}`:`${selection.length} selected cells`,
   `<label class="duty-field">Status<select name="status"><option value="">Keep existing</option>${Object.entries(M.statuses).filter(([k])=>k!=='WORK').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="duty-field">Note<textarea name="note" maxlength="300" rows="2">${esc(p.note)}</textarea></label>
    <div class="duty-detail-grid"><label class="duty-field">From<input name="from" type="date" value="${datesSelected[0]}" required></label><label class="duty-field">Through<input name="through" type="date" value="${datesSelected.at(-1)}" required></label></div>`,async fields=>{
    const from=String(fields.get('from')),through=String(fields.get('through')),status=fields.get('status');
    const span=Math.round((Date.parse(through)-Date.parse(from))/86400000)+1,codes=[...new Set(selection.map(c=>c.code))];
    if(!Number.isFinite(span)||span<1||span>366||span*codes.length>1000)throw Error('Choose a valid range of up to 1000 employee/day cells.');
    const snapshots=new Map();
    for(let i=0;i<span;i++){
     const date=M.addDays(from,i),month=date.slice(0,7);
     if(!monthData(date)&&!snapshots.has(month))snapshots.set(month,await options.readMonth(month));
    }
    const changes=codes.flatMap(code=>Array.from({length:span},(_,i)=>{
     const date=M.addDays(from,i),row=opening.get(key(code,date))||snapshots.get(date.slice(0,7))?.entries.find(e=>e.code===code&&e.date===date);
     const prior=row?.payload||M.normalize();
     const next={...prior,note:fields.get('note')};
     if(status)Object.assign(next,{status,periods:[],manual_minutes:undefined});
     return {code,date,payload:next,expected_revision:row?.revision||0};
    }));
    if(!await save(changes,'Duty details / leave / note',changes.length>1||!!status))throw Error(S.notice||'No changes saved.');
   });
 }
 function color(){
  const targets=S.selected.map(c=>({...c,payload:payload(c.code,c.date),expected_revision:entry(c.code,c.date)?.revision||0}));
  if(!targets.length)return;
  smallPanel('Cell Color',`<label class="duty-field">Color<select name="color">${palette.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`,async fields=>{
   if(!await save(targets.map(c=>({...c,payload:{...c.payload,highlight:fields.get('color')}})),'Set Duty cell color'))throw Error(S.notice||'Selection is read only.');
  });
 }
 function dayType(){
  const date=S.selected[0]?.date;if(!date||!writableDate(date))return;
  const previous=monthData(date).holidays.find(h=>h.date===date);
  smallPanel('Day Type · '+formatDate(date),`<label class="duty-field">Type<select name="type"><option value="normal">${new Date(date+'T12:00Z').getUTCDay()===5?'Friday':'Regular day'}</option><option value="holiday" ${previous?.active?'selected':''}>Public holiday</option></select></label>
   ${options.demo?`<label class="duty-field">Occasion<input name="name" maxlength="80" placeholder="Eid Al-Fitr" value="${esc(previous?.name||'')}"></label><label class="duty-field">Note<input name="note" maxlength="300" value="${esc(previous?.note||'')}"></label>`:''}`,async fields=>{
   data=await options.holiday(date,fields.get('type')==='holiday',previous?.revision||0,fields.get('name')?.trim(),fields.get('note')?.trim());await loadBoundary();render();
  });
 }
 function hourRules(){
  const rules=data.hour_rules||[];
  const form=smallPanel('Working-hour rules',`<label class="duty-field">Rule<select name="rule"><option value="">Add a rule</option>${rules.map((r,i)=>`<option value="${i}">${esc(r.name)} · ${r.from}–${r.through}${r.code?' · '+esc(r.code):''}</option>`).join('')}</select></label>
   <label class="duty-field">Name<input name="name" maxlength="80" placeholder="Ramadan"></label>
   <label class="duty-field">Employee<select name="code"><option value="">All employees</option>${roster().map(e=>`<option value="${esc(e.code)}">${esc(e.name)}</option>`).join('')}</select></label>
   <div class="duty-detail-grid"><label class="duty-field">From<input name="from" type="date" value="${S.month}-01"></label><label class="duty-field">Through<input name="through" type="date" value="${M.days(S.month).at(-1).date}"></label></div>
   <div class="duty-detail-grid"><label class="duty-field">Basic hours<input name="basic" type="number" min="0" max="24" step="any" value="7"></label><label class="duty-field">Change at shift start<input name="cutoff" type="time"></label></div>
   <label class="duty-field">Basic hours at or after cutoff<input name="after" type="number" min="0" max="24" step="any" value="6"></label>
   <label><input name="remove" type="checkbox"> Remove selected rule</label>`,async fields=>{
   const index=fields.get('rule')===''?null:Number(fields.get('rule'));
   if(fields.has('remove')&&index===null)throw Error('Select a rule to remove.');
   const next=rules.filter((_,i)=>i!==index);
   if(!fields.has('remove')){
    const from=fields.get('from'),through=fields.get('through'),cutoff=fields.get('cutoff'),name=fields.get('name').trim();
    if(!name||!from||!through||from>through)throw Error('Enter a name and a valid date range.');
    const [h,m]=cutoff.split(':').map(Number);
    next.push({name,from,through,code:fields.get('code'),basic:M.hourMinutes(fields.get('basic')),cutoff:cutoff?h*60+m:null,after:cutoff?M.hourMinutes(fields.get('after')):null});
   }
   data=options.hourRules(next);await loadBoundary();render();
  });
  form.elements.rule.onchange=()=>{
   if(form.elements.rule.value==='')return;
   const rule=rules[Number(form.elements.rule.value)];
   for(const name of ['name','from','through','code'])form.elements[name].value=rule[name];
   form.elements.basic.value=rule.basic/60;form.elements.after.value=rule.after==null?'':rule.after/60;
   form.elements.cutoff.value=rule.cutoff==null?'':String(Math.floor(rule.cutoff/60)).padStart(2,'0')+':'+String(rule.cutoff%60).padStart(2,'0');
  };
 }
 function bind(){
  host.onclick=async event=>{
   if(event.target.closest('.duty-cell-editor'))return;
   if(S.editing||S.busy||S.confirming)return;
   try{
    const button=event.target.closest('button'),cellEl=event.target.closest('[data-s-code]'),row=event.target.closest('[data-s-column]');
    if(button?.dataset.sMode){S.mode=Number(button.dataset.sMode);S.start=0;S.selected=[];S.anchor=null;S.cursor=null;render();await loadBoundary();return;}
    if(row){S.selected=employees().map(e=>({code:e.code,date:row.dataset.sColumn}));S.cursor=S.anchor=S.selected[0];updateSelection();focusSelection();return;}
    if(cellEl){
     if(skipClick)return;
     const {sCode:code,sDate:date}=cellEl.dataset;
     select(code,date,event.shiftKey);focusSelection();return;
    }
    switch(button?.dataset.sAction){
     case 'back':case 'forward':S.start+=button.dataset.sAction==='back'?-S.mode:S.mode;S.selected=[];S.anchor=null;S.cursor=null;render();await loadBoundary();break;
     case 'details':details();break;
     case 'copy':copy();break;
     case 'paste':await paste();break;
     case 'delete':await deleteSelection();break;
     case 'undo':await history(false);break;
     case 'redo':await history(true);break;
     case 'staff-back':case 'staff-next':S.staffPage+=button.dataset.sAction==='staff-back'?-1:1;clearSelection();render();break;
     case 'color':color();break;
     case 'day':dayType();break;
     case 'rules':hourRules();break;
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
  host.onpointerdown=event=>{
   skipClick=false;
   const td=event.target.closest('[data-s-code]');
   if(!td||event.button!==0||event.pointerType!=='mouse'||S.editing||S.busy||S.confirming)return;
   drag={id:event.pointerId,start:td,last:td,moved:false};
  };
  host.onpointermove=event=>{
   if(!drag||drag.id!==event.pointerId)return;
   if(!(event.buttons&1)){drag=null;updateSelection();return;}
   const td=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-s-code]');
   if(!td||!host.contains(td)||td===drag.last)return;
   if(!drag.moved){
    drag.moved=true;host.setPointerCapture(event.pointerId);
    const {sCode:code,sDate:date}=drag.start.dataset;select(code,date,false);
   }
   drag.last=td;
   select(td.dataset.sCode,td.dataset.sDate,true);
  };
  const finishDrag=event=>{
   if(!drag||drag.id!==event.pointerId)return;
   skipClick=drag.moved;drag=null;
   if(skipClick){updateSelection();focusSelection();}
  };
  host.onpointerup=host.onpointercancel=host.onlostpointercapture=finishDrag;
  host.onpointerleave=()=>{if(drag&&!drag.moved)drag=null;};
  host.ondragstart=event=>{if(event.target.closest('[data-s-code]'))event.preventDefault();};
  host.onchange=async e=>{
   if(e.target.id==='duty-staff-size'){S.staffSize=Number(e.target.value);S.staffPage=0;clearSelection();render();return;}
   if(e.target.dataset.sSupport){const code=e.target.dataset.sSupport;if(e.target.checked)S.support.add(code);else S.support.delete(code);clearSelection();const open=host.querySelector('.duty-staff-filter').open;render();host.querySelector('.duty-staff-filter').open=open;return;}
   if(e.target.id!=='duty-apply-status'||!e.target.value)return;
   if(!S.selected.length||S.selected.some(c=>!writableDate(c.date))){S.notice='Select editable dates before changing status.';render();return;}
   await save(S.selected.map(c=>({...c,payload:{...payload(c.code,c.date),status:e.target.value,periods:[],manual_minutes:undefined}})),'Set OFF / leave / clear',true);
   render();focusSelection();
  };
  const fromSchedule=e=>!S.editing&&!S.busy&&!S.confirming&&!e.target.closest('input,select,textarea,[contenteditable]');
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
   if(e.key==='Escape'){S.selected=[];S.anchor=null;updateSelection();return;}
   const {sCode:code,sDate:date}=cellEl.dataset;
   if(e.key==='Enter'||e.key==='F2'){e.preventDefault();select(code,date,false);edit(code,date);return;}
   const staff=employees(),days=dates(),x=staff.findIndex(v=>v.code===code),y=days.findIndex(v=>v.date===date);
   const offset={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
   if(!offset)return;
   const next=staff[x+offset[0]]?.code,nextDate=days[y+offset[1]]?.date;
   if(next&&nextDate){e.preventDefault();select(next,nextDate,e.shiftKey);focus(next,nextDate,true);}
  };
 }
 window.DutySchedule={mount,isEditing:()=>!!S.editing||S.busy||S.confirming||!!drag?.moved,clear(keepClipboard=false){
  drag=null;skipClick=false;scopeVersion++;periodVersion++;adjacent.clear();clearHistory();
  if(!keepClipboard){S.clipboard=[];S.support.clear();S.staffPage=0;S.staffSize=6;S.mode=31;}
  Object.assign(S,{editing:null,selected:[],anchor:null,cursor:null,month:'',notice:'',busy:false,confirming:false});
 }};
})();
