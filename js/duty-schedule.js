/* Duty-only scheduler. All persisted writes pass through scoped, versioned RPCs. */
(function(){
 'use strict';
 const M=window.DutyModel,C=window.DutyControls,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const S={range:null,group:'pharmacists',staffPage:0,custom:new Set(),month:'',selected:[],ranges:[],anchor:null,cursor:null,clipboard:[],busy:false,confirming:false,notice:'',editing:null};
 let host,data,options,scopeVersion=0,drag=null,skipClick=false,todayTimer=null;
 const palette=[['blue','Blue'],['mint','Mint'],['violet','Violet'],['rose','Rose'],['','Clear Color']];
 const past=[],future=[],localRevisions=new Map();
 const holidayFirst=()=>options.demo||data.holiday_first===true;
 const settingsEnabled=()=>options.demo||data.persistent_settings===true;
 const canOverride=()=>options.demo||data.manual_hours===true;
 const categoryLabels={...M.categories,basic:'Basic',total:'Total'};
 const dateLabel=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}),dayLabel=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'});
 const formatDate=date=>dateLabel.format(new Date(date+'T12:00Z'));
 const clearHistory=()=>{past.length=0;future.length=0;localRevisions.clear();};
 const key=(code,date)=>code+'|'+date;
 const entry=(code,date)=>data.entries?.find(e=>e.code===code&&e.date===date);
 const payload=(code,date)=>entry(code,date)?.payload||M.normalize();
 function roster(){
  const history=data.entries||[],all=data.employees.filter(e=>e.active||history.some(x=>x.code===e.code&&x.payload.status!=='EMPTY'));
  return M.ordered(all).map(e=>{const h=history.find(x=>x.code===e.code);return h&&!options.demo?{...e,...h.identity}:e;});
 }
 const staffList=()=>roster().filter(e=>S.group==='custom'?S.custom.has(e.code):(e.position_key==='pharmacist')===(S.group==='pharmacists'));
 const employees=()=>staffList().slice(S.staffPage*6,S.staffPage*6+6);
 const hoursFor=(code,date,p)=>M.effectiveHours(date,p,!!holiday(date),data.employees.find(e=>e.code===code),data.hour_rules,holidayFirst());
 const dates=()=>M.calendarRange(S.month,S.range);
 const selected=(code,date)=>S.selected.some(s=>s.code===code&&s.date===date);
 const writable=()=>data.can_write&&!S.busy&&!S.confirming&&!options.loading&&data.month?.status!=='Completed';
 const writableDateForMonth=date=>date.startsWith(S.month+'-');
 const writableDate=date=>writable()&&writableDateForMonth(date);
 const holiday=date=>data.holidays.find(h=>h.date===date&&h.active);
 function rememberScroll(){if(host?.isConnected){const grid=host.querySelector('.duty-grid-scroll');if(grid)S.scroll={left:grid.scrollLeft,top:grid.scrollTop};}}
 function mount(el,d,config){
  rememberScroll();
  host=el;data={entries:[],holidays:[],...d};options=config;
  if(S.month!==config.month){S.scroll={left:0,top:0};S.month=config.month;S.range=null;clearSelection();S.editing=null;S.notice='';}
  render();
 }
 // Display-only local clock: patch the date indicators without replacing cells,
 // moving focus, changing selection, or making schedule/network writes.
 function refreshToday(){
  if(todayTimer!==null){window.clearTimeout?.(todayTimer);todayTimer=null;}
  if(!host?.isConnected)return;
  const today=C.today(),badge=host.querySelector('[data-duty-today]');
  if(badge){badge.querySelector('time').textContent=formatDate(today);badge.querySelector('time').dateTime=today;badge.querySelector('small').textContent=dayLabel.format(new Date(today+'T12:00Z'));badge.setAttribute('aria-label','Today, '+dayLabel.format(new Date(today+'T12:00Z'))+', '+today);}
  for(const button of host.querySelectorAll('[data-s-column]')){
   const current=button.dataset.sColumn===today;
   button.closest('th').classList.toggle('duty-today',current);
   if(current)button.setAttribute('aria-current','date');else button.removeAttribute('aria-current');
  }
  // Saudi Arabia currently uses UTC+03 throughout the year. Re-read the real
  // local date after midnight and after wake/focus (including a clock change).
  if(window.setTimeout){todayTimer=window.setTimeout(refreshToday,Math.max(1000,Date.parse(today+'T00:00:00+03:00')+86400000-Date.now()));todayTimer?.unref?.();}
 }
 window.addEventListener?.('focus',refreshToday);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshToday();});
 function clearSelection(){S.ranges=[];S.selected=[];S.anchor=null;S.cursor=null;S.rowAnchor=null;}
 function render(){
  if(!host?.isConnected)return;
  if(drag?.frame)cancelAnimationFrame(drag.frame);
  drag=null;skipClick=false;
  const scroll=host.querySelector('.duty-grid-scroll'),scrollPosition=scroll?{left:scroll.scrollLeft||0,top:scroll.scrollTop||0}:S.scroll||{left:0,top:0};
  const days=dates(),count=staffList().length,pages=Math.max(1,Math.ceil(count/6));
  S.staffPage=Math.min(S.staffPage,pages-1);
  const staff=employees(),totals=M.totals(data.entries,data.holidays,data.employees,data.hour_rules,holidayFirst());
  const rosterOptions=roster();
  const monthDays=M.days(S.month),first=monthDays[0].date,last=monthDays.at(-1).date;
  const groups=[['pharmacists','Pharmacists'],['support','Labor + Beauty'],['custom','Custom']];
  host.innerHTML=`<div class="duty-schedule-controls"><div class="duty-schedule-navigation">
   ${dropdown('staff','Staff',groups.find(([id])=>id===S.group)[1],groups,S.group)}
   ${S.group==='custom'?dropdown('custom','Choose staff','Choose staff',rosterOptions.map(e=>[e.code,e.name]),S.custom):''}
   <div class="duty-period" aria-label="Staff pages"><button type="button" data-s-action="staff-back" aria-label="Previous staff page" ${S.staffPage?'':'disabled'}>‹</button><span>${S.staffPage+1}/${pages}</span><button type="button" data-s-action="staff-next" aria-label="Next staff page" ${S.staffPage+1<pages?'':'disabled'}>›</button></div>
   <div class="duty-date-range"><button type="button" class="duty-dropdown-trigger" data-range-trigger aria-haspopup="dialog" aria-expanded="false">${S.range?formatDate(S.range.from)+' – '+formatDate(S.range.to):'Date Range'}</button>
   <form data-date-range popover="manual" role="dialog" aria-label="Schedule date range">${C.dateField({id:"duty-schedule-from",name:"from",label:"Start Date",value:S.range?.from||first,min:first,max:last})}${C.dateField({id:"duty-schedule-to",name:"to",label:"End Date",value:S.range?.to||last,min:first,max:last})}<p class="duty-range-error" role="alert"></p><div class="duty-popover-footer"><button type="button" data-range-cancel>Cancel</button><button type="submit" class="duty-primary">Apply</button></div></form></div>
   ${S.range?'<button type="button" data-s-action="full-month">Full Month</button>':''}
   </div><div class="duty-actions duty-selection-tools" role="group" aria-label="Schedule actions">
   <span class="duty-today-badge" data-duty-today><span>Today · <time></time></span><small></small></span><button type="button" data-s-action="apply-shift">Apply Shift</button><button type="button" data-s-action="exchange" title="Exchange selected shifts" disabled>Exchange</button><button type="button" data-s-action="copy">Copy</button><button type="button" data-s-action="paste">Paste</button>
   ${[['delete','Delete','Delete','M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7'],['undo','Undo','Ctrl+Z','M8 4L3 9l5 5M3 9h11a5 5 0 0 1 0 10h-3'],['redo','Redo','Ctrl+Y','M16 4l5 5-5 5m5-5H10a5 5 0 0 0 0 10h3']].map(([id,label,shortcut,path])=>`<button type="button" class="duty-icon duty-icon-${id}" data-s-action="${id}" aria-label="${label}" title="${label} (${shortcut})" ${id==='undo'&&(!past.length||!writable())||id==='redo'&&(!future.length||!writable())?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`).join('')}
   ${dropdown('status','Apply status to selection','Status…',Object.entries({...M.statuses,OTHER_LEAVE:'Unpaid Leave',EMPTY:'Clear Cell'}))}
   <button type="button" data-s-action="color">Cell Color</button></div></div>
   <div class="duty-grid-scroll duty-vertical" tabindex="0" role="region" aria-label="Duty schedule"><table aria-label="Duty schedule" style="min-width:${78+staff.length*148}px">
    <colgroup><col style="width:78px">${staff.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col" class="duty-date-heading">Duty</th>
    ${staff.map(e=>`<th scope="col"><div class="duty-staff-card"><div class="duty-staff-title" title="${esc(e.name)} · ${esc(e.display_code||e.code)}"><span class="duty-name">${esc(M.scheduleLabel(e))}</span><span class="duty-code">${esc(e.display_code||e.code)}${e.active?'':' · inactive'}</span></div><div class="duty-kpi-wrap"><div class="duty-mini-kpis">${Object.entries(categoryLabels).map(([k,label])=>`<span class="duty-category-${k}"><em class="duty-kpi-label">${label}</em> <b>${M.hours(totals[e.code]?.[k]||0)}</b></span>`).join('')}</div></div></div></th>`).join('')}</tr></thead>
    <tbody>${staff.length?days.map(d=>`<tr class="${holiday(d.date)&&(holidayFirst()||!d.friday)?'duty-holiday-row':d.friday?'duty-friday-row':''}"><th scope="row"><button class="duty-date-button" type="button" data-s-column="${d.date}" aria-label="Select ${d.date}"><strong>${formatDate(d.date)}</strong><span>${dayLabel.format(new Date(d.date+'T12:00Z'))}</span>${holiday(d.date)?`<small>${esc(holiday(d.date).name||'Holiday')}</small>`:''}</button></th>${staff.map(e=>cell(e,d)).join('')}</tr>`).join(''):`<tr><td class="duty-empty">${options.loading?'Loading Duty…':'No employees in this view'}</td></tr>`}</tbody></table></div>
   <div class="duty-footnote"><span role="status">${esc(S.notice||(options.loading?'Loading selected month…':'Double-click to edit · Drag to select a range'))}</span></div>`;
  const grid=host.querySelector('.duty-grid-scroll');
  grid.scrollTo?.(scrollPosition);
  bind();C.bindCalendars(host);C.fitViewport(host);updateSelection();refreshToday();
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
 // Keep explicit gesture ranges: adjacent/overlapping ranges must never be inferred
 // from their union, and a third gesture must not silently select an arbitrary pair.
 function rectangle(from,to){
  const staff=employees(),ds=dates(),a=staff.findIndex(e=>e.code===from.code),b=staff.findIndex(e=>e.code===to.code),x=ds.findIndex(d=>d.date===from.date),y=ds.findIndex(d=>d.date===to.date);
  if([a,b,x,y].some(i=>i<0))return [];
  const cells=[];
  for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(x,y);j<=Math.max(x,y);j++)cells.push({code:staff[i].code,date:ds[j].date});
  return cells;
 }
 function setRanges(ranges){
  if(S.notice==='Select two equal ranges to exchange shifts.')S.notice='';
  S.ranges=ranges.filter(r=>r.length);
  S.selected=[...new Map(S.ranges.flat().map(c=>[key(c.code,c.date),c])).values()];
 }
 function selectRectangle(from,to,base=[]){
  setRanges([...base,rectangle(from,to)]);S.anchor=from;S.cursor=to;S.rowAnchor=null;updateSelection();
 }
 function select(code,date,range,toggle=false){
  S.rowAnchor=null;
  const target={code,date};
  if(toggle){
   if(selected(code,date))setRanges(S.ranges.map(r=>r.filter(c=>c.code!==code||c.date!==date)));
   else setRanges([...S.ranges,[target]]);
   S.anchor=target;
  }else if(range&&S.anchor){selectRectangle(S.anchor,target);return;}
  else {setRanges([[target]]);S.anchor=target;}
  S.cursor=target;updateSelection();
 }
 function exchangeRanges(){
  if(S.ranges.length!==2)return null;
  const shaped=S.ranges.map(r=>{
   const codes=[...new Set(r.map(c=>c.code))],ds=[...new Set(r.map(c=>c.date))].sort();
   const ordered=rectangle({code:codes[0],date:ds[0]},{code:codes.at(-1),date:ds.at(-1)});
   const keys=new Set(r.map(c=>key(c.code,c.date)));
   return ordered.length===r.length&&ordered.every(c=>keys.has(key(c.code,c.date)))?{cells:ordered,width:codes.length,height:ds.length}:null;
  });
  const [a,b]=shaped;
  if(!a||!b||a.width!==b.width||a.height!==b.height)return null;
  const keys=new Set(a.cells.map(c=>key(c.code,c.date)));
  if(b.cells.some(c=>keys.has(key(c.code,c.date))))return null;
  if([...a.cells,...b.cells].some(c=>!writableDate(c.date)||!data.employees.some(e=>e.code===c.code)))return null;
  return [a.cells,b.cells];
 }
 async function exchange(){
  const ranges=exchangeRanges();
  if(!ranges){S.notice='Select two equal ranges to exchange shifts.';render();return;}
  const [a,b]=ranges,changes=[];
  for(let i=0;i<a.length;i++){
   // Only payloads travel. Identity/date/revision belong to each destination.
   // Automatic hours are projected at that destination; explicit manual keys stay explicit.
   changes.push({...a[i],payload:M.normalize(payload(b[i].code,b[i].date))},
    {...b[i],payload:M.normalize(payload(a[i].code,a[i].date))});
  }
  await save(changes,'Exchange Duty shifts');
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
  S.ranges=S.selected.length?[S.selected.slice()]:[];
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
  const rangeKeys=S.ranges.map(range=>new Set(range.map(c=>key(c.code,c.date))));
  const rangeFor=td=>td?.hasAttribute('data-s-code')?rangeKeys.findIndex(keys=>keys.has(key(td.dataset.sCode,td.dataset.sDate))):-1;
  const isSelected=td=>td?.hasAttribute('data-s-code')&&keys.has(key(td.dataset.sCode,td.dataset.sDate));
  for(const td of cells){
   const {sCode:code,sDate:date}=td.dataset,active=isSelected(td),row=td.parentElement;
   td.classList.toggle('duty-range-b',active&&S.ranges[1]?.some(c=>c.code===code&&c.date===date));
   td.classList.toggle('duty-selected',active);td.setAttribute('aria-selected',String(active));
   const sameRange=other=>isSelected(other)&&rangeFor(other)===rangeFor(td);
   td.classList.toggle('duty-edge-top',active&&!sameRange(row.previousElementSibling?.children[td.cellIndex]));
   td.classList.toggle('duty-edge-bottom',active&&!sameRange(row.nextElementSibling?.children[td.cellIndex]));
   td.classList.toggle('duty-edge-left',active&&!sameRange(td.previousElementSibling));
   td.classList.toggle('duty-edge-right',active&&!sameRange(td.nextElementSibling));
   td.tabIndex=(S.cursor?code===S.cursor.code&&date===S.cursor.date:td===cells[0])?0:-1;
  }
  const hasSelection=!!S.selected.length&&!S.editing;
  const canEdit=hasSelection&&S.selected.every(c=>writableDate(c.date));
  const tools=host.querySelector('.duty-selection-tools');
  tools.querySelector('[data-s-action="apply-shift"]').disabled=!canEdit||!data.shift_presets?.length;
  tools.querySelector('[data-s-action="exchange"]').disabled=!canEdit||!exchangeRanges();
  const notice=host.querySelector('.duty-footnote [role=status]');
  if((S.ranges.length>2||(S.ranges.length===2&&canEdit&&!exchangeRanges()))&&notice)notice.textContent='Select two equal ranges to exchange shifts.';
  else if(notice)notice.textContent=S.notice||(options.loading?'Loading selected month…':'Double-click to edit · Ctrl + Drag to add a range');
  tools.querySelector('[data-s-action="copy"]').disabled=!hasSelection;
  tools.querySelector('[data-s-action="paste"]').disabled=!canEdit||!S.clipboard.length;
  tools.querySelector('[data-s-action="delete"]').disabled=!canEdit;
  tools.querySelector('[data-dropdown-trigger=status]').disabled=!canEdit;
  host.querySelector('[data-s-action="color"]').disabled=!canEdit;
 }
 function timeFields(periods,hasTimes){
  const picker=(name,value)=>{
   const parts=M.formatTime(value).split(/[: ]/);
   const choices=[Array.from({length:12},(_,i)=>String(i+1)),[...new Set(['00','30',parts[1]])].sort(),['AM','PM']];
   return `<div class="duty-time-controls" role="group" aria-label="${name}">${['Hour','Minute','AM/PM'].map((part,i)=>
    dropdown(name.replaceAll(' ','-')+'-'+i,name+' '+part,parts[i],choices[i].map(v=>[v,v]),parts[i],i===1?'duty-time-minute':i===2?'duty-time-meridiem duty-meridiem-'+parts[i].toLowerCase():'')).join('')}</div>`;
  };
  const row=(p,i)=>`<div class="duty-time-fields"><strong>${i===1?'First shift':'Second shift'}</strong><span>IN</span>${picker('Shift '+i+' In',p.start)}<span>OUT</span>${picker('Shift '+i+' Out',p.end)}</div>`;
  return `<label><input type="checkbox" name="hasTimes" ${hasTimes?'checked':''}> Use IN / OUT</label><div data-time-fields ${hasTimes?'':'hidden'}>${row(periods[0]||{start:540,end:1080},1)}<label><input type="checkbox" name="split" ${periods.length===2?'checked':''}> Add second shift</label><div data-split-fields ${periods.length===2?'':'hidden'}>${row(periods[1]||{start:1020,end:1320},2)}</div></div>`;
 }
 function readTimes(fields){
  if(!fields.has('hasTimes'))return [];
  const time=(i,end)=>{
   const parts=[0,1,2].map(part=>fields.get(`Shift-${i}-${end}-${part}`));
   return M.time(parts[0]+':'+parts[1]+' '+parts[2]);
  };
  return (fields.has('split')?[1,2]:[1]).map(i=>({start:time(i,'In'),end:time(i,'Out')}));
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
   <div class="duty-editor-body"><fieldset class="duty-editor-section"><legend>Status</legend><label class="duty-editor-status"><select name="status" aria-label="Duty status">${(longLeave?[status,'WORK','OFF']:['WORK','OFF']).map(k=>`<option value="${k}" ${k===status?'selected':''}>${k==='OTHER_LEAVE'?'Unpaid Leave':M.statuses[k]}</option>`).join('')}</select></label></fieldset>
   <fieldset class="duty-work-fields" data-work-fields ${status==='WORK'?'':'hidden disabled'}><fieldset class="duty-editor-section duty-shift-section"><legend>Shift Times</legend>${presetSelect(data.employees.find(e=>e.code===code)?.position_key)}<div data-editor-times>${timeFields(before.periods,initial.hasTimes)}</div></fieldset>
   ${manualEnabled?`<fieldset class="duty-allocation"><legend>Hours Calculation</legend><div>${['Auto','Manual'].map(label=>`<label><input type="radio" name="allocation" value="${label.toLowerCase()}" ${initial.allocation===label.toLowerCase()?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>
   <div class="duty-auto-summary" data-auto-hours aria-live="polite"></div>
   <fieldset class="duty-manual-fields" ${before.manual_minutes?'':'hidden disabled'}><legend>Manual allocation</legend>
    ${Object.entries(M.categories).map(([k,label])=>`<label>${label}<input name="${k}" type="number" min="0" max="24" step="any" value="${effective[k]/60}"></label>`).join('')}
    <small data-hours-difference aria-live="polite"></small></fieldset>`:''}</fieldset>
   <label class="duty-editor-note">Notes <input placeholder="Optional note" name="note" maxlength="300" value="${esc(before.note)}"></label></div><span class="duty-cell-error" role="alert"></span><div class="duty-actions duty-editor-footer"><button type="button" data-cancel>Cancel</button><button type="submit" class="duty-primary">Save</button></div>
   `;
  const backdrop=document.createElement('div');backdrop.className='duty-editor-backdrop';backdrop.append(editor);host.append(backdrop);
  const positionEditor=()=>{};
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
     auto.innerHTML=Object.entries(categoryLabels).map(([k,label])=>`<span class="duty-category-${k}">${label}<b>${M.hours(n[k])} h</b></span>`).join('');
    }catch{auto.textContent='Check the selected times.';}
    return;
   }
   try{
    const manual=Object.keys(M.categories).reduce((sum,k)=>sum+M.hourMinutes(editor.elements[k].value||'0'),0);
    const duration=currentAuto().total,delta=manual-duration;
    output.textContent=`Total ${M.hours(manual)} h${delta&&editor.elements.hasTimes.checked?' · '+(delta>0?'+':'−')+M.hours(Math.abs(delta))+' h vs IN / OUT':''}`;
   }catch{output.textContent='Check the times and manual hours.';}
  };
  wireDropdowns(editor,(id,button,trigger)=>{
   editor.elements[id].value=button.dataset.dropdownValue;
   trigger.textContent=button.textContent;
   if(id.endsWith('-2'))trigger.dataset.meridiem=button.dataset.dropdownValue;
   trigger.setAttribute('aria-label',trigger.dataset.label+': '+button.textContent);
   for(const option of button.parentElement.querySelectorAll('[aria-pressed]'))option.setAttribute('aria-pressed',String(option===button));
   difference();
  });
  const quick=editor.querySelector('[data-preset-select]');
  if(quick)quick.onchange=()=>{
   const preset=(data.shift_presets||[]).find(p=>p.id===quick.value);if(!preset||!M.presetEligible(preset,[data.employees.find(e=>e.code===code)?.position_key]))return;
   editor.querySelector('[data-editor-times]').innerHTML=timeFields(preset.periods,true);
   wireDropdowns(editor.querySelector('[data-editor-times]'),(id,button,trigger)=>{
    editor.elements[id].value=button.dataset.dropdownValue;trigger.textContent=button.textContent;
    if(id.endsWith('-2'))trigger.dataset.meridiem=button.dataset.dropdownValue;difference();
   });
   difference();
  };
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
    const workingPending=status==='WORK'&&!periods.length&&!Object.keys(manual).length&&(options.demo||data.working_pending===true);
    if(status==='WORK'&&!periods.length&&!Object.keys(manual).length&&!workingPending)throw Error('Enter working times before saving.');
    const next=M.normalize({...before,status,periods,manual_minutes:manual,working_pending:workingPending,note:fields.get('note')});
    button.disabled=true;editor.querySelector('[role=alert]').textContent='Saving…';
    if(await save([{code,date,payload:next,expected_revision:revision}],'Edit Duty cell'))finish();
    else if(editor.isConnected)editor.querySelector('[role=alert]').textContent=S.notice;
   }catch(error){editor.querySelector('[role=alert]').textContent=error.message;}
   finally{button.disabled=false;}
  };
  editor.elements.status.focus();
 }
 async function save(changes,reason,confirmOverwrite=false,record=true,presetContext=null){
  if(!writable())return false;
  const version=scopeVersion,config=options;
  S.busy=true;S.notice='Saving…';const pending=host.querySelector('.duty-footnote [role=status]');if(pending)pending.textContent=S.notice;
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
   const next=await (presetContext&&config.applyPreset?config.applyPreset(normalized,reason,presetContext):config.save(normalized,reason));
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
   if(version===scopeVersion)S.notice=String(error.message).includes('DUTY_CONFLICT')?'Conflict: this edit was not saved. Copy your draft, cancel and refresh before retrying.':('Save not confirmed. Your draft is retained. '+error.message);
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
 function copy(){
  S.clipboard=S.selected.map(s=>{
   const p=payload(s.code,s.date);
   return {...s,payload:M.clipboardPayload(p,p.manual_minutes?hoursFor(s.code,s.date,p):undefined)};
  });
  S.notice=`Copied ${S.clipboard.length} cell${S.clipboard.length===1?'':'s'}. Select a destination and Paste.`;render();
 }
 async function paste(){
  const first=S.selected[0],source=S.clipboard;if(!first||!source.length)return;

  const staff=employees(),sourceCodes=[...new Set(source.map(s=>s.code))],base=source.map(s=>s.date).sort()[0],destIndex=staff.findIndex(e=>e.code===first.code);
  const changes=source.length===1?S.selected.map(c=>({...c,payload:source[0].payload})):source.map(s=>({code:staff[destIndex+sourceCodes.indexOf(s.code)]?.code,date:M.addDays(first.date,Math.round((Date.parse(s.date)-Date.parse(base))/86400000)),payload:s.payload}));
  const targets=new Set(S.selected.map(c=>key(c.code,c.date)));
  if(changes.some(c=>!c.code||!dates().some(d=>d.date===c.date)||!writableDate(c.date))||
     (targets.size>1&&(targets.size!==changes.length||changes.some(c=>!targets.has(key(c.code,c.date)))))){
   S.notice='Select a top-left cell or a matching rectangle on this staff page.';render();return;
  }
  const warning=changes.some(({code,date,payload:p})=>{
   if(!p.manual_minutes)return false;
   const auto=hoursFor(code,date,{...p,manual_minutes:undefined});
   return Object.keys(M.categories).some(k=>p.manual_minutes[k]!==auto[k]);
  });
  if(await save(changes,source.length===1?'Paste Duty cells':'Paste schedule range')&&warning){
   S.notice+=' Manual hours retained and may differ from the destination’s automatic classification.';
   render();
  }
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
 function smallPanel(title,body,onSubmit,label,lifecycle){
  return options.panel(title,body,onSubmit,label,lifecycle);
 }
 function color(){
  const targets=S.selected.map(c=>({...c,payload:payload(c.code,c.date),expected_revision:entry(c.code,c.date)?.revision||0}));
  if(!targets.length)return;
  smallPanel('Cell Color',`<label class="duty-field">Color<select name="color">${palette.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`,async fields=>{
   if(!await save(targets.map(c=>({...c,payload:{...c.payload,highlight:fields.get('color')}})),'Set Duty cell color'))throw Error(S.notice||'Selection is read only.');
  });
 }
 function positionChips(keys){return (keys.length?keys:[null]).map(key=>`<span class="duty-position-chip ${key?'duty-position-'+M.positionTone(key):'duty-position-neutral'}">${esc(key?data.positions.find(p=>p.key===key)?.label||'Position unavailable':'All Positions')}</span>`).join('');}
 function presetHours(preset){return `<span class="duty-preset-hours"><span>Total <b>${M.hours(M.presetDuration(preset))}h</b></span><small>Basic / OT by duty date and employee</small></span>`;}
 function presetSelect(positionKey){return `<label class="duty-field">Quick Shift<select data-preset-select name="preset"><option value="">Select shift…</option>${(data.shift_presets||[]).filter(p=>M.presetEligible(p,[positionKey])).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${M.hours(M.presetDuration(p))}h</option>`).join('')}</select></label>`;}
 function applyShift(){
  if(!writable()||!S.selected.length)return;
  const version=scopeVersion,targets=S.selected.map(c=>({...c,expected_revision:entry(c.code,c.date)?.revision||0})),settingsRevision=data.settings_revision;
  const keys=[...new Set(targets.map(c=>data.employees.find(e=>e.code===c.code)?.position_key))];
  const compatible=(data.shift_presets||[]).filter(p=>M.presetEligible(p,keys));
  const count=targets.filter(c=>payload(c.code,c.date).status!=='EMPTY').length;
  const form=smallPanel('Apply Shift',`<div class="duty-position-context">${positionChips(keys)}</div>${dropdown('preset','Shift','Choose shift',compatible.map(p=>[p.id,p.name]))}<div class="duty-preset-hours" data-apply-hours aria-live="polite"></div><p class="duty-apply-summary">${targets.length} cells · ${count?count+' existing entries will be replaced':'No existing shifts to replace'}</p>${!compatible.length?'<p class="duty-cell-error">No preset applies to every selected position. Edit a preset’s positions or change the selection.</p>':''}`,async fields=>{
   if(version!==scopeVersion)throw Error('Duty context changed. Reopen Apply Shift.');
   const preset=(data.shift_presets||[]).find(p=>p.id===fields.get('preset'));if(!preset)throw Error('Select a shift.');
   if(!M.presetEligible(preset,keys))throw Error('This preset does not apply to every selected position.');
   if(targets.some(c=>!writableDate(c.date)||!data.employees.some(e=>e.code===c.code)))throw Error('Selection is not editable.');
   const changes=targets.map(c=>({...c,payload:M.normalize({status:'WORK',periods:preset.periods,note:payload(c.code,c.date).note,highlight:payload(c.code,c.date).highlight})}));
   if(!await save(changes,'Apply shift preset',true,true,{id:preset.id,revision:settingsRevision}))throw Error(S.notice||'Shift not saved.');
  },'Apply');
  form.querySelector('[type=submit]')?.toggleAttribute('disabled',!compatible.length);
  wireDropdowns(form,(id,button,trigger)=>{
   form.elements[id].value=button.dataset.dropdownValue;const preset=compatible.find(p=>p.id===button.dataset.dropdownValue);trigger.textContent=preset?.name||button.textContent;
   trigger.setAttribute('aria-label','Shift: '+(preset?preset.name+' · '+M.text({status:'WORK',periods:preset.periods}):button.textContent));
   if(preset){const totals={basic:0,normal_ot:0,friday_ot:0,holiday_ot:0,total:0};for(const cell of targets){const n=hoursFor(cell.code,cell.date,M.normalize({status:'WORK',periods:preset.periods}));for(const key in totals)totals[key]+=n[key];}
    form.querySelector('[data-apply-hours]').innerHTML=`<span>Total <b>${M.hours(totals.total)}h</b></span><span>Basic <b>${M.hours(totals.basic)}h</b></span>${['normal_ot','friday_ot','holiday_ot'].filter(k=>totals[k]).map(k=>`<span data-ot>${categoryLabels[k]} <b>${M.hours(totals[k])}h</b></span>`).join('')}<small>Selected cells · automatic destination rules</small>`;
   }
  });
 }
 let presetGroup='all';
 function managePresets(){
  const rows=structuredClone(data.shift_presets||[]),version=scopeVersion,revision=data.settings_revision;
  const groups=M.ordered(data.positions);
  const eligible=p=>presetGroup==='all'||M.presetEligible(p,[presetGroup]);
  const form=smallPanel('Shift Presets',`<nav class="duty-preset-tabs" aria-label="Preset positions"><button type="button" data-preset-group="all" aria-pressed="${presetGroup==='all'}">All</button>${groups.map(g=>`<button type="button" class="duty-position-chip duty-position-${M.positionTone(g.key)}" data-preset-group="${esc(g.key)}" aria-pressed="${presetGroup===g.key}">${esc(g.label)}</button>`).join('')}</nav><div data-preset-list>${rows.map((p,i)=>eligible(p)?`<div class="duty-list-row"><span class="duty-preset-description"><strong>${esc(p.name)}</strong><span class="duty-position-context">${positionChips(M.presetPositions(p))}</span>${p.periods.map(t=>`<small>${esc(M.formatTime(t.start))} – ${esc(M.formatTime(t.end))}</small>`).join('')}${presetHours(p)}</span><div class="duty-actions"><button type="button" data-preset-edit="${i}">Edit</button><button type="button" data-preset-delete="${i}" class="duty-delete-action"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/></svg>Delete</button></div></div>`:'').join('')||'<p>No presets for this position.</p>'}</div><button type="button" data-preset-add>Add Shift Preset</button>`);
  form.onclick=async e=>{const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-preset-group')){presetGroup=b.dataset.presetGroup;managePresets();return;}
   if(b.hasAttribute('data-preset-delete')){try{if(version!==scopeVersion||!writable())throw Error('Reopen settings.');const i=+b.dataset.presetDelete;if(!await options.confirm(`Delete preset ${rows[i].name}? Saved duties will remain unchanged.`,'Delete'))return;data=await options.presets(rows.filter((_,index)=>index!==i),revision);managePresets();}catch(error){form.querySelector('[role=alert]').textContent=error.message;}return;}
   if(!b.hasAttribute('data-preset-add')&&!b.hasAttribute('data-preset-edit'))return;
   const i=b.hasAttribute('data-preset-edit')?+b.dataset.presetEdit:-1,p=rows[i],positionKeys=M.presetPositions(p);
   const editForm=smallPanel(p?'Edit Shift Preset':'New Shift Preset',`<label class="duty-field">Name<input name="name" maxlength="40" required value="${esc(p?.name||'')}"></label><fieldset class="duty-preset-positions"><legend>Applicable positions</legend><label><input type="checkbox" name="preset-all" ${!positionKeys.length?'checked':''}> All Positions</label><div data-position-options>${groups.filter(g=>g.active||positionKeys.includes(g.key)).map(g=>`<label class="duty-position-chip duty-position-${M.positionTone(g.key)}"><input type="checkbox" name="preset-position" value="${esc(g.key)}" ${positionKeys.includes(g.key)?'checked':''}> ${esc(g.label)}${g.active?'':' (inactive)'}</label>`).join('')}</div></fieldset>${timeFields(p?.periods||[],true)}<div class="duty-preset-hours" data-preset-duration aria-live="polite"></div>`,async fields=>{
    if(version!==scopeVersion||!writable())throw Error('Reopen settings.');
    const positions=fields.has('preset-all')?[]:fields.getAll('preset-position');if(!fields.has('preset-all')&&!positions.length)throw Error('Choose a position or All Positions.');
    const value={...p,id:p?.id||crypto.randomUUID(),name:fields.get('name').trim(),periods:M.normalize({status:'WORK',periods:readTimes(fields)}).periods,positions};
    if(!value.name)throw Error('Enter a name.');const next=rows.slice();if(i<0)next.push(value);else next[i]=value;
    data=await options.presets(next,revision);render();managePresets();
   },'Save Preset',{onCancel:managePresets});
   const duration=()=>{try{editForm.querySelector('[data-preset-duration]').innerHTML=presetHours({periods:readTimes(new FormData(editForm))});}catch{editForm.querySelector('[data-preset-duration]').textContent='Choose valid IN / OUT times.';}};
   wireDropdowns(editForm,(id,button,trigger)=>{editForm.elements[id].value=button.dataset.dropdownValue;trigger.textContent=button.textContent;if(id.endsWith('-2'))trigger.dataset.meridiem=button.dataset.dropdownValue;duration();});
   const positionsState=()=>{for(const checkbox of editForm.querySelectorAll('[name=preset-position]'))checkbox.disabled=editForm.elements['preset-all'].checked;};
   editForm.onchange=e=>{if(e.target.name==='split')editForm.querySelector('[data-split-fields]').hidden=!e.target.checked;if(e.target.name==='hasTimes')editForm.querySelector('[data-time-fields]').hidden=!e.target.checked;if(e.target.name==='preset-all')positionsState();duration();};
   positionsState();duration();
  };
 }
 function dayType(){
  const {from:initial,to:end}=M.selectedDateRange(S.selected,S.month);
  const rangeNotice=!initial?'<p>Selection contains gaps. Choose the exact date range to update.</p>':'';
  const form=smallPanel('Calendar settings',`<div class="duty-settings-action"><span>Saved shifts</span><button type="button" data-manage-presets>Shift Presets</button></div>${rangeNotice}<div class="duty-detail-grid"><label class="duty-field">${settingsEnabled()?'From date':'Date'}<input name="from" type="date" required value="${initial}" ${settingsEnabled()?'':`min="${S.month}-01" max="${M.days(S.month).at(-1).date}"`}></label>
   ${settingsEnabled()?`<label class="duty-field">To date<input name="to" type="date" required value="${end}"></label>`:''}</div>
   <label class="duty-field">Type<select name="type"><option value="normal">Calendar default</option><option value="holiday">Public holiday</option></select></label>
   ${settingsEnabled()?`<label class="duty-field">Holiday name<input name="holiday_name" autocomplete="off" maxlength="80" placeholder="Eid Al-Fitr"></label><label class="duty-field">Note<input name="holiday_note" autocomplete="off" maxlength="300"></label>`:''}`,async fields=>{
   if(!writable())throw Error('Calendar is read only.');
   const from=fields.get('from'),to=fields.get('to')||from,active=fields.get('type')==='holiday',name=active?fields.get('holiday_name')?.trim():'';
   if(settingsEnabled()&&active&&!name)throw Error('Enter a holiday name.');
   data=await options.holiday(M.dateRange(from,to),active,name,active?fields.get('holiday_note')?.trim():'');render();
  },'Save');
  form.classList.add('duty-calendar-settings');
  form.querySelector('[data-manage-presets]').onclick=managePresets;
  const sync=()=>{const row=data.holidays.find(h=>h.date===form.elements.from.value);form.elements.type.value=row?.active?'holiday':'normal';if(settingsEnabled()){form.elements.holiday_name.value=row?.active?row.name||'':'';form.elements.holiday_note.value=row?.active?row.note||'':'';}};
  const holidayFields=()=>{if(!settingsEnabled())return;const active=form.elements.type.value==='holiday';for(const name of ['holiday_name','holiday_note']){form.elements[name].disabled=!active;if(!active)form.elements[name].value='';}};
  form.elements.type.onchange=holidayFields;
  form.elements.from.onchange=()=>{if(settingsEnabled()&&(!form.elements.to.value||form.elements.to.value<form.elements.from.value))form.elements.to.value=form.elements.from.value;sync();holidayFields();};sync();holidayFields();
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
     if(!bulk){data=await options.saveBasic(minutes);message.textContent='Saved for new employees. Existing employees keep their own defaults.';return;}
     const count=updates.length;
     if(!count){message.textContent='No active employee defaults need changing.';return;}
     const scope=updates.map(({employee:e})=>`${e.name} (${e.display_code||e.code})`).join(', ');
     if(!await options.confirm(`Apply ${M.hours(minutes)} h Basic from ${timing} to ${count} active employee${count===1?'':'s'}: ${scope}. Auto hours on or after this date may recalculate. Earlier shifts, Manual allocations, and higher-priority rules are preserved.`,'Apply'))return;
     data=await options.saveBasic(minutes,updates);
     message.textContent=`Updated ${count} employee defaults. Effective: ${timing}.`;
    }catch(error){message.textContent=error.message;}
    return;
   }
   if(button.hasAttribute('data-rule-add'))editRule();
   if(button.hasAttribute('data-rule-edit'))editRule(Number(button.dataset.ruleEdit));
   if(button.hasAttribute('data-rule-delete')){
    const i=Number(button.dataset.ruleDelete);
    if(!await options.confirm('Delete '+rules[i].name+'?','Delete'))return;
    data=await options.hourRules(rules.filter((_,index)=>index!==i));render();hourRules();
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
   data=await options.hourRules([...rules.filter((_,i)=>i!==index),{name,start,end,codes,basic:M.hourMinutes(fields.get('basic'))}]);
   render();hourRules();
  },'Save');
  form.querySelector('[name="scope"]').onchange=e=>{form.querySelector('[data-rule-staff]').hidden=e.target.value==='all';};
 }
 function dropdown(id,label,text,items,selection,variant=''){
  const multiple=selection instanceof Set;
  const itemMarkup=items.map(([value,name])=>multiple
   ?`<label class="duty-dropdown-option"><input type="checkbox" value="${esc(value)}" ${selection.has(value)?'checked':''}> ${esc(name)}</label>`
   :`<button type="button" class="duty-dropdown-option" data-dropdown-value="${esc(value)}" ${id.startsWith('Shift-')&&id.endsWith('-2')?`data-meridiem="${esc(value)}"`:''} ${selection===undefined?'':`aria-pressed="${selection===value}"`}>${id==='preset'?`<strong>${esc((data.shift_presets||[]).find(p=>p.id===value)?.name||name)}</strong>${((data.shift_presets||[]).find(p=>p.id===value)?.periods||[]).map(t=>`<small>${esc(M.formatTime(t.start))} – ${esc(M.formatTime(t.end))}</small>`).join('')}<small class="duty-preset-duration">Total ${M.hours(M.presetDuration((data.shift_presets||[]).find(p=>p.id===value)))}h</small>`:esc(name)}</button>`).join('');
  return `<div class="duty-dropdown ${variant}"><button type="button" class="duty-dropdown-trigger" data-dropdown-trigger="${id}" ${id.startsWith('Shift-')&&id.endsWith('-2')?`data-meridiem="${esc(text)}"`:''} popovertarget="duty-dropdown-${id}" aria-haspopup="dialog" data-label="${esc(label)}" aria-label="${esc(label+(id==='staff'||id.startsWith('Shift-')?': '+text:''))}">${esc(text)}</button>${id.startsWith('Shift-')||id==='preset'?`<input type="hidden" name="${id}" value="${esc(id==='preset'?'':text)}">`: ''}
   <div class="duty-dropdown-popup ${id.startsWith('Shift-')?'duty-time-popup':''}" popover="auto" id="duty-dropdown-${id}" role="dialog" aria-label="${esc(label)}">${itemMarkup||'No employees'}${multiple&&options.demo?'<button type="button" data-save-custom>Save as Default Custom View</button>':''}</div></div>`;
 }
 function wireDropdowns(container,choose){
  for(const popup of container.querySelectorAll('.duty-dropdown-popup')){
   const trigger=popup.parentElement.querySelector('[data-dropdown-trigger]'),id=trigger.dataset.dropdownTrigger;
   const controls=()=>[...popup.querySelectorAll('button,input')];
   trigger.onclick=e=>{
    e.preventDefault();
    if(popup.matches(':popover-open')){popup.hidePopover();return;}
    C.openPopover(popup,trigger,id.startsWith('Shift-')||id==='preset');
    (popup.querySelector('[aria-pressed=true]')||controls()[0])?.focus();
   };
   popup.onkeydown=e=>{
    const items=controls(),index=items.indexOf(e.target);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();popup.hidePopover();trigger.focus();return;}
    const next={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:items.length-1}[e.key];
    if(next===undefined||!items.length)return;
    e.preventDefault();items[(next+items.length)%items.length].focus();
   };
   popup.onclick=async e=>{
    const button=e.target.closest('button');if(!button)return;
    popup.hidePopover();
    await choose(id,button,trigger);
    container.querySelector(`[data-dropdown-trigger="${id}"]:not(:disabled)`)?.focus();
   };
   if(id==='custom')popup.onchange=e=>{
    const {value,checked}=e.target;
    if(checked)S.custom.add(value);else S.custom.delete(value);
    S.staffPage=0;clearSelection();render();
    const replacement=host.querySelector('#duty-dropdown-custom');
    replacement.previousElementSibling.click();
    [...replacement.querySelectorAll('input')].find(input=>input.value===value)?.focus();
   };
  }
 }
 function bind(){
  const rangeForm=host.querySelector('[data-date-range]'),rangeTrigger=host.querySelector('[data-range-trigger]');
  const closeRange=()=>{rangeForm.hidePopover?.();rangeTrigger.setAttribute('aria-expanded','false');rangeTrigger.focus();};
  rangeTrigger.onclick=()=>{
   const first=M.days(S.month)[0].date,last=M.days(S.month).at(-1).date;
   rangeForm.querySelector('[name=from]').value=S.range?.from||first;rangeForm.querySelector('[name=to]').value=S.range?.to||last;
   for(const input of rangeForm.querySelectorAll('[data-calendar-for]'))input.firstChild.textContent=formatDate(rangeForm.querySelector('#'+input.dataset.calendarFor).value);
   rangeForm.querySelector('[role=alert]').textContent='';C.openPopover(rangeForm,rangeTrigger);rangeTrigger.setAttribute('aria-expanded','true');
  };
  rangeForm.querySelector('[data-range-cancel]').onclick=closeRange;
  rangeForm.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRange();}};

  host.onclick=async event=>{
   if(event.target.closest('.duty-cell-editor,.duty-date-range,.duty-calendar-popover,.duty-dropdown,select'))return;
   if(S.editing||S.busy||S.confirming)return;
   try{
    const button=event.target.closest('button'),cellEl=event.target.closest('[data-s-code]'),row=event.target.closest('[data-s-column]');
    if(row){if(!skipClick){selectRows(row.dataset.sColumn,event.shiftKey,event.ctrlKey||event.metaKey);focusSelection();}return;}
    if(cellEl){
     if(skipClick)return;
     const {sCode:code,sDate:date}=cellEl.dataset;
     select(code,date,event.shiftKey,event.ctrlKey||event.metaKey);focusSelection();return;
    }
    switch(button?.dataset.sAction){
     case 'apply-shift':applyShift();break;
     case 'exchange':await exchange();break;
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
   else selectRectangle({code:drag.start.dataset.sCode,date:drag.start.dataset.sDate},{code:target.dataset.sCode,date:target.dataset.sDate},drag.base);
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
   if(event.ctrlKey||event.metaKey)event.preventDefault();
   drag={base:event.ctrlKey||event.metaKey?S.ranges.map(r=>r.slice()):[],id:event.pointerId,start:target,last:target,row:!!dateButton,moved:false,x:event.clientX,y:event.clientY};
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
    else selectRectangle({code:drag.start.dataset.sCode,date:drag.start.dataset.sDate},{code:drag.start.dataset.sCode,date:drag.start.dataset.sDate},drag.base);
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
   try{M.dateRange(from,to);if(!writableDateForMonth(from)||!writableDateForMonth(to))throw Error();}catch{rangeForm.querySelector('[role=alert]').textContent='Choose valid dates within the selected month in order.';return;}
   S.range={from,to};S.notice='';clearSelection();render();
  };
  wireDropdowns(host,async(id,button)=>{
   if(button.hasAttribute('data-save-custom')){
    options.saveCustom([...S.custom]);S.notice='Default Custom View saved for this demo session.';render();
   }else if(id==='staff'){
    S.group=button.dataset.dropdownValue;
    if(S.group==='custom'&&options.demo){const saved=options.loadCustom();if(saved)S.custom=new Set(saved);}
    S.staffPage=0;clearSelection();render();
   }else await applyStatus(button.dataset.dropdownValue);
  });
  bindKeyboard();
 }
 async function applyStatus(status){
   if(status==='WORK'&&!options.demo&&!data.working_pending){
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
  const fromSchedule=e=>!S.editing&&!S.busy&&!S.confirming&&!e.target.closest('input,select,textarea,[contenteditable],.duty-dropdown,.duty-calendar-popover,.duty-date-range');
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
 window.DutySchedule={mount,rememberScroll,isMounted:(el,month)=>host===el&&!!host?.isConnected&&S.month===month,calendar:dayType,rules(d,config){host=null;data=d;options=config;S.month=config.month;hourRules();},isEditing:()=>{if(S.editing&&!host?.querySelector('.duty-cell-editor')?.isConnected)S.editing=null;return !!S.editing||S.busy||S.confirming||!!(drag?.moved&&host?.hasPointerCapture?.(drag.id));},clear(keepClipboard=false){
  if(drag?.frame)cancelAnimationFrame(drag.frame);
  if(todayTimer!==null){window.clearTimeout?.(todayTimer);todayTimer=null;}
  drag=null;skipClick=false;presetGroup='all';scopeVersion++;clearHistory();
  if(!keepClipboard){S.clipboard=[];S.custom.clear();S.staffPage=0;S.group='pharmacists';S.range=null;}
  Object.assign(S,{scroll:{left:0,top:0},range:null,editing:null,selected:[],ranges:[],anchor:null,cursor:null,month:'',notice:'',busy:false,confirming:false});
 }};
})();
