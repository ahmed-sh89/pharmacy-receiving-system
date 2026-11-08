const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const prefix=fs.readFileSync('tests/duty-polish.test.cjs','utf8').split("for(const label of")[0];
const {app,editorFixture,monthData,tick}=new Function('require',prefix+';return {app,editorFixture,monthData,tick};')(require);
function cell(f,code,date){return (f.host||f.root).querySelector(`[data-s-code="${code}"][data-s-date="${date}"]`);}
test('unchanged authoritative response after route reactivation retains a ready interactive Schedule',async()=>{
 editorFixture();const f=app();f.events['route:changed']({routeName:'duty'});const d=monthData(f.M);f.requests[0].resolve(d);await tick();
 f.c.AppRouter.currentRoute='receiving';f.events['route:changed']({routeName:'receiving'});
 f.c.AppRouter.currentRoute='duty';f.events['route:changed']({routeName:'duty'});f.requests.at(-1).resolve(structuredClone(d));await tick();
 const host=f.root.querySelector('#duty-schedule-body'),td=cell(f,'A','2026-11-05');host.onclick({target:td});assert.equal(td.getAttribute('aria-selected'),'true');host.ondblclick({target:td});assert(f.root.querySelector('.duty-cell-editor'),'ready unchanged schedule must open editor without tab switching');
});
function resolveSave(f,request){for(const c of request.changes){const i=f.data.entries.findIndex(e=>e.code===c.code&&e.date===c.date),old=f.data.entries[i],row={...c,revision:(old?.revision||0)+1,identity:old?.identity||{name:c.code}};if(i<0)f.data.entries.push(row);else f.data.entries[i]=row;}request.resolve(f.data);}
function selectPair(f,a,b){f.host.onclick({target:cell(f,...a)});f.host.onclick({target:cell(f,...b),ctrlKey:true});}
const action=(f,name)=>f.host.onclick({target:f.host.querySelector(`[data-s-action="${name}"]`)});
test('one-cell Exchange sends both complete payloads in one write and one Undo/Redo frame',async()=>{
 const f=editorFixture(),a=['A','2026-11-05'],b=['B','2026-11-06'];f.data.entries[0].payload=f.M.normalize({status:'WORK',periods:[{start:540,end:780},{start:1020,end:1320}],note:'User note',manual_minutes:{basic:123},highlight:'mint'});
 selectPair(f,a,b);assert(!f.host.querySelector('[data-s-action=exchange]').disabled);const before=structuredClone(f.data.entries[0].payload),pending=action(f,'exchange');assert.equal(f.requests.length,1);assert.equal(f.requests[0].changes.length,2);assert.equal(f.requests[0].changes[0].payload.status,'EMPTY');assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].changes[1].payload)),JSON.parse(JSON.stringify(before)));
 // Duplicate submission while awaiting the atomic RPC is ignored.
 await action(f,'exchange');assert.equal(f.requests.length,1);resolveSave(f,f.requests[0]);await pending;
 const undo=action(f,'undo');assert.equal(f.requests[1].changes.length,2);assert.equal(f.requests[1].changes[0].payload.note,'User note');resolveSave(f,f.requests[1]);await undo;
 const redo=action(f,'redo');assert.equal(f.requests[2].changes.length,2);resolveSave(f,f.requests[2]);await redo;
});
test('invalid and third-range selections never submit; ordinary selection replaces all ranges',async()=>{
 const f=editorFixture();for(const [i,c] of [['A','2026-11-01'],['B','2026-11-02'],['B','2026-11-03']].entries())f.host.onclick({target:cell(f,...c),ctrlKey:i>0});
 assert(f.host.querySelector('[data-s-action=exchange]').disabled);await action(f,'exchange');assert.equal(f.requests.length,0);assert.match(f.host.textContent,/Select two equal ranges/);
 f.host.onclick({target:cell(f,'A','2026-11-04')});assert.equal(f.host.querySelectorAll('.duty-selected').length,1);
});
test('a rejected Exchange and a stale Undo do not mutate authoritative fixture data or create history',async()=>{
 const f=editorFixture();selectPair(f,['A','2026-11-05'],['B','2026-11-06']);const before=JSON.stringify(f.data),pending=action(f,'exchange');f.requests[0].reject(Error('DUTY_CONFLICT'));await pending;assert.equal(JSON.stringify(f.data),before);assert(f.host.querySelector('[data-s-action=undo]').disabled);
 const success=action(f,'exchange');resolveSave(f,f.requests[1]);await success;const undo=action(f,'undo');f.requests[2].reject(Error('DUTY_CONFLICT'));await undo;assert(!f.host.querySelector('[data-s-action=undo]').disabled);assert(f.host.querySelector('[data-s-action=redo]').disabled);
});
test('read-only, unready and completed schedules never permit Exchange or editing',()=>{
 const f=editorFixture();for(const change of [{can_write:false},{can_write:true,month:{status:'Completed'}}]){Object.assign(f.data,change);f.window.DutySchedule.mount(f.host,f.data,{month:'2026-11',demo:false});selectPair(f,['A','2026-11-05'],['B','2026-11-06']);assert(f.host.querySelector('[data-s-action=exchange]').disabled);f.host.ondblclick({target:cell(f,'A','2026-11-05')});assert(!f.host.querySelector('.duty-cell-editor'));}
});
