/* Duty Reports uses saved schedule records and the Duty calculator. */
(function(root){
 'use strict';
 const M=root.DutyModel,C=root.DutyControls;
 const headers=['Store','data','Day','Day Name','Check In 1','Check Out 1','Check In 2','Check Out 2','Normal O.T','Friday O.T','Holiday O.T','Notes / Coverage Pharmacy','In-Out','Group Start','Group Number'];
 const categories={...M.categories,total:'Total'};
 const overtime=['normal_ot','friday_ot','holiday_ot'];
 const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'});
 const monthName=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const dateValue=date=>Date.parse(date+'T00:00:00Z')/86400000+25569;
 const asHours=minutes=>minutes/60;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const chunk=(array,size)=>Array.from({length:Math.ceil(array.length/size)},(_,i)=>array.slice(i*size,(i+1)*size));
 const formatTime=minutes=>minutes==null?'':M.formatTime(minutes);
 function project(data,month,demo,pharmacyCode){
  const dates=M.days(month).map(d=>({...d,name:weekday.format(new Date(d.date+'T00:00:00Z'))}));
  const entries=(data.entries||[]).filter(e=>e.date.startsWith(month+'-'));
  const holidays=new Set((data.holidays||[]).filter(h=>h.active).map(h=>h.date));
  const totals=M.totals(entries,data.holidays,data.employees,data.hour_rules,demo||data.holiday_first===true);
  const staff=M.ordered(data.employees).flatMap(e=>{
   const saved=entries.filter(row=>row.code===e.code);
   if(!e.active&&!saved.some(row=>row.payload.status!=='EMPTY'))return [];
   const byDate=new Map(saved.map(row=>[row.date,row.payload]));
   const name=(!demo&&saved[0]?.identity?.name)||e.name;
   const days=dates.map(d=>{
    const p=byDate.get(d.date)||M.normalize(),holiday=holidays.has(d.date);
    const hours=M.effectiveHours(d.date,p,holiday,e,data.hour_rules,demo||data.holiday_first===true);
    const status=p.status==='EMPTY'?'':p.status==='OTHER_LEAVE'?'Unpaid Leave':M.statuses[p.status];
    return {...d,kind:holiday&&(demo||data.holiday_first===true||!d.friday)?'holiday':d.friday?'friday':'',periods:p.periods,hours,manual:p.manual_minutes,status,notes:p.note||'',highlight:p.highlight};
   });
   return [{code:e.code,id:String(e.display_code||e.code),name,days,totals:totals[e.code]||Object.fromEntries(Object.keys(categories).map(k=>[k,0]))}];
  });
  return {month,title:monthName.format(new Date(month+'-01T00:00:00Z')),pharmacyCode,dates,staff};
 }
 function dailyValues(day,excel=false){
  const times=[day.periods[0]?.start,day.periods[0]?.end,day.periods[1]?.start,day.periods[1]?.end];
  const time=minutes=>excel?(minutes==null?null:(minutes%1440)/1440):formatTime(minutes);
  return [null,null,excel?dateValue(day.date):day.date,day.name,...times.map(time),
   ...overtime.map(key=>day.hours[key]?asHours(day.hours[key]):null),day.notes||null,null,null,null];
 }
 function literal(value){
  if(typeof value!=='string')return String(value??'');
  // Quote embedded delimiters so a genuine note remains one spreadsheet cell.
  const text=/^[=+\-@]/.test(value)?"'"+value:value;
  return /[\t\r\n"]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
 }
 function copyValues(employee,range=null){
  return employee.days.filter(d=>!range||(d.date>=range.from&&d.date<=range.to)).map(day=>{
   const values=dailyValues(day).slice(4,12);
   overtime.forEach((key,index)=>{
    if(day.manual?.[key]===0)values[index+4]=0;
   });
   return values.map(literal).join('\t');
  }).join('\r\n');
 }
 function period(report,range){
  if(!range)return report;
  M.dateRange(range.from,range.to);
  if(!range.from.startsWith(report.month+'-')||!range.to.startsWith(report.month+'-'))throw Error('Choose dates within the selected month.');
  const staff=report.staff.map(e=>{const days=e.days.filter(d=>range.from<=d.date&&d.date<=range.to);const totals=Object.fromEntries(Object.keys(categories).map(k=>[k,days.reduce((sum,d)=>sum+d.hours[k],0)]));return {...e,days,totals};});
  return {...report,dates:report.dates.filter(d=>range.from<=d.date&&d.date<=range.to),staff,range};
 }
 function scheduleCell(day){
  const times=day.periods.map(p=>formatTime(p.start)+' – '+formatTime(p.end));
  const hours=Object.entries(categories).filter(([k])=>k!=='total'&&day.hours[k]).map(([k,v])=>v+' '+M.hours(day.hours[k])).join(' · ');
  const status=day.status==='Working'?'':day.status;
  return [...times,hours,status,day.notes].filter(Boolean).join('\n');
 }
 function workbookPlan(report,staff,format){
  if(format==='standard')return staff.map(e=>{
   const [year,month]=report.month.split('-').map(Number);
   const metadata={2:['Pharmacy Code',report.pharmacyCode],3:['Month',month],4:['Year',year],10:['ID',e.id],11:['Name',e.name]};
   return {name:'Employee '+(staff.indexOf(e)+1),widths:[17,24,13,13,14,14,14,14,12,12,12,33,12,14,14],freeze:1,
    merges:[0,1,2].map(i=>({s:{r:e.days.length+1+i,c:0},e:{r:e.days.length+1+i,c:7}})),
    rows:[{values:headers,style:'templateHeader'},...e.days.map((day,i)=>{
     const values=dailyValues(day,true);
     if(metadata[i+2])[values[0],values[1]]=metadata[i+2];
     return {values,style:day.kind==='friday'?'templateFriday':day.kind,height:day.notes.length>35?32:17,formats:{2:'date',4:'time',5:'time',6:'time',7:'time',8:'number',9:'number',10:'number'}};
    }),{values:['Period Totals',null,null,null,null,null,null,null,...overtime.map(k=>asHours(e.totals[k])),null],style:'total',formats:{8:'number',9:'number',10:'number'}},
    {values:['Basic Hours',null,null,null,null,null,null,null,asHours(e.totals.basic)],style:'total',formats:{8:'number'}},
    {values:['Total Hours',null,null,null,null,null,null,null,asHours(e.totals.total)],style:'total',formats:{8:'number'}}]};
  });
  return chunk(staff,6).map((page,index)=>({name:'Schedule '+(index+1),widths:[13,14,...page.map(()=>28)],freeze:6,
   rows:[{values:['Day','Day Name',...page.map(e=>e.name+'\n'+e.id)],style:'header',height:32},
    ...Object.entries(categories).map(([key,label])=>({values:[label,null,...page.map(e=>asHours(e.totals[key]))],style:'total',formats:Object.fromEntries(page.map((_,i)=>[i+2,'number']))})),
    ...report.dates.map((d,i)=>({values:[dateValue(d.date),d.name,...page.map(e=>scheduleCell(e.days[i]))],
     style:page[0].days[i].kind,cellStyles:page.map(e=>e.days[i].highlight),formats:{0:'date'},height:Math.max(22,...page.map(e=>Math.min(130,15*(scheduleCell(e.days[i]).split('\n').length+(e.days[i].notes.length>40?Math.ceil(e.days[i].notes.length/40):0))+3)))}))]}));
 }
 function exportPlan(report,staff,format){
  const used=new Set();return staff.map((employee,index)=>{
   let base=String(employee.id||'').replace(/[\[\]:*?\/\\]/g,'_').replace(/^'+|'+$/g,'').trim()||'Unassigned_'+(index+1);base=base.slice(0,31);
   let name=base,n=1;while(used.has(name.toLowerCase())){const suffix='_'+(++n);name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLowerCase());
   const sheet=workbookPlan(report,[employee],format)[0];sheet.name=name;
   if(format==='standard'&&employee.days.length<10)sheet.rows.push({values:['Employee Name',employee.name],style:'plain'},{values:['Job Number',employee.id],style:'plain'},{values:['Pharmacy Code',report.pharmacyCode],style:'plain'});
   return sheet;
  });
 }
 function exportFilename(report){
  const code=String(report.pharmacyCode||'').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');if(!code)throw Error('Select a pharmacy before exporting.');
  const suffix=report.range?report.range.from+'_to_'+report.range.to:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(report.month+'-01T12:00Z')).replace(' ','-');
  return code+'_Duty_'+suffix+'.xlsx';
 }
 const fills={plain:'FFFFFF',templateHeader:'F2F2F2',templateFriday:'8ED973',header:'174A79',total:'DFEBF8',friday:'D8E8FA',holiday:'FFF2D9',blue:'E2F0FF',mint:'E3F5EB',violet:'EDE4FA',rose:'FBE7EE'};
 const formats={plain:0,date:164,time:165,number:166,integer:167};
 const fillKeys=Object.keys(fills),formatKeys=Object.keys(formats);
 function workbookStyles(){
  const fill=(color)=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf=(style,format,i)=>`<xf numFmtId="${formats[format]}" fontId="${style==='header'?1:['total','templateHeader','templateFriday'].includes(style)?2:0}" fillId="${i+2}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${format==='plain'?'left':'center'}" vertical="center" wrapText="1"/></xf>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="h:mm AM/PM"/><numFmt numFmtId="166" formatCode="0.####"/><numFmt numFmtId="167" formatCode="0"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF243F5E"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF173F70"/><name val="Calibri"/></font></fonts><fills count="${fillKeys.length+2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${Object.values(fills).map(fill).join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color rgb="FFD1DEEB"/></right><top/><bottom style="thin"><color rgb="FFD1DEEB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${fillKeys.length*formatKeys.length}">${fillKeys.flatMap((style,i)=>formatKeys.map(format=>xf(style,format,i))).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 }
 function workbookBytes(X,plan){
  const workbook=X.utils.book_new();
  for(const sheet of plan){
   const rows=sheet.rows.map(row=>Array.from({length:sheet.widths.length},(_,i)=>row.values[i]??''));
   const ws=X.utils.aoa_to_sheet(rows);
   if(sheet.merges)ws['!merges']=sheet.merges;
   ws['!cols']=sheet.widths.map(wch=>({wch}));
   ws['!rows']=sheet.rows.map(row=>({hpt:row.height||19}));
   X.utils.book_append_sheet(workbook,ws,sheet.name);
  }
  const archive=X.CFB.read(new Uint8Array(X.write(workbook,{type:'array',bookType:'xlsx',bookSST:true})),{type:'buffer'});
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  // The bundled SheetJS writer provides the typed cells and ZIP. Apply Duty styles to those cells.
  const replace=(path,transform)=>{
   const part=archive.FileIndex[archive.FullPaths.findIndex(name=>name.endsWith('/'+path))];
   if(!part)throw Error('Excel export could not locate a workbook part.');
   part.content=encoder.encode(transform(decoder.decode(new Uint8Array(part.content))));part.size=part.content.length;
  };
  replace('xl/styles.xml',()=>workbookStyles());
  plan.forEach((sheet,index)=>replace(`xl/worksheets/sheet${index+1}.xml`,xml=>{
   const ignored=xml.match(/<ignoredErrors[\s\S]*?<\/ignoredErrors>/)?.[0]||'';
   return xml
    .replace(/<c r="([A-Z]+[0-9]+)"(?: s="[0-9]+")?/g,(_,address)=>{
     const {r,c}=X.utils.decode_cell(address),row=sheet.rows[r];
     const style=row.style||row.cellStyles?.[c-2]||'plain';
     const fill=fillKeys.indexOf(style),kind=row.formats?.[c]||'plain',format=formatKeys.indexOf(kind==='number'&&Number.isInteger(row.values[c])?'integer':kind);
     if(fill<0||format<0)throw Error('Invalid Duty export cell style.');
     return `<c r="${address}" s="${fill*formatKeys.length+format}"`;
    })
    .replace(/<worksheet\b[^>]*>/,tag=>tag+'<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
    .replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
    .replace(/<ignoredErrors[\s\S]*?<\/ignoredErrors>/,'')
    .replace(/<pageMargins[^>]*\/>/,'')
    .replace('</worksheet>','<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'+ignored+'</worksheet>');
  }));
  // ZIP DOS dates cannot represent month/day zero. Use a deterministic valid epoch.
  for(const part of archive.FileIndex)part.mt=new Date(1980,0,1,0,0,0);
  const bytes=new Uint8Array(X.CFB.write(archive,{fileType:'zip',type:'array',compression:true}));
  if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)throw Error('Invalid Excel workbook bytes.');
  // The bundled CFB ZIP writer leaves central-directory dates zero even when mt is set.
  // Copy the valid DOS timestamp from each local header without changing compressed data.
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=bytes.length-22;
  while(end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
  if(end<0||view.getUint32(end,true)!==0x06054b50)throw Error('Invalid Excel ZIP directory.');
  let offset=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
  for(let i=0;i<count;i++){
   if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid Excel ZIP entry.');
   const local=view.getUint32(offset+42,true);if(view.getUint32(local,true)!==0x04034b50)throw Error('Invalid Excel ZIP header.');
   view.setUint16(offset+12,view.getUint16(local+10,true),true);view.setUint16(offset+14,view.getUint16(local+12,true),true);
   offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
  }
  return bytes;
 }
 let copyTimer=null;
 const state={employee:'',format:'standard',preview:true,page:0,range:null,scope:''};
 function mount(host,data,config){
  if(copyTimer!==null){root.clearTimeout?.(copyTimer);copyTimer=null;}
  const scope=(data.pharmacy_id||config.pharmacyCode||'')+'/'+config.month;
  if(scope!==state.scope){state.scope=scope;state.range=null;state.employee='';state.page=0;}
  const report=period(project({...data,employees:M.ordered(data.employees)},config.month,config.demo,config.pharmacyCode),state.range);
  if(!report.staff.some(e=>e.code===state.employee))state.employee='';
  const single=report.staff.find(e=>e.code===state.employee);
  const staff=single?[single]:report.staff;
  const plan=workbookPlan(report,staff,state.format);
  const count=plan.length;
  state.page=Math.min(state.page,Math.max(0,count-1));
  function display(value,format){
   if(value==null)return '';
   if(format==='date')return new Date((value-25569)*86400000).toISOString().slice(0,10);
   if(format==='time')return formatTime(Math.round(value*1440));
   if(format==='number')return M.hours(value*60);
   return value;
  }
  function preview(){
   if(!state.preview||!count)return '';
   const sheet=plan[state.page],title=state.format==='standard'?staff[state.page].name+' · '+staff[state.page].id:single?single.name+' · '+single.id:sheet.name;
   return `<section class="duty-report-preview" aria-label="Monthly table preview">
    <div class="duty-report-preview-heading"><strong>${esc(title)} · ${esc(report.title)}</strong>
     ${count>1?`<nav aria-label="Preview pages"><button type="button" data-preview-page="-1" aria-label="Previous preview page" ${state.page?'':'disabled'}>‹</button><span>${state.page+1} / ${count}</span><button type="button" data-preview-page="1" aria-label="Next preview page" ${state.page+1<count?'':'disabled'}>›</button></nav>`:''}
    </div><div class="duty-report-table-scroll" tabindex="0"><table aria-label="${state.format==='standard'?'Standard Timesheet':'Schedule Layout'} preview" class="duty-report-table duty-report-${state.format}">
    <colgroup>${sheet.widths.slice(0,state.format==='standard'?12:sheet.widths.length).map((width,col)=>`<col style="width:${state.format==='schedule'?(col===0?'100px':col===1?'110px':'auto'):([65,105,90,80,85,85,85,85,65,65,65,155][col]+'px')}">`).join('')}</colgroup>
    <thead><tr>${sheet.rows[0].values.slice(0,state.format==='standard'?12:sheet.widths.length).map(v=>`<th scope="col">${esc(v)}</th>`).join('')}</tr></thead>
    <tbody>${sheet.rows.slice(1).map(row=>`<tr class="duty-report-row-${row.style||'plain'}">${Array.from({length:state.format==='standard'?12:sheet.widths.length},(_,col)=>{const merge=sheet.merges?.find(m=>m.s.r===sheet.rows.indexOf(row)&&m.s.c<=col&&m.e.c>=col);return merge&&merge.s.c!==col?'':`<td${merge?` colspan="${merge.e.c-merge.s.c+1}"`:''}>${esc(display(row.values[col],row.formats?.[col]))}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  const summary=e=>Object.entries(categories).map(([k,label])=>`<div class="duty-category-${k}"><dt>${label}</dt><dd>${M.hours(e.totals[k])}</dd></div>`).join('');
  const icon=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true">${kind==='copy'?'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>':'<path d="M14 3H4v18h16V9zM14 3v6h6M7 12l5 6m0-6-5 6M16 12v6"/>'}</svg>`;
  host.innerHTML=`<section class="duty-report" aria-labelledby="duty-report-title">
   <header class="duty-report-heading"><h2 id="duty-report-title">Duty Reports</h2><span>${esc(report.title)}</span></header>
   <div class="duty-report-controls">
    <div class="duty-report-field duty-employee-filter"><span id="duty-employee-label">Employee Filter</span>
    <select data-report-employee aria-label="Employee Filter" hidden tabindex="-1" aria-hidden="true"><option value="" ${single?'':'selected'}>All Employees</option>${report.staff.map(e=>`<option value="${esc(e.code)}" ${e===single?'selected':''}>${esc(e.name)} · ${esc(e.id)}</option>`).join('')}</select>
    <button type="button" class="duty-employee-trigger" data-report-employee-trigger role="combobox" aria-labelledby="duty-employee-label duty-employee-value" aria-haspopup="listbox" aria-controls="duty-employee-list" aria-expanded="false"><span class="duty-employee-name" id="duty-employee-value">${single?esc(single.name):'All Employees'}</span>${single?`<span class="duty-employee-code">${esc(single.id)}</span>`:''}<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5"/></svg></button>
    <div id="duty-employee-list" class="duty-employee-list" data-report-employee-list popover="auto" role="listbox" aria-labelledby="duty-employee-label">
    ${[{code:'',name:'All Employees',id:''},...report.staff].map(e=>`<button type="button" role="option" tabindex="-1" data-employee-option="${esc(e.code)}" aria-selected="${e.code===state.employee}"><span class="duty-employee-name">${esc(e.name)}</span>${e.id?`<span class="duty-employee-code">${esc(e.id)}</span>`:''}<span class="duty-employee-check" aria-hidden="true">${e.code===state.employee?'✓':''}</span></button>`).join('')}
    </div></div>
    <div class="duty-report-period"><label class="duty-report-field">Period<select data-report-period><option value="full">Full Month</option><option value="custom" ${state.range?'selected':''}>Custom Date Range</option></select></label>
    ${state.range?`<div class="duty-range-inputs">${C.dateField({id:'duty-report-from',name:'from',label:'From',value:state.range.from,min:config.month+'-01',max:M.days(config.month).at(-1).date,attributes:'data-report-from'})}${C.dateField({id:'duty-report-to',name:'to',label:'To',value:state.range.to,min:config.month+'-01',max:M.days(config.month).at(-1).date,attributes:'data-report-to'})}</div>`:''}</div>
    <label class="duty-report-field">Excel format<select data-report-format><option value="standard" ${state.format==='standard'?'selected':''}>Standard Timesheet</option><option value="schedule" ${state.format==='schedule'?'selected':''}>Schedule Layout</option></select></label>
   </div>
   <div class="duty-report-result-bar"><div class="duty-report-identity"><strong>${single?esc(single.name):'All Employees'}</strong><small>${single?esc(single.id)+' · ':''}${state.range?esc(state.range.from+' → '+state.range.to):esc(report.title)+' · Full Month'}</small></div><div class="duty-actions"><button type="button" data-report-copy title="Copy values · E:L" aria-label="Copy Values" ${single?'':'disabled'}>${icon('copy')}<span>Copy</span></button><button type="button" data-report-clear title="Clear employee selection only" ${single?'':'disabled'}>Clear Selection</button><button type="button" class="duty-primary" data-report-download title="Export ${single?'selected employee':'all applicable employees'} to Excel" aria-label="Excel Export" ${staff.length?'':'disabled'}>${icon('excel')}<span>Excel Export</span></button><details class="duty-report-help"><summary aria-label="Paste safely" title="Copy and paste guidance">?</summary><div><strong>Paste safely · E:L</strong><p data-report-destination></p><p>Use a disposable, correctly dated template first. Match the employee and first daily date; paste values starting in column E. Copy fills E:L only. Reserved M:O and adjacent cells remain untouched.</p></div></details></div></div>
   ${single?`<dl class="duty-report-kpis" aria-label="${state.range?'Selected period totals':'Monthly totals'}">${summary(single)}</dl>`:''}
   <p class="duty-report-status" role="status" data-report-status></p>
   ${single?preview():`<div class="duty-report-placeholder">All Employees · ${staff.length} employee${staff.length===1?'':'s'} available for Excel Export.</div>`}
  </section>`;
  const status=host.querySelector('[data-report-status]');
  const destination=single?`Paste values into column E on the row dated ${single.days[0].date} in ${single.name}’s block (${single.id}). ${state.range?'Do not start at day 1 unless it is the selected start date.':'Start at this employee’s first daily row.'} Check the template month and dates first.`:'Select one employee to copy or export.';
  host.querySelector('[data-report-destination]').textContent=destination;
  C.bindCalendars(host);
  C.fitViewport(host);
  host.querySelector('[data-report-period]').onchange=e=>{state.range=e.target.value==='custom'?{from:config.month+'-01',to:M.days(config.month).at(-1).date}:null;state.page=0;mount(host,data,config);};
  for(const name of ['from','to']){const field=host.querySelector('[data-report-'+name+']');if(field)field.onchange=e=>{const next={...state.range,[name]:e.target.value};try{period(report,next);state.range=next;state.page=0;mount(host,data,config);}catch(error){status.textContent=error.message;e.target.value=state.range[name];}};}

  host.querySelector('[data-report-employee]').onchange=e=>{
   if(e.target.value&&!report.staff.some(person=>person.code===e.target.value))return;
   state.employee=e.target.value;state.preview=true;state.page=0;
   mount(host,data,config);
   host.querySelector('[data-report-employee-trigger]').focus();
  };
  const trigger=host.querySelector('[data-report-employee-trigger]'),list=host.querySelector('[data-report-employee-list]');
  const items=()=>[...list.querySelectorAll('[role=option]')];
  const closeList=(restore=true)=>{list.hidePopover?.();trigger.setAttribute('aria-expanded','false');if(restore&&trigger.isConnected)trigger.focus();};
  const openList=()=>{
   list.showPopover?.({source:trigger});trigger.setAttribute('aria-expanded','true');
   // Top-layer popover escapes panel overflow. Account for CSS/device zoom.
   const rect=trigger.getBoundingClientRect?.();
   if(rect&&list.getBoundingClientRect){
    const scale=list.offsetWidth?list.getBoundingClientRect().width/list.offsetWidth:1;
    const below=root.innerHeight-rect.bottom-12,above=rect.top-12;
    list.style.width=Math.min(Math.max(rect.width,280*scale),root.innerWidth-16)/scale+'px';
    list.style.maxHeight=Math.max(40,Math.min(350,Math.max(below,above)/scale))+'px';
    const box=list.getBoundingClientRect();list.style.left=Math.max(8,Math.min(rect.left,root.innerWidth-box.width-8))/scale+'px';
    list.style.top=Math.max(8,box.height<=below?rect.bottom+4:rect.top-box.height-4)/scale+'px';
   }
   const selected=list.querySelector('[aria-selected=true]')||items()[0];selected?.focus({preventScroll:true});selected?.scrollIntoView?.({block:'nearest'});
  };
  trigger.onclick=()=>{if(trigger.getAttribute('aria-expanded')==='true')closeList();else openList();};
  trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();openList();if(e.key==='Home')items()[0]?.focus();if(e.key==='End')items().at(-1)?.focus();}};
  const choose=button=>{closeList(false);host.querySelector('[data-report-employee]').onchange({target:{value:button.dataset.employeeOption}});};
  list.onclick=e=>{const button=e.target.closest('[data-employee-option]');if(button)choose(button);};
  let search='',searchAt=0;
  list.onkeydown=e=>{
   const options=items(),index=options.indexOf(e.target);
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeList();return;}
   if(e.key==='Tab'){e.preventDefault();closeList();const next=e.shiftKey?host.closest('#page-duty')?.querySelector('[data-duty-tab=reports]'):host.querySelector('[data-report-period]');next?.focus();return;}
   if(e.key==='Enter'||e.key===' '){e.preventDefault();if(index>=0)choose(options[index]);return;}
   const offset={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:options.length-1}[e.key];
   if(offset!==undefined){e.preventDefault();options[Math.max(0,Math.min(options.length-1,offset))]?.focus();return;}
   if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const now=Date.now();search=now-searchAt>700?e.key:search+e.key;searchAt=now;
    const match=options.find(option=>option.textContent.trim().toLowerCase().startsWith(search.toLowerCase()));if(match){e.preventDefault();match.focus();}
   }
  };
  list.addEventListener('beforetoggle',e=>trigger.setAttribute('aria-expanded',String(e.newState==='open')));
  list.addEventListener('toggle',e=>{if(e.newState==='closed'){trigger.setAttribute('aria-expanded','false');if(list.contains(host.ownerDocument.activeElement))trigger.focus();}});
  host.querySelector('[data-report-clear]').onclick=()=>{state.employee='';state.page=0;mount(host,data,config);host.querySelector('[data-report-employee-trigger]').focus();};
  host.querySelector('[data-report-format]').onchange=e=>{
   state.format=e.target.value;state.page=0;mount(host,data,config);
   host.querySelector('[data-report-format]').focus();
  };
  for(const button of host.querySelectorAll('[data-preview-page]'))button.onclick=()=>{
   state.page+=Number(button.dataset.previewPage);mount(host,data,config);
  };
  host.querySelector('[data-report-copy]').onclick=async()=>{
   const button=host.querySelector('[data-report-copy]');if(!single||button.disabled)return;
   if(copyTimer!==null){root.clearTimeout?.(copyTimer);copyTimer=null;}
   button.classList.remove('is-copied');button.innerHTML=icon('copy')+'<span>Copy</span>';
   button.disabled=true;status.textContent='';status.classList.remove('is-error');
   try{
    await navigator.clipboard.writeText(copyValues(single));
    if(!button.isConnected)return;
    button.classList.add('is-copied');button.innerHTML='<span aria-hidden="true">✓</span><span>Copied</span>';
    status.textContent=`Copied ${single.days.length} days · E:L.`;status.title=destination;
    copyTimer=root.setTimeout?.(()=>{if(button.isConnected){button.classList.remove('is-copied');button.innerHTML=icon('copy')+'<span>Copy</span>';status.textContent='';}copyTimer=null;},2000)??null;
   }catch{
    if(button.isConnected){status.classList.add('is-error');status.textContent='Clipboard access failed. Allow clipboard access in your browser and retry.';}
   }finally{if(button.isConnected)button.disabled=false;}
  };
  host.querySelector('[data-report-download]').onclick=()=>{
   try{
    const X=root.XLSX;
    if(!X)throw Error('Excel export is unavailable.');
    if(!staff.length)return;
    const blob=new Blob([workbookBytes(X,exportPlan(report,staff,state.format))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=exportFilename(report);
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }catch(error){status.textContent=error.message;}
  };
 }
 root.DutyReports={mount,project,period,copyValues,workbookPlan,workbookBytes,exportPlan,exportFilename};
})(typeof window==='undefined'?globalThis:window);
