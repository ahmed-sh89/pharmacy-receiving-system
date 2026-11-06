const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// Reuse the established real-component fixtures without registering their test cases.
let prefix=fs.readFileSync('tests/duty-polish.test.cjs','utf8').split("for(const label of")[0];
prefix=prefix.replace('events={},requests=[]','events={},requests=[],intervals=[]').replace('setInterval:()=>{}','setInterval:(fn,ms)=>intervals.push({fn,ms})').replace('listeners,events,requests,M:','listeners,events,requests,intervals,M:');
const {app,editorFixture,monthData,tick}=new Function('require',prefix+';return {app,editorFixture,monthData,tick};')(require);
const modelContext=require('node:vm').createContext({});require('node:vm').runInContext(fs.readFileSync('js/duty-model.js','utf8'),modelContext);const M=modelContext.DutyModel;
test('shared position identity, grouped saved order, custom positions and legacy eligibility',()=>{
 assert.equal(M.positionTone('pharmacist'),'blue');assert.equal(M.positionTone('labor'),'teal');assert.equal(M.positionTone('beauty-advisor'),'purple');assert.equal(M.positionTone('custom-id'),M.positionTone('custom-id'));
 const groups=M.positionGroups([{code:'A',position_key:'x',sort_order:3},{code:'B',position_key:'x',sort_order:1},{code:'C',position_key:'pharmacist'}],[{key:'pharmacist',label:'Pharmacist',sort_order:0},{key:'x',label:'Custom',sort_order:1}]);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>[g.key,g.employees.map(e=>e.code)]))),[['pharmacist',['C']],['x',['B','A']]]);
 assert(M.presetEligible({id:'legacy'},['pharmacist','labor']));assert(M.presetEligible({positions:[]},['custom']));assert(!M.presetEligible({positions:['pharmacist']},['pharmacist','labor']));assert(M.presetEligible({positions:['pharmacist','labor']},['pharmacist','labor']));
});
test('duration is independent of Basic/OT; scheduling context uses unchanged ordinary/Friday/holiday and overnight rules',()=>{
 for(const [text,minutes] of [['11 AM – 8 PM',540],['7 PM – 5 AM',600],['9 AM – 1 PM / 5 PM – 10 PM',540]])assert.equal(M.presetDuration({periods:M.parse(text).periods}),minutes);
 const p=M.parse('7 PM – 5 AM'),e={basic_minutes:540};assert.equal(M.effectiveHours('2026-11-05',p,false,e,[],true).normal_ot,60);assert.equal(M.effectiveHours('2026-11-06',p,false,e,[],true).friday_ot,600);assert.equal(M.effectiveHours('2026-11-06',p,true,e,[],true).holiday_ot,600);assert.equal(M.effectiveHours('2026-11-05',p,false,{basic_minutes:480},[],true).normal_ot,120);
});
test('three real poll callbacks keep usable data and controls visible; tab changes do not flash Loading; remote changes remain authoritative',async()=>{
 const f=app();Object.defineProperty(f.document,'visibilityState',{value:'visible'});f.window.DutyReports={mount(){}};let clock=Date.now();f.c.Date=class extends Date{static now(){return clock;}};
 f.events['route:changed']({routeName:'duty'});const d=monthData(f.M);f.requests[0].resolve(d);await tick();
 for(let n=0;n<3;n++){clock+=16000;f.intervals[0].fn();assert.equal(f.requests.length,n+2);assert.doesNotMatch(f.root.textContent,/Loading Duty/);assert(!f.root.querySelector('[data-duty-action=calendar]').disabled);
 for(const tab of ['employees','positions','reports','schedule']){f.root.querySelector(`[data-duty-tab=${tab}]`).click();assert.doesNotMatch(f.root.textContent,/Loading Duty/);}
 const next=structuredClone(d);next.employees[1].name='Remote update '+n;f.requests.at(-1).resolve(next);await tick();assert.match(f.root.textContent,new RegExp('Remote update '+n));}
 assert.equal(f.intervals[0].ms,15000);
});
test('background failure retains same-pharmacy data, exposes actionable error and recovers; identity changes clear it',async()=>{
 const f=app();f.events['route:changed']({routeName:'duty'});f.requests[0].resolve(monthData(f.M));await tick();f.listeners['pharmflow:permissions-ready']();f.requests[1].reject(Error('Synthetic offline'));await tick();assert.match(f.root.textContent,/Synthetic offline.*Refresh Duty/);assert(f.root.querySelector('[data-s-code=A]'));
 f.root.querySelector('[data-duty-action=retry]').click();assert.doesNotMatch(f.root.textContent,/Loading Duty/);f.requests[2].resolve(monthData(f.M));await tick();assert.doesNotMatch(f.root.textContent,/Synthetic offline/);
 f.c.AuthState.context={pharmacy_id:'pharmacy-b',user_id:'user-a'};f.c.AuthState.identityEpoch++;f.listeners['auth:context-ready']();assert.equal(f.root.querySelector('[data-s-code=A]'),null);
});
test('directory separates positions, preserves status filtering and reorders only inside the employee position',async()=>{
 const f=app();const d=monthData(f.M);d.positions=[...f.M.defaults,{key:'custom',label:'Custom',active:true}];d.employees.push({code:'L',name:'Labor Name',position_key:'labor',active:true,sort_order:0},{code:'X',name:'Archived Name',position_key:'custom',active:false,archived:true});f.events['route:changed']({routeName:'duty'});f.requests[0].resolve(d);await tick();f.root.querySelector('[data-duty-tab=employees]').click();assert.equal(f.root.querySelectorAll('[data-position-section]').length,2);assert.equal(f.root.querySelectorAll('.duty-record-status.is-active').length,3);
 f.root.querySelector('[data-directory-filter=archived]').click();assert.equal(f.root.querySelectorAll('[data-position-section]').length,1);assert.equal(f.root.querySelector('.duty-record-status').textContent,'Archived');
 f.root.querySelector('[data-directory-filter=active]').click();const a=f.root.querySelector('[data-directory-key=A][data-directory-action=earlier]');assert(!a.disabled);a.click();await tick();const sent=f.requests.at(-1);assert.equal(sent.name,'manage_pharmflow_duty_directory_v2');assert.deepEqual(Array.from(sent.args.p_rows,r=>r.key),['L','A','B','X']);
});
function updateAndResolve(f,request){for(const c of request.changes){const i=f.data.entries.findIndex(e=>e.code===c.code&&e.date===c.date);const old=f.data.entries[i];const row={...c,revision:(old?.revision||0)+1,identity:old?.identity||{name:'Synthetic'}};if(i<0)f.data.entries.push(row);else f.data.entries[i]=row;}request.resolve(f.data);}
test('Ctrl exact November set excludes every Friday; toggle, Cancel, overwrite, batch save, Undo and Redo preserve exact destinations',async()=>{
 const f=editorFixture();f.data.entries[0].payload=f.M.normalize({...f.data.entries[0].payload,note:'Keep note',highlight:'mint',manual_minutes:{basic:300}});
 const dates=f.M.days('2026-11').filter(d=>!d.friday).map(d=>d.date),cell=date=>f.host.querySelector(`[data-s-code=A][data-s-date="${date}"]`);
 for(let i=0;i<dates.length;i++)await f.host.onclick({target:cell(dates[i]),ctrlKey:i>0});assert.equal(f.host.querySelectorAll('.duty-selected').length,26);
 await f.host.onclick({target:cell(dates[3]),ctrlKey:true});assert.equal(f.host.querySelectorAll('.duty-selected').length,25);await f.host.onclick({target:cell(dates[3]),ctrlKey:true});assert.equal(f.host.querySelectorAll('.duty-selected').length,26);
 await f.host.onclick({target:f.host.querySelector('[data-s-action=apply-shift]')});f.confirmation.allow=false;await assert.rejects(f.panels.at(-1).submit(new Map([['preset','split']])));assert.equal(f.requests.length,0);
 f.confirmation.allow=true;const apply=f.panels.at(-1).submit(new Map([['preset','split']]));await tick();const req=f.requests[0];assert.equal(req.changes.length,26);assert.deepEqual(req.changes.map(c=>c.date).sort(),dates.slice().sort());const holiday=req.changes.find(c=>c.date==='2026-11-05');assert.equal(holiday.payload.note,'Keep note');assert.equal(holiday.payload.highlight,'mint');assert.equal(holiday.payload.manual_minutes,undefined);updateAndResolve(f,req);await apply;
 const undo=f.host.onclick({target:f.host.querySelector('[data-s-action=undo]')});await tick();assert.equal(f.requests[1].changes.length,26);assert.equal(f.requests[1].changes.find(c=>c.date==='2026-11-05').payload.manual_minutes.basic,300);updateAndResolve(f,f.requests[1]);await undo;
 const redo=f.host.onclick({target:f.host.querySelector('[data-s-action=redo]')});await tick();assert.deepEqual(f.requests[2].changes.map(c=>c.date).sort(),dates.slice().sort());updateAndResolve(f,f.requests[2]);await redo;assert(!f.data.entries.some(c=>f.M.days('2026-11').find(d=>d.date===c.date)?.friday));
});
test('Quick Shift hides incompatible positions while legacy presets remain usable without saving',()=>{
 const f=editorFixture();f.data.shift_presets.push({id:'labor-only',name:'Labor only',positions:['labor'],periods:[{start:540,end:1080}]});f.host.ondblclick({target:f.host.querySelector('[data-s-code=A][data-s-date="2026-11-05"]')});const q=f.host.querySelector('[data-preset-select]');assert(!q.querySelector('[value="labor-only"]'));assert(q.querySelector('[value=split]'));assert.equal(f.requests.length,0);
});
