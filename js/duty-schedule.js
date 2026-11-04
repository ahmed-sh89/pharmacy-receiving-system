/* Duty-only scheduler. All persisted writes pass through scoped, versioned RPCs. */
(function(){
 'use strict';
 const M=window.DutyModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S={mode:7,group:'pharmacists',start:0,month:'',selected:[],anchor:null,clipboard:[],busy:false,confirming:false,notice:'',editing:null};
 let host,data,options;
 const key=(code,date)=>code+'|'+date;
 const entry=(code,date)=>data.entries?.find(e=>e.code===code&&e.date===date);
 const payload=(code,date)=>entry(code,date)?.payload||M.normalize();
 function employees(){
  const history=data.entries||[],all=data.employees.filter(e=>e.active||history.some(x=>x.code===e.code&&x.payload.status!=='EMPTY'));
  return all.map(e=>{const h=history.find(x=>x.code===e.code);return h?{...e,...h.identity}:e;}).filter(e=>S.group==='pharmacists'?e.position_key==='pharmacist':e.position_key!=='pharmacist');
 }
 const dates=()=>M.days(S.month).slice(S.mode===31?0:S.start,S.mode===31?31:S.start+S.mode);
 const selected=(code,date)=>S.selected.some(s=>s.code===code&&s.date===date);
 const writable=()=>data.can_write&&!S.busy&&data.month?.status!=='Completed';
 function mount(el,d,config){host=el;data={entries:[],holidays:[],...d};options=config;if(S.month!==config.month){S.month=config.month;S.start=0;S.selected=[];S.editing=null;S.notice='';}render();}
 function render(){
  if(!host?.isConnected)return;
  const oldScroll=host.querySelector('.duty-grid-scroll')?.scrollLeft||0,days=dates(),staff=employees(),totals=M.totals(data.entries||[],data.holidays||[]),allDays=M.days(S.month);
  host.innerHTML=`<div class="duty-schedule-controls"><div class="duty-segment" role="group" aria-label="Employee group"><button type="button" data-s-group="pharmacists" aria-pressed="${S.group==='pharmacists'}">Pharmacists</button><button type="button" data-s-group="support" aria-pressed="${S.group==='support'}">Labor &amp; Beauty</button></div><div class="duty-period"><button type="button" data-s-action="back" aria-label="Previous period" ${S.start===0||S.mode===31?'disabled':''}>‹</button><strong>${days[0]?.day}–${days.at(-1)?.day} ${new Date(S.month+'-01T12:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})}</strong><button type="button" data-s-action="forward" aria-label="Next period" ${S.start+S.mode>=allDays.length||S.mode===31?'disabled':''}>›</button></div><div class="duty-segment" role="group" aria-label="Calendar view">${[[7,'Week'],[14,'2 Weeks'],[31,'Month']].map(([n,label])=>`<button type="button" data-s-mode="${n}" aria-pressed="${S.mode===n}">${label}</button>`).join('')}</div></div>
   <div class="duty-selection-tools"><span class="duty-selection-label">${S.selected.length?`${S.selected.length} selected · ${esc(S.selected[0].date)}${S.selected.length===1?' · '+esc(data.employees.find(e=>e.code===S.selected[0].code)?.name||''):''}`:'Click to edit · Shift-click for a range'}</span><div class="duty-actions"><select aria-label="Apply status to selection" id="duty-apply-status" ${!writable()?'disabled':''}><option value="">Set status…</option>${Object.entries(M.statuses).filter(([k])=>k!=='WORK').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button type="button" data-s-action="details" ${!S.selected.length?'disabled':''}>Details</button><button type="button" data-s-action="copy" ${!S.selected.length?'disabled':''}>Copy</button><button type="button" data-s-action="paste" ${!S.clipboard.length||!S.selected.length||!writable()?'disabled':''}>Paste</button>${S.mode===7?`<button type="button" data-s-action="next-week" ${!writable()?'disabled':''}>Copy week →</button>`:''}<button type="button" data-s-action="reuse" ${!writable()?'disabled':''}>Reuse schedule</button><button type="button" data-s-action="month" ${!data.can_write?'disabled':''}>${esc(data.month?.status||'Draft')} ▾</button></div></div>
   ${S.notice?`<div class="duty-inline-message" role="status">${esc(S.notice)}</div>`:''}
   ${!staff.length?'<div class="duty-empty"><h3>No employees in this view</h3><p>Add an employee, or switch the employee group.</p></div>':`<div class="duty-grid-scroll duty-scheduling-grid ${S.mode===7?'duty-week':''}" role="region" aria-label="Duty schedule"><table aria-label="${S.mode===7?'Week':S.mode===14?'2 Weeks':'Month'} schedule"><colgroup><col style="width:178px"><col style="width:85px">${days.map(()=>`<col ${S.mode!==7?'style="width:160px"':''}>`).join('')}</colgroup><thead><tr><th class="duty-employee-col" scope="col">Employee</th><th class="duty-total-col" scope="col">Monthly hours</th>${days.map(d=>{const h=data.holidays?.some(h=>h.date===d.date&&h.active);return `<th class="duty-day-col ${d.friday?'duty-friday':h?'duty-holiday':''}" scope="col" data-s-column="${d.date}" title="Select this date column"><button type="button" class="duty-date-select" data-s-column="${d.date}" aria-label="Select ${d.date}">${d.weekday}<strong>${d.day}</strong>${h?'<small>Holiday</small>':''}</button></th>`;}).join('')}</tr></thead><tbody>${staff.map(e=>`<tr class="duty-employee-row"><td class="duty-employee-col"><span class="duty-name" title="${esc(e.name)}">${esc(e.name)}</span><span class="duty-code">${esc(e.code)}${e.active?'':' · inactive'}</span></td><td class="duty-total-col"><button type="button" class="duty-total-button" data-s-total="${esc(e.code)}" title="View monthly totals"><span class="duty-total">${M.hours(totals[e.code]?.total||0)}</span><span class="duty-hours-unit">worked hours</span></button></td>${days.map(d=>cell(e,d)).join('')}</tr>`).join('')}</tbody></table></div>`}
   <div class="duty-footnote"><span>Planned duty · ${data.month?.status==='Completed'?'Completed month is locked':'Enter saves · Esc cancels · Arrow keys navigate'}</span><span>${allDays.filter(d=>d.friday).length} Fridays · ${S.busy?'Saving…':options.demo?'Demo changes stay in memory':'Staging · server saved'}</span></div>`;
  host.querySelector('.duty-grid-scroll')?.scrollTo?.({left:oldScroll});bind();
 }
 function cell(e,d){
  const p=payload(e.code,d.date),h=data.holidays?.some(h=>h.date===d.date&&h.active),n=M.calculate(d.date,p,h),sel=selected(e.code,d.date),text=M.text(p);
  return `<td tabindex="0" role="gridcell" aria-selected="${sel}" aria-label="${esc(e.name)}, ${d.date}, ${esc(text||'Empty')}" data-s-code="${esc(e.code)}" data-s-date="${d.date}" class="duty-cell duty-day-col ${d.friday?'duty-friday':h?'duty-holiday':''} ${sel?'duty-selected':''} ${p.highlight?'duty-mark-'+p.highlight:''} ${p.status!=='WORK'&&p.status!=='EMPTY'?'duty-status-'+p.status.toLowerCase():''}"><div class="duty-cell-content">${p.status==='WORK'?p.periods.map(t=>`<span class="duty-time-period"><span class="duty-time-part">${M.formatTime(t.start)}</span> <span class="duty-time-dash">–</span> <span class="duty-time-part">${M.formatTime(t.end)}</span></span>`).join(''):p.status==='EMPTY'?'<span class="duty-blank">—</span>':`<span class="duty-status">${esc(M.statuses[p.status])}</span>`}${p.status==='WORK'?`<small class="duty-cell-hours">${M.hours(n.total)} h${n.friday_ot?' · Friday OT':n.holiday_ot?' · Holiday OT':''}</small>`:''}${p.note?`<span class="duty-note-dot" title="${esc(p.note)}" aria-label="Note">•</span>`:''}${p.basic_limit!==540?'<span class="duty-override-dot" title="Adjusted basic limit">*</span>':''}</div></td>`;
 }
 function select(code,date,range){
  if(range&&S.anchor){const staff=employees(),ds=M.days(S.month),a=staff.findIndex(e=>e.code===S.anchor.code),b=staff.findIndex(e=>e.code===code),x=ds.findIndex(d=>d.date===S.anchor.date),y=ds.findIndex(d=>d.date===date);if(a<0||b<0)return;S.selected=[];for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(x,y);j<=Math.max(x,y);j++)S.selected.push({code:staff[i].code,date:ds[j].date});}
  else {S.selected=[{code,date}];S.anchor={code,date};}render();
 }
 function focus(code,date){host.querySelector(`[data-s-code="${CSS.escape(code)}"][data-s-date="${date}"]`)?.focus({preventScroll:true});}
 function edit(code,date,initial){
  if(!writable())return;const editRevision=entry(code,date)?.revision||0;S.editing={code,date};
  const td=host.querySelector(`[data-s-code="${CSS.escape(code)}"][data-s-date="${date}"]`);if(!td)return;
  td.classList.add('duty-editing');td.innerHTML=`<input class="duty-inline" aria-label="Working times for ${esc(code)} ${date}" autocomplete="off" spellcheck="false" placeholder="9 AM – 6 PM"><small class="duty-inline-hint">Split: 9 AM–1 PM / 5 PM–10 PM</small><span class="duty-cell-error" role="alert"></span>`;
  const input=td.querySelector('input');input.value=initial??M.text(payload(code,date));input.focus();if(initial===undefined)input.select();
  input.addEventListener('keydown',async e=>{
   if(e.key==='Escape'){e.stopPropagation();e.preventDefault();S.editing=null;render();focus(code,date);return;}
   if(e.key==='Enter'||e.key==='Tab'){
    e.stopPropagation();e.preventDefault();
    try{const p=M.parse(input.value,payload(code,date));input.disabled=true;const next=nextCell(code,date,e.shiftKey?-1:1);if(await save([{code,date,payload:p,expected_revision:editRevision}],'Inline edit')){S.editing=null;render();focus(e.key==='Tab'&&next?next.code:code,e.key==='Tab'&&next?next.date:date);}else {input.disabled=false;input.focus();}}
    catch(error){td.querySelector('[role=alert]').textContent=error.message;input.disabled=false;input.focus();}
   }
  });
 }
 function nextCell(code,date,delta){const cells=employees().flatMap(e=>dates().map(d=>({code:e.code,date:d.date}))),i=cells.findIndex(c=>c.code===code&&c.date===date);return cells[i+delta];}
 async function save(changes,reason,confirmOverwrite=false){
  if(!writable())return false;
  const snapshots=new Map([[S.month,data]]);for(const month of new Set(changes.map(c=>c.date.slice(0,7))))if(!snapshots.has(month))snapshots.set(month,await options.readMonth(month));
  const existing=c=>snapshots.get(c.date.slice(0,7))?.entries?.find(e=>e.code===c.code&&e.date===c.date);
  const normalized=changes.map(c=>({...c,payload:M.normalize(c.payload),expected_revision:c.expected_revision??existing(c)?.revision??0}));
  if(confirmOverwrite){const count=normalized.filter(c=>existing(c)&&existing(c).payload.status!=='EMPTY').length;if(count){S.confirming=true;let approved;try{approved=await options.confirm(`Replace ${count} populated destination cell${count===1?'':'s'}? Other entries will stay unchanged.`);}finally{S.confirming=false;}if(!approved)return false;}}
  S.busy=true;S.notice='Saving…';
  try{
   const next=await options.save(normalized,reason);data=next;S.notice=`Saved ${normalized.length} cell${normalized.length===1?'':'s'}.`;return true;
  }catch(error){S.notice=String(error.message).includes('DUTY_CONFLICT')?'Another session changed a destination. Your edit was not saved. Refresh Duty, review it, and try again.':error.message;return false;}
  finally{S.busy=false;if(!S.editing)render();else {const el=host.querySelector('.duty-cell-error');if(el)el.textContent=S.notice;}}
 }
 function copy(){S.clipboard=S.selected.map(s=>({...s,payload:structuredClone(payload(s.code,s.date))}));S.notice=`Copied ${S.clipboard.length} cells. Select a destination and Paste.`;render();}
 async function paste(){
  const first=S.selected[0],source=S.clipboard;if(!first||!source.length)return;
  const staff=employees(),sourceCodes=[...new Set(source.map(s=>s.code))],base=source.map(s=>s.date).sort()[0],destIndex=staff.findIndex(e=>e.code===first.code);
  const changes=source.map(s=>({code:staff[destIndex+sourceCodes.indexOf(s.code)]?.code,date:M.addDays(first.date,Math.round((Date.parse(s.date)-Date.parse(base))/86400000)),payload:s.payload}));
  if(changes.some(c=>!c.code||c.date.slice(0,7)!==S.month)){S.notice='The copied range does not fit this view/month. Select an earlier destination.';render();return;}
  await save(changes,'Paste schedule range',true);
 }
 function smallPanel(title,body,onSubmit){
  return options.panel(title,body,onSubmit);
 }
 function details(){
  const s=S.selected[0];if(!s)return;const openingRevisions=new Map((data.entries||[]).map(e=>[key(e.code,e.date),e.revision]));const p=payload(s.code,s.date),h=data.holidays.find(h=>h.date===s.date),total=M.totals(data.entries,data.holidays)[s.code]||M.calculate(s.date,M.normalize());
  const form=smallPanel(S.selected.length===1?`${s.code} · ${s.date}`:`${S.selected.length} selected cells`,
   `<label class="duty-field">Status<select name="status">${Object.entries(M.statuses).map(([k,v])=>`<option value="${k}" ${k===p.status?'selected':''}>${v}</option>`).join('')}</select></label><label class="duty-field">Working periods<input name="times" value="${esc(p.status==='WORK'?M.text(p):'')}" placeholder="9 AM – 1 PM / 5 PM – 10 PM"><small>AM/PM times. Non-working states have no worked hours.</small></label><label class="duty-field">Basic daily limit (hours)<input name="basic" type="number" min="0" max="24" step="any" value="${p.basic_limit/60}"><small>Default 9 hours. Adjustments are recorded in history.</small></label><label class="duty-field">Note<textarea name="note" maxlength="300" rows="2">${esc(p.note)}</textarea></label><label class="duty-field">Manual highlight<select name="highlight">${[['','None'],['blue','Blue'],['mint','Mint'],['violet','Violet'],['rose','Rose']].map(([v,l])=>`<option value="${v}" ${p.highlight===v?'selected':''}>${l}</option>`).join('')}</select><small>Does not change Friday or Holiday classification.</small></label><div class="duty-detail-grid"><label class="duty-field">From<input name="from" type="date" value="${S.selected.map(c=>c.date).sort()[0]}" required></label><label class="duty-field">Through<input name="through" type="date" value="${S.selected.map(c=>c.date).sort().at(-1)}" required></label></div><button type="button" data-duty-holiday-action>${h?.active?'Remove':'Mark'} Official Holiday · ${s.date}</button><small>This separate date action applies to every employee. Friday takes precedence.</small><div class="duty-total-breakdown">${[['basic','Basic'],['normal_ot','Normal OT'],['friday_ot','Friday OT'],['holiday_ot','Holiday OT'],['total','Total worked']].map(([k,l])=>`<span>${l}<strong>${M.hours(total[k]||0)} h</strong></span>`).join('')}</div>`,async fields=>{
    if(!writable())throw Error('This month is locked or read only.');
    const status=fields.get('status'),basic=Number(fields.get('basic'))*60;
    if(!Number.isFinite(basic)||Math.abs(basic-Math.round(basic))>0.00001)throw Error('Use a basic limit in whole minutes.');
    const p2=status==='WORK'?M.parse(fields.get('times'),{...p,status,basic_limit:Math.round(basic),note:fields.get('note'),highlight:fields.get('highlight')}):M.normalize({status,basic_limit:Math.round(basic),note:fields.get('note'),highlight:fields.get('highlight'),periods:[]});
    const from=String(fields.get('from')),through=String(fields.get('through'));
    const span=Math.round((Date.parse(through)-Date.parse(from))/86400000)+1,codes=[...new Set(S.selected.map(c=>c.code))];
    if(!Number.isFinite(span)||span<1||span>366||span*codes.length>1000)throw Error('Choose a valid range of up to 1000 employee/day cells.');
    const changes=codes.flatMap(code=>Array.from({length:span},(_,i)=>{const date=M.addDays(from,i);return {code,date,payload:p2,expected_revision:date.slice(0,7)===S.month?(openingRevisions.get(key(code,date))||0):undefined};}));
    if(!await save(changes,'Duty details / basic limit / note / highlight',changes.length>1))throw Error(S.notice);
   });
  form?.querySelector('[data-duty-holiday-action]')?.addEventListener('click',async event=>{
   if(!writable())return;const button=event.currentTarget;button.disabled=true;
   try{data=await options.holiday(s.date,!h?.active,h?.revision||0);button.textContent='Date classification saved. Reopen to change again.';render();}catch(e){form.querySelector('[role=alert]').textContent=e.message;button.disabled=false;}
  });
 }
 function reuse(){
  const first=S.selected[0]||{code:employees()[0]?.code,date:dates()[0].date};if(!first.code)return;
  smallPanel('Reuse schedule',`<label class="duty-field">Source<select name="kind"><option value="selection" ${S.selected.length?'selected':''}>Selected cells</option><option value="day">Whole visible group · selected day</option><option value="week" ${!S.selected.length?'selected':''}>Whole visible group · displayed week</option><option value="month">Previous month · same dates</option></select></label><label class="duty-field">Destination start date<input type="date" name="destination" value="${S.mode===7&&S.start+7<M.days(S.month).length?M.addDays(dates()[0].date,7):first.date}" required></label><label class="duty-field">Destination employee<select name="employee"><option value="same">Keep source employees</option>${employees().map(e=>`<option value="${esc(e.code)}">${esc(e.name)}</option>`).join('')}</select><small>Choose another employee to copy one employee’s selected range.</small></label>`,async fields=>{
   const kind=fields.get('kind'),destination=String(fields.get('destination')),employee=fields.get('employee');let src=[],base;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(destination))throw Error('Choose a destination date.');
   if(kind==='month'){
    const previous=await options.readMonth(M.shiftMonth(S.month,-1));src=previous.entries.filter(e=>employees().some(x=>x.code===e.code)&&e.payload.status!=='EMPTY');
    const changes=src.filter(e=>Number(e.date.slice(8))<=M.days(S.month).length).map(e=>({code:e.code,date:S.month+e.date.slice(7),payload:e.payload}));
    if(!changes.length)throw Error('The previous month has no entries for this group.');
    if(!await save(changes,'Copy previous month',true))throw Error(S.notice);return;
   }
   if(kind==='selection'){src=S.selected.map(c=>({...c,payload:payload(c.code,c.date)}));base=src.map(e=>e.date).sort()[0];}
   else {const ds=kind==='day'?[first.date]:dates().slice(0,7).map(d=>d.date);base=ds[0];src=employees().flatMap(e=>ds.map(date=>({code:e.code,date,payload:payload(e.code,date)})));}
   if(!src.length)throw Error('Select at least one source cell.');
   if(employee!=='same'&&new Set(src.map(e=>e.code)).size>1)throw Error('Select one source employee when copying to another employee.');
   const changes=src.map(e=>({code:employee==='same'?e.code:employee,date:M.addDays(destination,Math.round((Date.parse(e.date)-Date.parse(base))/86400000)),payload:e.payload}));

   if(!await save(changes,'Copy '+kind+' schedule',true))throw Error(S.notice);
  });
 }
 function monthPanel(){smallPanel('Month status',`<label class="duty-field">Status<select name="status">${['Draft','Active','Completed'].map(s=>`<option ${s===data.month?.status?'selected':''}>${s}</option>`).join('')}</select></label><label class="duty-field">Reason<input name="reason" required minlength="3" maxlength="200" placeholder="Reason for completing or reopening"></label><p class="duty-subtitle">Completed months are locked. Reopening and corrections are audited.</p>`,async fields=>{data=await options.monthStatus(fields.get('status'),data.month?.revision||0,fields.get('reason'));render();});}
 function bind(){
  host.onpointerover=event=>{const td=event.target.closest('[data-s-date]');if(!td)return;host.querySelectorAll('.duty-column-hover').forEach(e=>e.classList.remove('duty-column-hover'));host.querySelectorAll(`[data-s-date="${td.dataset.sDate}"],[data-s-column="${td.dataset.sDate}"]`).forEach(e=>e.classList.add('duty-column-hover'));};
  host.onpointerleave=()=>host.querySelectorAll('.duty-column-hover').forEach(e=>e.classList.remove('duty-column-hover'));
  host.onclick=async event=>{
   try{
   const button=event.target.closest('button'),cellEl=event.target.closest('[data-s-code]'),column=event.target.closest('[data-s-column]');
   if(S.editing&&event.target.closest('.duty-editing'))return;
   if(S.editing){const input=host.querySelector('.duty-inline');if(input&&input.value===M.text(payload(S.editing.code,S.editing.date))){S.editing=null;}else {const message=host.querySelector('.duty-cell-error');if(message)message.textContent='Press Enter to save or Escape to cancel.';return;}}
   if(button?.dataset.sGroup){S.group=button.dataset.sGroup;S.selected=[];render();return;}
   if(button?.dataset.sMode){S.mode=Number(button.dataset.sMode);S.start=0;S.selected=[];render();return;}
   if(column){S.selected=employees().map(e=>({code:e.code,date:column.dataset.sColumn}));S.anchor=S.selected[0];render();return;}
   if(cellEl){const code=cellEl.dataset.sCode,date=cellEl.dataset.sDate;select(code,date,event.shiftKey);if(!event.shiftKey)edit(code,date);return;}
   if(button?.dataset.sTotal){const e=employees().find(e=>e.code===button.dataset.sTotal);S.selected=[{code:e.code,date:dates()[0].date}];details();return;}
   switch(button?.dataset.sAction){
    case 'back':S.start=Math.max(0,S.start-S.mode);S.selected=[];render();break;
    case 'forward':S.start+=S.mode;S.selected=[];render();break;
    case 'details':details();break;case 'copy':copy();break;case 'paste':await paste();break;case 'reuse':reuse();break;case 'next-week':await save(employees().flatMap(e=>dates().slice(0,7).map(d=>({code:e.code,date:M.addDays(d.date,7),payload:payload(e.code,d.date)}))),'Copy complete week to next week',true);break;case 'month':monthPanel();break;
   }
   }catch(error){S.notice=error.message||'Duty action could not be completed.';render();}
  };
  host.onchange=async e=>{if(e.target.id==='duty-apply-status'&&e.target.value){if(!S.selected.length){S.notice='Select a cell, date column or range first.';render();return;}await save(S.selected.map(c=>({...c,payload:{...payload(c.code,c.date),status:e.target.value,periods:[]}})),'Set OFF / leave / clear',true);}};
  host.onkeydown=e=>{
   if(e.target.matches('input,select,textarea'))return;
   const cellEl=e.target.closest('[data-s-code]');if(!cellEl)return;
   const code=cellEl.dataset.sCode,date=cellEl.dataset.sDate;
   if(e.key==='Enter'||e.key==='F2'){e.preventDefault();select(code,date,false);edit(code,date);return;}
   const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:dates().length,ArrowUp:-dates().length,Tab:e.shiftKey?-1:1}[e.key];
   if(delta!==undefined){const next=nextCell(code,date,delta);if(next){e.preventDefault();select(next.code,next.date,e.shiftKey&&e.key!=='Tab');focus(next.code,next.date);}return;}
   if((e.ctrlKey||e.metaKey)&&e.key==='c'){e.preventDefault();copy();return;}
   if((e.ctrlKey||e.metaKey)&&e.key==='v'){e.preventDefault();paste();return;}
   if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){e.preventDefault();select(code,date,false);edit(code,date,e.key);}
  };
 }
 window.DutySchedule={mount,isEditing:()=>!!S.editing||S.busy||S.confirming,clear(){S.editing=null;S.selected=[];S.clipboard=[];S.month='';S.notice='';}};
})();
