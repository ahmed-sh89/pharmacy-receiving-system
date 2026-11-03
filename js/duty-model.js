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
 const api={defaults,days,shiftMonth,validateEmployee,demo};
 root.DutyModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
