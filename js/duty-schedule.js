/* Duty-only scheduler. All persisted writes pass through scoped, versioned RPCs. */
(function(){
 'use strict';
 const M=window.DutyModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S={mode:7,group:'pharmacists',start:0,month:'',selected:[],anchor:null,clipboard:[],busy:false,confirming:false,notice:'',editing:null};
 let host,data,options,scopeVersion=0,periodVersion=0;
 const adjacent=new Map(),past=[],future=[],localRevisions=new Map();
 const monthData=date=>date.slice(0,7)===S.month?data:adjacent.get(date.slice(0,7));
 const canOverride=()=>options.demo||data.manual_hours===true;
 const categoryLabels={...M.categories,total:'Total Hours'};
 const formatDate=date=>new Date(date+'T12:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
 const clearHistory=()=>{past.length=0;future.length=0;localRevisions.clear();};
 const key=(code,date)=>code+'|'+date;
 const entry=(code,date)=>monthData(date)?.entries?.find(e=>e.code===code&&e.date===date);
 const payload=(code,date)=>entry(code,date)?.payload||M.normalize();
 function employees(){
  const history=data.entries||[],all=data.employees.filter(e=>e.active||history.some(x=>x.code===e.code&&x.payload.status!=='EMPTY'));
  return all.map(e=>{const h=history.find(x=>x.code===e.code);return h?{...e,...h.identity}:e;}).filter(e=>S.group==='pharmacists'?e.position_key==='pharmacist':e.position_key!=='pharmacist');
 }
 const dates=()=>M.calendarPeriod(S.month,S.start,S.mode);
 const selected=(code,date)=>S.selected.some(s=>s.code===code&&s.date===date);
 const writable=()=>data.can_write&&!S.busy&&!S.confirming&&!options.loading&&data.month?.status!=='Completed';
 const writableDate=date=>writable()&&!!monthData(date)?.can_write&&monthData(date).month?.status!=='Completed';
 const holiday=date=>monthData(date)?.holidays?.find(h=>h.date===date&&h.active);
 function mount(el,d,config){
  host=el;data={entries:[],holidays:[],...d};options=config;
  if(S.month!==config.month){S.month=config.month;S.start=0;S.selected=[];S.editing=null;S.notice='';}
  render();if(!options.loading&&employees().length)loadBoundary();
 }
 async function loadBoundary(){
  const version=++periodVersion;
  const months=[...new Set(dates().map(d=>d.date.slice(0,7)))].filter(m=>m!==S.month);
  try{
   const snapshots=await Promise.all(months.map(async month=>[month,await options.readMonth(month)]));
   if(version!==periodVersion||!host?.isConnected||S.editing||S.confirming||S.busy)return;
   for(const [month,snapshot] of snapshots)adjacent.set(month,snapshot);
   if(snapshots.length){const focused=document.activeElement?.closest('[data-s-code]');render();if(focused)focus(focused.dataset.sCode,focused.dataset.sDate);}
  }catch(error){
   if(version===periodVersion&&host?.isConnected){S.notice='Adjacent dates could not be loaded. '+error.message;render();}
  }
 }
 function render(){
  if(!host?.isConnected)return;
  const scroll=host.querySelector('.duty-grid-scroll'),scrollPosition={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
  const days=dates(),staff=employees(),totals=M.totals(data.entries,data.holidays);
  const next=days.at(-1).date<M.days(S.month).at(-1).date;
  host.innerHTML=`<div class="duty-schedule-controls">
   <div class="duty-segment" role="group" aria-label="Employee group"><button type="button" data-s-group="pharmacists" aria-pressed="${S.group==='pharmacists'}">Pharmacists</button><button type="button" data-s-group="support" aria-pressed="${S.group==='support'}">Labor &amp; Beauty</button></div>
   <div class="duty-period"><button type="button" data-s-action="back" aria-label="Previous period" ${!S.start||S.mode===31?'disabled':''}>‹</button><strong>${formatDate(days[0].date)} – ${formatDate(days.at(-1).date)}</strong><button type="button" data-s-action="forward" aria-label="Next period" ${!next||S.mode===31?'disabled':''}>›</button></div>
   <div class="duty-segment" role="group" aria-label="Calendar view">${[[7,'Week'],[14,'2 Weeks'],[31,'Month']].map(([n,label])=>`<button type="button" data-s-mode="${n}" aria-pressed="${S.mode===n}">${label}</button>`).join('')}</div>
   <div class="duty-actions duty-history"><button type="button" data-s-action="undo" title="Ctrl+Z" ${!past.length||!writable()?'disabled':''}>↶ Undo</button><button type="button" data-s-action="redo" title="Ctrl+Y" ${!future.length||!writable()?'disabled':''}>↷ Redo</button></div></div>
   <div class="duty-selection-tools"><span class="duty-selection-label">${S.selected.length?`${S.selected.length} selected · ${formatDate(S.selected[0].date)}`:'Click a time to edit · Ctrl-click to select · Shift-click for a range'}</span><div class="duty-actions">
   ${S.selected.length?`<button type="button" data-s-action="copy" title="Ctrl+C">Copy</button><button type="button" data-s-action="paste" title="Ctrl+V" ${!S.clipboard.length||!writable()?'disabled':''}>Paste</button><button type="button" data-s-action="details">Details</button><select aria-label="Apply status to selection" id="duty-apply-status" ${!writable()?'disabled':''}><option value="">Set status…</option>${Object.entries(M.statuses).filter(([k])=>k!=='WORK').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>`:''}
   <button type="button" data-s-action="reuse" ${!writable()?'disabled':''}>Reuse schedule</button>${S.mode===7?`<button type="button" data-s-action="next-week" ${!writable()?'disabled':''}>Copy week →</button>`:''}<button type="button" data-s-action="month" ${!data.can_write?'disabled':''}>${esc(data.month?.status||'Draft')} ▾</button></div></div>
   <div class="duty-grid-scroll duty-vertical" role="region" aria-label="Duty schedule"><table aria-label="Duty schedule" style="min-width:${92+staff.length*145}px">
    <colgroup><col style="width:92px">${staff.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col" class="duty-date-heading">Calendar <small>Monthly totals · h</small></th>
    ${staff.map(e=>`<th scope="col"><span class="duty-name" title="${esc(e.name)}">${esc(e.name)}</span><span class="duty-code">${esc(e.code)}${e.active?'':' · inactive'}</span><div class="duty-mini-kpis">${Object.entries(categoryLabels).map(([k,label])=>`<span class="duty-category-${k}"><b>${M.hours(totals[e.code]?.[k]||0)}</b> ${label}</span>`).join('')}</div></th>`).join('')}</tr></thead>
    <tbody>${staff.length?days.map(d=>`<tr class="${d.friday?'duty-friday-row':holiday(d.date)?'duty-holiday-row':''}"><th scope="row"><button class="duty-date-button" type="button" data-s-column="${d.date}" aria-label="Select ${d.date}"><strong>${d.weekday}</strong><span>${formatDate(d.date)}</span>${holiday(d.date)?'<small>Holiday</small>':''}</button></th>${staff.map(e=>cell(e,d)).join('')}</tr>`).join(''):'<tr><td class="duty-empty">No employees in this view</td></tr>'}</tbody></table></div>
   <div class="duty-footnote"><span role="status">${esc(S.notice||(canOverride()?'Blank manual hours restore automatic calculation.':'Manual hours are available in the synthetic preview pending the Staging database update.'))}</span><span>${options.demo?'Synthetic · memory only':'Staging · planned duty'}</span></div>`;
  host.querySelector('.duty-grid-scroll')?.scrollTo?.(scrollPosition);bind();
 }
 function cell(e,d){
  const p=payload(e.code,d.date),n=M.calculate(d.date,p,!!holiday(d.date)),sel=selected(e.code,d.date),enabled=writableDate(d.date),loaded=!!monthData(d.date);
  const times=p.periods.map(t=>`<span class="duty-time-period">${M.formatTime(t.start)} – ${M.formatTime(t.end)}</span>`).join('');
  return `<td tabindex="0" aria-label="${esc(e.name)}, ${d.date}, ${esc(M.text(p)||'Empty')}" data-s-code="${esc(e.code)}" data-s-date="${d.date}" class="duty-cell ${sel?'duty-selected':''} ${p.highlight?'duty-mark-'+p.highlight:''}">
   <button type="button" data-s-time class="duty-cell-time ${p.periods.length===2?'duty-split':''} duty-status-${p.status.toLowerCase()}" ${enabled?'':'disabled'}>${times||(p.status==='WORK'||p.status==='EMPTY'?(loaded?'＋ Time':'—'):M.statuses[p.status])}</button>
   ${p.note?`<span class="duty-note-dot" title="${esc(p.note)}" aria-label="Note">•</span>`:''}
   <div class="duty-cell-categories">${Object.entries(M.categories).map(([k,label])=>{
    const manual=Object.hasOwn(p.manual_minutes||{},k),editable=enabled&&canOverride()&&['WORK','EMPTY'].includes(p.status);
    return `<button type="button" data-s-hours="${k}" class="duty-category-${k} ${manual?'duty-manual':''}" title="${label}${manual?' · Manual':''}" aria-label="${label}, ${esc(e.name)}, ${d.date}: ${M.hours(n[k])} hours${manual?', manual':''}" ${editable?'':'disabled'}>${n[k]||manual?M.hours(n[k]):'–'}</button>`;
   }).join('')}</div></td>`;
 }
 function select(code,date,range){
  if(range&&S.anchor){const staff=employees(),ds=dates(),a=staff.findIndex(e=>e.code===S.anchor.code),b=staff.findIndex(e=>e.code===code),x=ds.findIndex(d=>d.date===S.anchor.date),y=ds.findIndex(d=>d.date===date);if(a<0||b<0)return;S.selected=[];for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(x,y);j<=Math.max(x,y);j++)S.selected.push({code:staff[i].code,date:ds[j].date});}
  else {S.selected=[{code,date}];S.anchor={code,date};}render();
 }
 function focus(code,date){host.querySelector(`[data-s-code="${CSS.escape(code)}"][data-s-date="${date}"]`)?.focus({preventScroll:true});}
 function dropdowns(prefix,value){
  const [hour,minute,meridiem]=M.formatTime(value).split(/[: ]/);
  const select=(name,values,current)=>`<select name="${prefix}-${name}" aria-label="${prefix} ${name}">${values.map(v=>`<option ${String(v)===current?'selected':''}>${v}</option>`).join('')}</select>`;
  const minutes=[...new Set(['00','15','30','45',minute])].sort();
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
 function edit(code,date,category){
  if(!writableDate(date)||(category&&!canOverride()))return;
  const before=payload(code,date),revision=entry(code,date)?.revision||0;
  const td=host.querySelector(`[data-s-code="${CSS.escape(code)}"][data-s-date="${date}"]`);
  if(!td)return;
  if(category&&!['WORK','EMPTY'].includes(before.status))return;
  S.editing={code,date};td.classList.add('duty-editing');
  const editor=document.createElement('form');editor.className='duty-cell-editor';
  editor.setAttribute('aria-label',category?M.categories[category]:'Working times');
  const auto=M.calculate(date,{...before,status:before.periods.length?'WORK':'EMPTY',manual_minutes:undefined},!!holiday(date));
  editor.innerHTML=`<div class="duty-editor-head"><strong>${category?M.categories[category]:'Working times'}</strong><small>${formatDate(date)}</small></div>
   ${category?`<label class="duty-field">Hours<input name="hours" type="number" min="0" max="24" step="any" placeholder="Auto · ${M.hours(auto[category])}" value="${Object.hasOwn(before.manual_minutes||{},category)?before.manual_minutes[category]/60:''}"></label><small>Leave blank to use automatic hours.</small>`:timeFields(before.periods.length?before.periods:[{start:540,end:1080}])}
   <span class="duty-cell-error" role="alert"></span><div class="duty-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="duty-primary">Save</button></div>`;
  // Keep the editor above the scroll container so edge cells never clip it.
  host.append(editor);
  const rect=td.getBoundingClientRect(),width=editor.offsetWidth,height=editor.offsetHeight;
  editor.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
  editor.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8))+'px';
  const finish=()=>{S.editing=null;render();focus(code,date);if(dates().some(d=>!monthData(d.date)))loadBoundary();};
  editor.querySelector('[data-cancel]').onclick=finish;
  editor.onchange=e=>{
   if(e.target.name==='hasTimes')editor.querySelector('[data-time-fields]').hidden=!e.target.checked;
   if(e.target.name==='split')editor.querySelector('[data-split-fields]').hidden=!e.target.checked;
   editor.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-editor.offsetHeight-8))+'px';
  };
  editor.onkeydown=e=>{if(e.key==='Escape'&&!S.busy){e.preventDefault();e.stopPropagation();finish();}};
  editor.onsubmit=async event=>{
   event.preventDefault();if(S.busy)return;
   const fields=new FormData(editor),button=editor.querySelector('[type=submit]');
   const manual={...before.manual_minutes};
   try{
    const periods=category?before.periods:readTimes(fields);
    if(category){
     const value=fields.get('hours');
     if(value==='')delete manual[category];
     else{
      const minutes=Number(value)*60;
      if(!Number.isFinite(minutes)||Math.abs(minutes-Math.round(minutes))>0.000001)throw Error('Enter hours in whole-minute increments, for example 9 or 1.25.');
      manual[category]=Math.round(minutes);
     }
    }
    const status=periods.length||Object.keys(manual).length?'WORK':category?before.status==='WORK'?'EMPTY':before.status:'EMPTY';
    const next=M.normalize({...before,status,periods,manual_minutes:manual});
    button.disabled=true;
    if(await save([{code,date,payload:next,expected_revision:revision}],category?'Manual '+M.categories[category]:'Edit working times'))finish();
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
    if(count){
     S.confirming=true;
     if(!await config.confirm(`Replace ${count} populated destination cell${count===1?'':'s'}?`)){if(version===scopeVersion)S.notice='Replacement canceled.';return false;}
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
 function copy(){if(S.selected.some(c=>!monthData(c.date))){S.notice='Wait for adjacent dates to load before copying.';render();return;}S.clipboard=S.selected.map(s=>({...s,payload:structuredClone(payload(s.code,s.date))}));S.notice=`Copied ${S.clipboard.length} cells. Select a destination and Paste.`;render();}
 async function paste(){
  const first=S.anchor||S.selected[0],source=S.clipboard;if(!S.selected.length||!first||!source.length)return;
  const staff=employees(),sourceCodes=[...new Set(source.map(s=>s.code))],base=source.map(s=>s.date).sort()[0],destIndex=staff.findIndex(e=>e.code===first.code);
  const changes=source.map(s=>({code:staff[destIndex+sourceCodes.indexOf(s.code)]?.code,date:M.addDays(first.date,Math.round((Date.parse(s.date)-Date.parse(base))/86400000)),payload:s.payload}));
  if(changes.some(c=>!c.code||!dates().some(d=>d.date===c.date)||!monthData(c.date))){S.notice='The copied range does not fit this view. Select an earlier destination.';render();return;}
  await save(changes,'Paste schedule range',true);
 }
 function smallPanel(title,body,onSubmit){
  return options.panel(title,body,onSubmit);
 }
 function details(){
  const selection=[...S.selected],first=selection[0];if(!first)return;
  const p=payload(first.code,first.date),h=holiday(first.date),datesSelected=selection.map(c=>c.date).sort();
  const opening=new Map([data,...adjacent.values()].flatMap(d=>d.entries||[]).map(e=>[key(e.code,e.date),e]));
  const form=smallPanel(selection.length===1?`${first.code} · ${first.date}`:`${selection.length} selected cells`,
   `<label class="duty-field">Status<select name="status"><option value="">Keep existing</option>${Object.entries(M.statuses).filter(([k])=>k!=='WORK').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="duty-field">Note<textarea name="note" maxlength="300" rows="2">${esc(p.note)}</textarea></label>
    <label class="duty-field">Manual highlight<select name="highlight">${[['','None'],['blue','Blue'],['mint','Mint'],['violet','Violet'],['rose','Rose']].map(([v,l])=>`<option value="${v}" ${p.highlight===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <div class="duty-detail-grid"><label class="duty-field">From<input name="from" type="date" value="${datesSelected[0]}" required></label><label class="duty-field">Through<input name="through" type="date" value="${datesSelected.at(-1)}" required></label></div>
    <button type="button" data-duty-holiday-action ${writableDate(first.date)?'':'disabled'}>${h?'Remove':'Mark'} Official Holiday · ${first.date}</button><small>Friday takes precedence for automatic hours.</small>`,async fields=>{
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
     const next={...prior,note:fields.get('note'),highlight:fields.get('highlight')};
     if(status)Object.assign(next,{status,periods:[],manual_minutes:undefined});
     return {code,date,payload:next,expected_revision:row?.revision||0};
    }));
    if(!await save(changes,'Duty details / leave / note / highlight',changes.length>1||!!status))throw Error(S.notice||'No changes saved.');
   });
  form?.querySelector('[data-duty-holiday-action]')?.addEventListener('click',async event=>{
   if(!writableDate(first.date))return;
   const button=event.currentTarget;button.disabled=true;
   try{data=await options.holiday(first.date,!h,h?.revision||0);await loadBoundary();button.textContent='Date classification saved. Reopen to change again.';render();}
   catch(error){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
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
   if(src.some(c=>!monthData(c.date)))throw Error('Wait for adjacent dates to load before copying.');
   if(!src.length)throw Error('Select at least one source cell.');
   if(employee!=='same'&&new Set(src.map(e=>e.code)).size>1)throw Error('Select one source employee when copying to another employee.');
   const changes=src.map(e=>({code:employee==='same'?e.code:employee,date:M.addDays(destination,Math.round((Date.parse(e.date)-Date.parse(base))/86400000)),payload:e.payload}));

   if(!await save(changes,'Copy '+kind+' schedule',true))throw Error(S.notice);
  });
 }
 function monthPanel(){smallPanel('Month status',`<label class="duty-field">Status<select name="status">${['Draft','Active','Completed'].map(s=>`<option ${s===data.month?.status?'selected':''}>${s}</option>`).join('')}</select></label><label class="duty-field">Reason<input name="reason" required minlength="3" maxlength="200" placeholder="Reason for completing or reopening"></label><p class="duty-subtitle">Completed months are locked. Reopening and corrections are audited.</p>`,async fields=>{data=await options.monthStatus(fields.get('status'),data.month?.revision||0,fields.get('reason'));render();});}
 function bind(){
  host.onclick=async event=>{
   if(event.target.closest('.duty-cell-editor'))return;
   if(S.editing||S.busy||S.confirming)return;
   try{
    const button=event.target.closest('button'),cellEl=event.target.closest('[data-s-code]'),row=event.target.closest('[data-s-column]');
    if(button?.dataset.sGroup){S.group=button.dataset.sGroup;S.selected=[];S.anchor=null;render();return;}
    if(button?.dataset.sMode){S.mode=Number(button.dataset.sMode);S.start=0;S.selected=[];S.anchor=null;render();await loadBoundary();return;}
    if(row){S.selected=employees().map(e=>({code:e.code,date:row.dataset.sColumn}));S.anchor=S.selected[0];render();if(S.anchor)focus(S.anchor.code,S.anchor.date);return;}
    if(cellEl){
     const {sCode:code,sDate:date}=cellEl.dataset;
     select(code,date,event.shiftKey);focus(code,date);
     if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(button?.hasAttribute('data-s-time')||button?.dataset.sHours))edit(code,date,button.dataset.sHours);
     return;
    }
    switch(button?.dataset.sAction){
     case 'back':case 'forward':S.start+=button.dataset.sAction==='back'?-S.mode:S.mode;S.selected=[];S.anchor=null;render();await loadBoundary();break;
     case 'details':details();break;
     case 'copy':copy();break;
     case 'paste':await paste();break;
     case 'undo':await history(false);break;
     case 'redo':await history(true);break;
     case 'reuse':reuse();break;
     case 'next-week':
      if(dates().slice(0,7).some(d=>!monthData(d.date)))throw Error('Wait for adjacent dates to load before copying.');
      await save(employees().flatMap(e=>dates().slice(0,7).map(d=>({code:e.code,date:M.addDays(d.date,7),payload:payload(e.code,d.date)}))),'Copy complete week to next week',true);break;
     case 'month':monthPanel();break;
    }
    if(S.anchor&&!host.querySelector('.duty-cell-editor')&&!document.activeElement.closest('[role=dialog]'))focus(S.anchor.code,S.anchor.date);
   }catch(error){S.notice=error.message||'Duty action could not be completed.';render();}
  };
  host.onchange=async e=>{
   if(e.target.id!=='duty-apply-status'||!e.target.value)return;
   if(!S.selected.length||S.selected.some(c=>!writableDate(c.date))){S.notice='Select editable dates before changing status.';render();return;}
   await save(S.selected.map(c=>({...c,payload:{...payload(c.code,c.date),status:e.target.value,periods:[],manual_minutes:undefined}})),'Set OFF / leave / clear',true);
   render();if(S.anchor)focus(S.anchor.code,S.anchor.date);
  };
  const fromSchedule=e=>!S.editing&&!S.busy&&!S.confirming&&!e.target.closest('input,select,textarea,[contenteditable]');
  host.oncopy=e=>{
   if(!fromSchedule(e)||!S.selected.length)return;
   e.preventDefault();copy();
   if(S.anchor)focus(S.anchor.code,S.anchor.date);
  };
  host.onpaste=async e=>{
   if(!fromSchedule(e)||!S.selected.length||!S.clipboard.length)return;
   e.preventDefault();await paste();
   if(S.anchor)focus(S.anchor.code,S.anchor.date);
  };
  host.onkeydown=async e=>{
   if(!fromSchedule(e))return;
   const k=/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():e.key.toLowerCase();
   if((e.ctrlKey||e.metaKey)&&['c','v','z','y'].includes(k)){
    e.preventDefault();
    if(k==='c'&&S.selected.length)copy();
    if(k==='v')await paste();
    if(k==='z'||k==='y')await history(k==='y'||e.shiftKey);
    if(S.anchor)focus(S.anchor.code,S.anchor.date);
    return;
   }
   const cellEl=e.target.closest('[data-s-code]');if(!cellEl||e.target!==cellEl)return;
   const {sCode:code,sDate:date}=cellEl.dataset;
   if(e.key==='Enter'||e.key==='F2'){e.preventDefault();select(code,date,false);edit(code,date);return;}
   const staff=employees(),days=dates(),x=staff.findIndex(v=>v.code===code),y=days.findIndex(v=>v.date===date);
   const offset={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
   if(!offset)return;
   const next=staff[x+offset[0]]?.code,nextDate=days[y+offset[1]]?.date;
   if(next&&nextDate){e.preventDefault();select(next,nextDate,e.shiftKey);focus(next,nextDate);}
  };
 }
 window.DutySchedule={mount,isEditing:()=>!!S.editing||S.busy||S.confirming,clear(){
  scopeVersion++;periodVersion++;adjacent.clear();clearHistory();
  Object.assign(S,{editing:null,selected:[],anchor:null,clipboard:[],month:'',notice:'',busy:false,confirming:false});
 }};
})();
