/* Duty Stage A: dates and synthetic visual data only. No attendance calculation. */
(function(root){
 'use strict';
 const defaults=Object.freeze([{key:'pharmacist',label:'Pharmacist',active:true,revision:0},{key:'labor',label:'Labor',active:true,revision:0},{key:'beauty-advisor',label:'Beauty Advisor',active:true,revision:0}]);
 function days(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Select a valid month');
  const [y,m]=month.split('-').map(Number);
  return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>{
   const date=new Date(Date.UTC(y,m-1,i+1));
   return {day:i+1,date:month+'-'+String(i+1).padStart(2,'0'),weekday:date.toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'}),friday:date.getUTCDay()===5};
  });
 }
 function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');}
 function validateEmployee(input){
  const code=String(input.code||'').trim(),name=String(input.name||'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(code))throw Error('Use an employee code of 1–40 letters, numbers, dots, underscores or hyphens.');
  if(!name||name.length>120)throw Error('Enter an employee name of 1–120 characters.');
  if(!input.position_key)throw Error('Select a position.');
  return {...input,code,name};
 }
 function demo(){return {positions:defaults.map(p=>({...p})),employees:Array.from({length:10},(_,i)=>({code:'DEMO-'+String(i+1).padStart(3,'0'),name:(i<6?'Pharmacist ':i<9?'Labor ':'Beauty Advisor ')+(i<6?i+1:i<9?i-5:1),position_key:i<6?'pharmacist':i<9?'labor':'beauty-advisor',active:true,revision:0})),can_write:true};}
 const statuses={WORK:'Working',OFF:'OFF',ANNUAL_LEAVE:'Annual Leave',SICK_LEAVE:'Sick Leave',OTHER_LEAVE:'Other Leave',EMPTY:'Empty'};
 function time(value){
  const m=String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if(!m||+m[1]<1||+m[1]>12||+(m[2]||0)>59)throw Error('Use AM/PM times, for example 9 AM – 6 PM.');
  return (+m[1]%12+(m[3].toLowerCase()==='p'?12:0))*60+ +(m[2]||0);
 }
 function formatTime(minutes){const n=((minutes%1440)+1440)%1440,h=Math.floor(n/60);return (h%12||12)+':'+String(n%60).padStart(2,'0')+' '+(h<12?'AM':'PM');}
 function normalize(payload={}){
  const p={status:payload.status||'EMPTY',periods:[],basic_limit:payload.basic_limit??540,note:String(payload.note||'').trim(),highlight:payload.highlight||''};
  if(!Object.hasOwn(statuses,p.status))throw Error('Select a valid working or leave status.');
  if(!Number.isInteger(p.basic_limit)||p.basic_limit<0||p.basic_limit>1440)throw Error('Basic limit must be between 0 and 24 hours, in whole minutes.');
  if(p.note.length>300)throw Error('Notes can contain up to 300 characters.');
  if(!['','blue','mint','violet','rose'].includes(p.highlight))throw Error('Select a highlight from the palette.');
  const input=payload.periods||[];
  if(input.length>2||!Array.isArray(input))throw Error('Use at most two working periods.');
  if(p.status!=='WORK'&&input.length)throw Error('Leave and OFF entries cannot contain working periods.');
  if(p.status==='WORK'&&!input.length)throw Error('Enter at least one working period.');
  input.forEach((v,i)=>{
   let start=Number(v.start),end=Number(v.end);
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=2880||end<0||end>=2880)throw Error('Invalid working time.');
   if(i===0&&start>=1440)throw Error('The first period must start on its duty date.');
   if(i&&start<p.periods[0].start)start+=1440;
   if(end%1440===start%1440)throw Error('Start and end must be different.');
   if(end<=start)end+=1440;
   if(end<=start||end-p.periods[0]?.start>1440||end>2879)throw Error('A duty must finish within 24 hours of its start.');
   if(i&&start<p.periods[i-1].end)throw Error('Working periods overlap.');
   p.periods.push({start,end});
  });
  if(p.periods.length&&p.periods.at(-1).end-p.periods[0].start>1440)throw Error('A duty must finish within 24 hours of its start.');
  return p;
 }
 function parse(value,previous={}){
  const text=String(value).trim();
  const matched=Object.keys(statuses).find(k=>k===text.toUpperCase().replaceAll(' ','_')||statuses[k].toLowerCase()===text.toLowerCase());
  if(!text||matched&&matched!=='WORK')return normalize({...previous,status:matched||'EMPTY',periods:[]});
  const periods=text.split(/\s*(?:\/|&|;)\s*/).map(piece=>{const pair=piece.split(/\s*[-–—]\s*/);if(pair.length!==2)throw Error('Enter a start and end time, separated by a dash.');return {start:time(pair[0]),end:time(pair[1])};});
  return normalize({...previous,status:'WORK',periods});
 }
 function text(payload){const p=normalize(payload);return p.status==='WORK'?p.periods.map(v=>formatTime(v.start)+' – '+formatTime(v.end)).join(' / '):p.status==='EMPTY'?'':statuses[p.status];}
 function calculate(date,payload,holiday=false){
  const p=normalize(payload),total=p.periods.reduce((a,v)=>a+v.end-v.start,0),friday=new Date(date+'T12:00:00Z').getUTCDay()===5;
  return {basic:!friday&&!holiday?Math.min(total,p.basic_limit):0,normal_ot:!friday&&!holiday?Math.max(0,total-p.basic_limit):0,friday_ot:friday?total:0,holiday_ot:!friday&&holiday?total:0,total};
 }
 const hours=minutes=>(minutes/60).toLocaleString('en-GB',{maximumFractionDigits:4});
 const addDays=(date,count)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);};
 function totals(entries,holidays=[]){const out={};for(const e of entries){const n=calculate(e.date,e.payload,holidays.some(h=>h.date===e.date&&h.active));const v=out[e.code]||(out[e.code]={basic:0,normal_ot:0,friday_ot:0,holiday_ot:0,total:0});for(const key in v)v[key]+=n[key];}return out;}
 function validateOverlaps(entries){const grouped={};for(const e of entries){const p=normalize(e.payload);for(const t of p.periods){const base=Date.parse(e.date+'T00:00:00Z')/60000;(grouped[e.code]||(grouped[e.code]=[])).push([base+t.start,base+t.end]);}}for(const intervals of Object.values(grouped)){intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;i++)if(intervals[i][0]<intervals[i-1][1])throw Error('This duty overlaps another date for the same employee.');}}
 function demoMonth(month){const data=demo();data.pharmacy_id='synthetic';data.entries=[];data.holidays=[];data.month=null;
  for(const e of data.employees)for(const d of days(month)){const i=data.employees.indexOf(e),off=(d.day+i)%7===0;const payload=off?normalize({status:'OFF'}):parse(i%3===0?'9 AM – 1 PM / 5 PM – 10 PM':i%3===1?'12 PM – 9 PM':'7 PM – 4 AM');data.entries.push({code:e.code,date:d.date,payload,revision:1,identity:{name:e.name,position_key:e.position_key,position_label:data.positions.find(p=>p.key===e.position_key).label}});}
  data.totals=totals(data.entries);return data;
 }
 const api={defaults,days,shiftMonth,validateEmployee,demo,statuses,time,formatTime,normalize,parse,text,calculate,hours,addDays,totals,validateOverlaps,demoMonth};
 root.DutyModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
