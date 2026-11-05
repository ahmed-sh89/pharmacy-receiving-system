/* Duty Reports uses saved schedule records and the Duty calculator. */
(function(root){
 'use strict';
 const M=root.DutyModel;
 const headers=['Store','data','Day','Day Name','Check In 1','Check Out 1','Check In 2','Check Out 2','Normal O.T','Friday O.T','Holiday O.T','Notes / Coverage Pharmacy','In-Out','Group Start','Group Number'];
 const groups={
  shifts:{start:4,end:8,label:'Shift times',columns:'E:H'},
  overtime:{start:8,end:11,label:'Overtime',columns:'I:K'},
  notes:{start:11,end:12,label:'Notes and status',columns:'L'}
 };
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
  const totals=M.totals(entries,data.holidays,data.employees,data.hour_rules,demo);
  const staff=data.employees.flatMap(e=>{
   const saved=entries.filter(row=>row.code===e.code);
   if(!e.active&&!saved.some(row=>row.payload.status!=='EMPTY'))return [];
   const byDate=new Map(saved.map(row=>[row.date,row.payload]));
   const name=(!demo&&saved[0]?.identity?.name)||e.name;
   const days=dates.map(d=>{
    const p=byDate.get(d.date)||M.normalize(),holiday=holidays.has(d.date);
    const hours=M.effectiveHours(d.date,p,holiday,e,data.hour_rules,demo);
    const status=p.status==='EMPTY'?'':p.status==='OTHER_LEAVE'?'Unpaid Leave':M.statuses[p.status];
    return {...d,kind:holiday&&(demo||!d.friday)?'holiday':d.friday?'friday':'',periods:p.periods,hours,notes:[status,p.note].filter(Boolean).join(' · '),highlight:p.highlight};
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
  const text=value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
  return /^[=+\-@]/.test(text)?"'"+text:text;
 }
 function copyRows(employee,key){
  const group=groups[key];
  return employee.days.map(day=>dailyValues(day).slice(group.start,group.end).map(literal));
 }
 function scheduleCell(day){
  const times=day.periods.map(p=>formatTime(p.start)+' – '+formatTime(p.end));
  const hours=Object.entries(categories).filter(([k])=>k!=='total'&&day.hours[k]).map(([k,v])=>v+' '+M.hours(day.hours[k])).join(' · ');
  const notes=day.notes==='Working'?'':day.notes.replace(/^Working · /,'');
  return [...times,hours,notes].filter(Boolean).join('\n');
 }
 function workbookPlan(report,staff,format){
  if(format==='standard')return staff.map(e=>{
   const [year,month]=report.month.split('-').map(Number);
   const metadata={2:['Pharmacy Code',report.pharmacyCode],3:['Month',month],4:['Year',year],10:['ID',e.id],11:['Name',e.name]};
   return {name:'Employee '+(staff.indexOf(e)+1),widths:[17,24,13,13,14,14,14,14,12,12,12,33,12,14,14],freeze:1,
    rows:[{values:headers,style:'header'},...e.days.map((day,i)=>{
     const values=dailyValues(day,true);
     if(metadata[i+2])[values[0],values[1]]=metadata[i+2];
     return {values,style:day.kind,height:day.notes.length>35?32:17,formats:{2:'date',4:'time',5:'time',6:'time',7:'time',8:'number',9:'number',10:'number'}};
    }),{values:['Monthly totals',null,null,null,null,null,null,null,...overtime.map(k=>asHours(e.totals[k])),null],style:'total',formats:{8:'number',9:'number',10:'number'}},
    {values:['Basic Hours',asHours(e.totals.basic),'Total Hours',asHours(e.totals.total)],style:'total',formats:{1:'number',3:'number'}}]};
  });
  return chunk(staff,6).map((page,index)=>({name:'Schedule '+(index+1),widths:[13,14,...page.map(()=>28)],freeze:6,
   rows:[{values:['Day','Day Name',...page.map(e=>e.name+'\n'+e.id)],style:'header',height:32},
    ...Object.entries(categories).map(([key,label])=>({values:[label,null,...page.map(e=>asHours(e.totals[key]))],style:'total',formats:Object.fromEntries(page.map((_,i)=>[i+2,'number']))})),
    ...report.dates.map((d,i)=>({values:[dateValue(d.date),d.name,...page.map(e=>scheduleCell(e.days[i]))],
     style:page[0].days[i].kind,cellStyles:page.map(e=>e.days[i].highlight),formats:{0:'date'},height:Math.max(22,...page.map(e=>Math.min(130,15*(scheduleCell(e.days[i]).split('\n').length+(e.days[i].notes.length>40?Math.ceil(e.days[i].notes.length/40):0))+3)))}))]}));
 }
 const fills={plain:'FFFFFF',header:'174A79',total:'DFEBF8',friday:'D8E8FA',holiday:'FFF2D9',blue:'E2F0FF',mint:'E3F5EB',violet:'EDE4FA',rose:'FBE7EE'};
 const formats={plain:0,date:164,time:165,number:166};
 const fillKeys=Object.keys(fills),formatKeys=Object.keys(formats);
 function workbookStyles(){
  const fill=(color)=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf=(style,format,i)=>`<xf numFmtId="${formats[format]}" fontId="${style==='header'?1:style==='total'?2:0}" fillId="${i+2}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="h:mm AM/PM"/><numFmt numFmtId="166" formatCode="0.####"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF243F5E"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF173F70"/><name val="Calibri"/></font></fonts><fills count="${fillKeys.length+2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${Object.values(fills).map(fill).join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right style="thin"><color rgb="FFD1DEEB"/></right><top/><bottom style="thin"><color rgb="FFD1DEEB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${fillKeys.length*formatKeys.length}">${fillKeys.flatMap((style,i)=>formatKeys.map(format=>xf(style,format,i))).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 }
 function workbookBytes(X,plan){
  const workbook=X.utils.book_new();
  for(const sheet of plan){
   const rows=sheet.rows.map(row=>Array.from({length:sheet.widths.length},(_,i)=>row.values[i]??''));
   const ws=X.utils.aoa_to_sheet(rows);
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
  plan.forEach((sheet,index)=>replace(`xl/worksheets/sheet${index+1}.xml`,xml=>xml
   .replace(/<c r="([A-Z]+[0-9]+)"(?: s="[0-9]+")?/g,(_,address)=>{
    const {r,c}=X.utils.decode_cell(address),row=sheet.rows[r];
    const style=row.style||row.cellStyles?.[c-2]||'plain';
    const id=fillKeys.indexOf(style)*formatKeys.length+formatKeys.indexOf(row.formats?.[c]||'plain');
    return `<c r="${address}" s="${id}"`;
   })
   .replace(/<sheetViews>.*?<\/sheetViews>/,`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
   .replace(/<sheetFormatPr[^>]*\/>/,'')
   .replace('<sheetViews>','<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>')
   .replace(/<pageMargins[^>]*\/>/,'')
   .replace('</worksheet>','<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>')));
  return X.CFB.write(archive,{fileType:'zip',type:'array',compression:true});
 }
 const state={employee:'',format:'standard',group:'shifts'};
 function mount(host,data,config){
  const report=project(data,config.month,config.demo,config.pharmacyCode);
  if(!report.staff.some(e=>e.code===state.employee))state.employee='';
  const single=report.staff.find(e=>e.code===state.employee);
  const staff=single?[single]:report.staff,group=groups[state.group];
  const values=single?copyRows(single,state.group):[];
  const start=group.columns[0];
  const plan=workbookPlan(report,staff,state.format);
  function previewValue(value,format){
   if(value==null)return '';
   if(format==='date')return new Date((value-25569)*86400000).toISOString().slice(0,10);
   if(format==='time')return formatTime(Math.round(value*1440));
   if(format==='number')return M.hours(value*60);
   return value;
  }
  const previewSheet=(sheet,i)=>`<details ${single?'open':''}><summary>${esc(state.format==='standard'?staff[i].name+' · '+staff[i].id:sheet.name)}</summary>
   <div class="duty-report-scroll"><table aria-label="Duty report preview"><thead><tr>${sheet.rows[0].values.map(v=>`<th scope="col">${esc(v)}</th>`).join('')}</tr></thead>
   <tbody>${sheet.rows.slice(1).map(row=>`<tr class="duty-report-${row.style}">${Array.from({length:sheet.widths.length},(_,col)=>`<td>${esc(previewValue(row.values[col],row.formats?.[col]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

  const summary=e=>Object.entries(categories).map(([k,label])=>`<span class="duty-category-${k}">${label} <b>${M.hours(e.totals[k])}</b></span>`).join('');
  host.innerHTML=`<div class="duty-report-toolbar"><strong>${esc(report.title)}</strong>
   <label>Employee <select data-report-employee><option value="">All Employees</option>${report.staff.map(e=>`<option value="${esc(e.code)}" ${e===single?'selected':''}>${esc(e.name)} · ${esc(e.id)}</option>`).join('')}</select></label>
   <label>Report format <select data-report-format><option value="standard" ${state.format==='standard'?'selected':''}>Standard Timesheet</option><option value="schedule" ${state.format==='schedule'?'selected':''}>Schedule Layout</option></select></label>
   <button type="button" class="duty-primary" data-report-download ${staff.length?'':'disabled'}>Download Excel</button></div>
   <section class="duty-report-copy"><strong>PROVISIONAL — REQUIRES LIVE TEMPLATE VERIFICATION</strong>
   <p>Paste only into a verified input range in the matching employee block. Pasting values over formulas can replace them. Blank values can clear existing inputs.</p>
   <div class="duty-report-toolbar"><label>Input columns <select data-report-group>${Object.entries(groups).map(([key,g])=>`<option value="${key}" ${key===state.group?'selected':''}>${g.columns} · ${g.label}</option>`).join('')}</select></label>
   <span>Start in column <b>${start}</b> on the first daily row for this employee (e.g. ${start}2 in the first reference block). Confirm ${report.dates.length} rows.</span>
   <label><input type="checkbox" data-report-confirm ${single?'':'disabled'}> I verified this input range in a disposable template copy</label>
   <button type="button" data-report-copy disabled>Copy Values</button></div>
   <p role="status" data-report-status>${single?'Copy preview below shows exact TSV fields. Dates identify rows and are omitted from the clipboard.':'Select one employee to preview and copy values.'}</p>
   ${single?`<div class="duty-report-scroll"><table aria-label="Copy Values preview"><thead><tr><th scope="col">Date (guide only)</th>${headers.slice(group.start,group.end).map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${values.map((row,i)=>`<tr><th scope="row">${single.days[i].date}</th>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}</section>
   <section class="duty-report-preview"><h3>Report preview</h3>${staff.length?`<div class="duty-report-summary">${staff.map(e=>`<div><strong>${esc(e.name)} · ${esc(e.id)}</strong><div class="duty-mini-kpis duty-report-totals">${summary(e)}</div></div>`).join('')}</div>${plan.map(previewSheet).join('')}`:'<p>No employees are available for this month.</p>'}</section>`;
  const confirmation=host.querySelector('[data-report-confirm]'),copy=host.querySelector('[data-report-copy]'),status=host.querySelector('[data-report-status]');
  confirmation.onchange=()=>{copy.disabled=!confirmation.checked||!single;};
  host.querySelector('[data-report-employee]').onchange=e=>{state.employee=e.target.value;mount(host,data,config);host.querySelector('[data-report-employee]').focus();};
  host.querySelector('[data-report-format]').onchange=e=>{state.format=e.target.value;mount(host,data,config);host.querySelector('[data-report-format]').focus();};
  host.querySelector('[data-report-group]').onchange=e=>{state.group=e.target.value;mount(host,data,config);host.querySelector('[data-report-group]').focus();};
  copy.onclick=async()=>{
   if(!single||!confirmation.checked)return;
   try{await navigator.clipboard.writeText(values.map(row=>row.join('\t')).join('\r\n'));status.textContent=`Copied ${values.length} rows of plain values for ${group.columns}. Paste only into the verified inputs.`;}
   catch{status.textContent='Clipboard access failed. Allow clipboard access in your browser and retry.';}
  };
  host.querySelector('[data-report-download]').onclick=()=>{
   try{
    const X=root.XLSX;
    if(!X)throw Error('Excel export is unavailable.');
    const blob=new Blob([workbookBytes(X,plan)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`PharmFlow_Duty_${state.format==='standard'?'Standard_Timesheet':'Schedule_Layout'}_${report.month}.xlsx`;
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }catch(error){status.textContent=error.message;}
  };
 }
 root.DutyReports={mount,project,copyRows,workbookPlan,workbookBytes};
})(typeof window==='undefined'?globalThis:window);
