const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('js/duty-model.js','utf8'),c);const M=c.DutyModel;
const ordinary='2026-11-04',friday='2026-11-06';
for(const [label,shift,total,basic,ot] of [['nine hours','12 PM–9 PM',540,540,0],['short duty','3 PM–8:30 PM',330,330,0],['fractional OT','12 PM–11:30 PM',690,540,150],['split duty','9 AM–1 PM / 5 PM–10 PM',540,540,0],['overnight','7 PM–4 AM',540,540,0],['quarter hours','9 AM–4:15 PM',435,435,0]])test(label,()=>{const n=M.calculate(ordinary,M.parse(shift));assert.equal(n.total,total);assert.equal(n.basic,basic);assert.equal(n.normal_ot,ot);});
test('Thursday midnight remains Thursday; Friday/holiday precedence',()=>{
 const p=M.parse('7 PM–4 AM');assert.equal(M.calculate('2026-11-05',p).friday_ot,0);assert.equal(M.calculate(friday,p).friday_ot,540);
 assert.equal(M.calculate(ordinary,p,true).holiday_ot,540);const n=M.calculate(friday,p,true);assert.equal(n.holiday_ot,540);assert.equal(n.friday_ot+n.basic+n.normal_ot,0);
});
test('manual basic limit and leave zero worked minutes',()=>{assert.equal(M.calculate(ordinary,M.parse('12 PM–9 PM',{basic_limit:480})).normal_ot,60);for(const status of ['OFF','ANNUAL_LEAVE','SICK_LEAVE','OTHER_LEAVE','EMPTY'])assert.equal(M.calculate(ordinary,M.normalize({status})).total,0);});
test('invalid, overlapping and overlong periods are rejected',()=>{for(const value of ['14:00–18:00','9 AM–9 AM','9 AM–1 PM / 12 PM–6 PM','9 AM–6 PM / 8 AM–9 PM'])assert.throws(()=>M.parse(value),value);assert.throws(()=>M.normalize({status:'OFF',periods:[{start:540,end:600}]}));});
test('adjacent-date overlap rejected; no overlap for normal consecutive nights',()=>{assert.throws(()=>M.validateOverlaps([{code:'A',date:ordinary,payload:M.parse('7 PM–4 AM')},{code:'A',date:'2026-11-05',payload:M.parse('3 AM–8 AM')}]));M.validateOverlaps([{code:'A',date:ordinary,payload:M.parse('7 PM–4 AM')},{code:'A',date:'2026-11-05',payload:M.parse('7 PM–4 AM')}]);});
test('copy recalculates destination date and minute accumulation is exact',()=>{const p=M.parse('9 AM–6:15 PM'),entries=[{code:'A',date:ordinary,payload:p},{code:'A',date:friday,payload:p}];const n=M.totals(entries).A;assert.equal(n.total,1110);assert.equal(n.friday_ot,555);assert.equal(n.normal_ot,15);assert.equal(M.text(p),'9:00 AM – 6:15 PM');});
test('one-minute periods accumulate without fractional loss',()=>{const p=M.parse('9 AM–9:01 AM'),entries=M.days('2026-11').map(d=>({code:'A',date:d.date,payload:p}));assert.equal(M.totals(entries).A.total,30);});

test('manual category values replace automatic values and work without periods',()=>{
 const hoursOnly=M.normalize({status:'WORK',manual_minutes:{basic:540,normal_ot:15}});
 assert.equal(M.calculate(ordinary,hoursOnly).total,555);
 const timed=M.parse('9 AM–7:15 PM',{manual_minutes:{basic:480,normal_ot:30}});
 assert.equal(M.calculate(ordinary,timed).total,510);
 assert.equal(M.calculate(ordinary,M.parse('9 AM–6 PM',timed)).basic,480);
 assert.equal(M.calculate(friday,M.parse('9 AM–6 PM',{manual_minutes:{holiday_ot:0}}),true).total,0);
 assert.equal(M.calculate(ordinary,M.parse('OFF',timed)).total,0);
 assert.throws(()=>M.normalize({status:'WORK',manual_minutes:{total:540}}));
 assert.throws(()=>M.normalize({status:'OFF',manual_minutes:{basic:540}}));
});
test('real Postgres engine: batch transactions, computed minutes, isolation, history, locks and overlaps',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema pharmflow_auth_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.is_system_owner() returns boolean language sql stable as $$select false$$;
 create function pharmflow_auth_private.password_change_complete() returns boolean language sql stable as $$select coalesce(current_setting('test.valid',true),'yes')='yes'$$;
 create table public.pharmacies(id uuid primary key,status text default 'active',active boolean default true);
 create table public.pharmacy_members(pharmacy_id uuid,user_id uuid,active boolean,role text);
 insert into public.pharmacies(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.pharmacy_members values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'admin');
 set test.uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`);
 for(const path of ['supabase/migrations/20261103235030_duty_stage_a_foundation.sql','supabase/migrations/20261103235335_duty_position_default_name_validation.sql','supabase/migrations/20261104013200_duty_stage_b_scheduling.sql'])await db.exec(fs.readFileSync(path,'utf8'));
 const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',q=(sql,args=[])=>db.query(sql,args);
 for(const code of ['TEST-A','TEST-B'])await q('select save_pharmflow_duty_employee_v1($1,$2,$3,$4,$5,$6)',[pid,code,'Synthetic '+code,'pharmacist',true,0]);
 const change=(code,date,text,revision=0)=>({code,date,expected_revision:revision,payload:M.parse(text)});
 const save=(changes,target=pid)=>q('select save_pharmflow_duty_entries_v1($1,$2::jsonb,$3)',[target,JSON.stringify(changes),'Synthetic test']);
 const read=async month=>(await q('select get_pharmflow_duty_schedule_v1($1,$2) d',[pid,month+'-01'])).rows[0].d;
 assert.equal((await read('2026-11')).entries.length,0);assert.equal((await read('2026-11')).month,null);
 await save([change('TEST-A',ordinary,'12 PM–11:30 PM'),change('TEST-A',friday,'7 PM–4 AM')]);
 let rows=(await read('2026-11')).entries;assert.equal(rows[0].minutes.normal_ot,150);assert.equal(rows[1].minutes.friday_ot,540);
 await assert.rejects(save([change('TEST-A',ordinary,'12 PM–9 PM',0)]),/DUTY_CONFLICT/);
 await assert.rejects(save([change('TEST-B',ordinary,'9 AM–6 PM'),change('TEST-A',ordinary,'12 PM–9 PM',0)]),/DUTY_CONFLICT/);
 assert.ok(!(await read('2026-11')).entries.some(e=>e.code==='TEST-B'));
 await assert.rejects(save([change('TEST-A','2026-11-07','3 AM–8 AM')]),/overlaps/);
 await q('select set_pharmflow_duty_holiday_v1($1,$2,$3,$4)',[pid,ordinary,true,0]);
 rows=(await read('2026-11')).entries;assert.equal(rows[0].minutes.holiday_ot,690);assert.equal(rows[0].minutes.basic,0);
 await q('select set_pharmflow_duty_holiday_v1($1,$2,$3,$4)',[pid,friday,true,0]);
 assert.equal((await read('2026-11')).entries[1].minutes.friday_ot,540);
 await save([change('TEST-B',ordinary,'9 AM–1 PM / 5 PM–10 PM')]);
 await q('select save_pharmflow_duty_employee_v1($1,$2,$3,$4,$5,$6)',[pid,'TEST-B','Renamed synthetic','pharmacist',false,1]);
 assert.equal((await read('2026-11')).entries.find(e=>e.code==='TEST-B').identity.name,'Synthetic TEST-B');
 await assert.rejects(save([change('TEST-A','2026-11-10','9 AM–6 PM')],other),/access required/);
 const revision=(await read('2026-11')).month.revision;
 await q('select set_pharmflow_duty_month_v1($1,$2,$3,$4,$5)',[pid,'2026-11-01','Completed',revision,'Reviewed synthetic plan']);
 await assert.rejects(save([change('TEST-A','2026-11-10','OFF')]),/completed/);
 await assert.rejects(q('select set_pharmflow_duty_holiday_v1($1,$2,$3,$4)',[pid,'2026-11-10',true,0]),/completed/);
 await q('select set_pharmflow_duty_month_v1($1,$2,$3,$4,$5)',[pid,'2026-11-01','Draft',revision+1,'Historical correction']);
 const leave=['2026-11-10','2026-11-11','2026-11-12'].map(date=>change('TEST-A',date,'Annual Leave'));await save(leave);assert.equal((await read('2026-11')).entries.filter(e=>e.payload.status==='ANNUAL_LEAVE').length,3);
 await save([change('TEST-A',ordinary,'',1)]);assert.equal((await read('2026-11')).entries.find(e=>e.date===ordinary&&e.code==='TEST-A').revision,2);
 const bad=change('TEST-A','2026-11-15','9 AM–6 PM');bad.payload.periods[0].start=1.5;await assert.rejects(save([bad]),/integer minutes/);
 assert.equal((await read('2026-11')).manual_hours,undefined);
 // Upgrade the legacy fixtures using the actual release contract, not the
 // superseded manual-hours proposal that is deliberately excluded.
 await db.exec(`create table public.pharmflow_pharmacy_permissions_v1(
  pharmacy_id uuid primary key references pharmacies(id),receiving text default 'FULL',expiry text default 'FULL',
  data_access text default 'READ_ONLY',revision bigint default 1,updated_by uuid,updated_at timestamptz);
 create table public.pharmflow_permission_audit_v1(pharmacy_id uuid,actor uuid,before_value jsonb,after_value jsonb);
 insert into public.pharmflow_pharmacy_permissions_v1(pharmacy_id) select id from public.pharmacies;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261105183357_duty_production_readiness_staging.sql','utf8'));
 await q("update public.pharmflow_pharmacy_permissions_v1 set duty='FULL' where pharmacy_id=$1",[pid]);
 assert.equal((await read('2026-11')).manual_hours,true);
 const manualDay='2026-11-16',manualPayload=M.normalize({status:'WORK',manual_minutes:{basic:540,normal_ot:15}});
 await save([{code:'TEST-A',date:manualDay,payload:manualPayload,expected_revision:0}]);
 const saved=(await read('2026-11')).entries.find(e=>e.date===manualDay);
 assert.deepEqual(saved.minutes,{basic:540,normal_ot:15,friday_ot:0,holiday_ot:0,total:555});
 assert.deepEqual(saved.payload.manual_minutes,{basic:540,normal_ot:15});
 const manualFriday='2026-11-20',timed=M.parse('9 AM–6 PM',{manual_minutes:{friday_ot:75,holiday_ot:15}});
 await save([{code:'TEST-A',date:manualFriday,payload:timed,expected_revision:0}]);
 assert.deepEqual((await read('2026-11')).entries.find(e=>e.date===manualFriday).minutes,JSON.parse(JSON.stringify(M.calculate(manualFriday,timed))));
 await assert.rejects(save([{code:'TEST-A',date:manualDay,payload:manualPayload,expected_revision:0}]),/DUTY_CONFLICT/);
 const audit=(await q("select after_record from pharmflow_duty_audit_v1 where entity_key='TEST-A/2026-11-16'")).rows;
 assert.equal(audit.length,1);assert.equal(audit[0].after_record.payload.manual_minutes.basic,540);
 await assert.rejects(save([{code:'TEST-A',date:manualDay,payload:{...manualPayload,manual_minutes:{basic:1441}},expected_revision:1}]),/0 to 1440/);
 await assert.rejects(save([{code:'TEST-A',date:manualDay,payload:manualPayload,expected_revision:0}],other),/access required/);
 await db.exec(`set role authenticated;`);await assert.rejects(q('select * from pharmflow_duty_entries_v1'),/permission denied/);await db.exec('reset role;set test.valid=\'no\';');await assert.rejects(read('2026-11'),/access required/);
 await db.close();
});

test('dated Basic rules use shift start, employee priority and exclusive special-day hours',()=>{
 const employee={code:'P1',basic_minutes:480};
 const rule={start:'2026-11-04T05:00',end:'2026-11-30T23:59',codes:[],basic:420};
 const afterIftar={...rule,start:'2026-11-04T18:00',end:'2026-11-04T23:59',basic:360};
 const date='2026-11-04',before=M.parse('8 AM–5 PM'),after=M.parse('7 PM–4 AM');
 const hours=(date,p,holiday=false,rules=[rule,afterIftar])=>M.calculate(date,p,holiday,M.basicAllowance(date,p,employee,rules));
 assert.equal(hours(date,before).basic,420);
 assert.equal(hours(date,before).normal_ot,120);
 assert.equal(hours(date,after).basic,360);
 assert.equal(hours(date,after).normal_ot,180);
 const prior=M.parse('5 PM–5 AM');
 const beforeBoundary=M.calculate('2026-11-03',prior,false,M.basicAllowance('2026-11-03',prior,{code:'P1'},[rule]));
 assert.deepEqual([beforeBoundary.basic,beforeBoundary.normal_ot],[540,180]);
 const exact=hours(date,M.parse('5 AM–2 PM'),false,[rule]);
 assert.deepEqual([exact.basic,exact.normal_ot],[420,120]);
 assert.equal(hours(date,after,false,[rule,{...rule,codes:['P1'],basic:330},afterIftar]).basic,330);
 assert.equal(hours('2026-12-01',before).basic,480);
 const holiday=hours(date,M.parse('7 PM–5 AM'),true);
 assert.deepEqual([holiday.basic,holiday.normal_ot,holiday.friday_ot,holiday.holiday_ot,holiday.total],[0,0,0,600,600]);
 const friday=hours('2026-11-06',after);
 assert.deepEqual([friday.basic,friday.normal_ot,friday.friday_ot,friday.holiday_ot,friday.total],[0,0,540,0,540]);
 const manual=hours(date,M.normalize({...after,manual_minutes:{basic:300}}));
 assert.deepEqual([manual.basic,manual.normal_ot,manual.total],[300,180,480]);
 assert.equal(M.totals([{date,code:'P1',payload:after}],[],[employee],[rule]).P1.total,540);
});

test('full manual allocations replace automatic categories and pending Working has zero hours',()=>{
 const date='2026-11-03',shift=M.parse('3 PM–1 AM');
 const auto=M.calculate(date,shift);
 assert.deepEqual([auto.basic,auto.normal_ot,auto.total],[540,60,600]);
 const manual=M.normalize({...shift,manual_minutes:{basic:480,normal_ot:0,friday_ot:0,holiday_ot:120}});
 const actual=M.calculate(date,manual,true);
 assert.deepEqual([actual.basic,actual.normal_ot,actual.friday_ot,actual.holiday_ot,actual.total],[480,0,0,120,600]);
 assert.equal(M.calculate(date,M.normalize({status:'WORK',working_pending:true})).total,0);
 assert.equal(M.calculate(date,M.normalize({...manual,manual_minutes:undefined})).normal_ot,60);
});

test('future Basic defaults preserve prior hours, rules and manual allocations',()=>{
 const employee={code:'P1',basic_minutes:540,basic_defaults:[{from:'2026-12-01',minutes:480}]};
 const shift=M.parse('9 AM–6 PM');
 assert.equal(M.basicDefault(employee),480);
 assert.equal(M.basicAllowance('2026-11-30',shift,employee),540);
 assert.equal(M.basicAllowance('2026-12-01',shift,employee),480);
 const rule={start:'2026-12-01T00:00',end:'2026-12-01T23:59',codes:['P1'],basic:420};
 assert.equal(M.basicAllowance('2026-12-01',shift,employee,[rule]),420);
 const manual=M.normalize({...shift,manual_minutes:{basic:480,normal_ot:60,friday_ot:0,holiday_ot:0}});
 assert.equal(M.calculate('2026-12-01',manual,true,420).total,540);
});

test('November 7 existing shift uses the confirmed Basic date independently of the roster schedule',()=>{
 const employee={code:'A',active:true},other={code:'B',active:true,basic_minutes:480},inactive={code:'C',active:false};
 const employees=[employee,other,inactive],shift=M.parse('1 PM–10 PM');
 const hours=(date,person,payload=shift,rules=[])=>structuredClone(M.effectiveHours(date,payload,false,person,rules));
 const expected={basic:480,normal_ot:60,friday_ot:0,holiday_ot:0,total:540};
 assert.equal(hours('2026-11-07',employee).basic,540);
 assert.deepEqual(hours('2026-11-07',{basic_minutes:M.hourMinutes(8)}),expected);
 assert.equal(hours('2026-11-07',employee).basic,540);
 assert.throws(()=>M.basicUpdates(employees,480,'2026-11-04','2026-11-05'),/today or later/);
 const plan=M.basicUpdates(employees,480,'2026-11-07','2026-11-05');
 assert.deepEqual(Array.from(plan,x=>x.employee.code),['A']);
 assert.equal(employee.basic_defaults,undefined);
 for(const change of plan)change.employee.basic_defaults=change.defaults;
 assert.equal(M.basicAllowance('2026-11-06',shift,employee),540);
 assert.deepEqual(hours('2026-11-07',employee),expected);
 assert.deepEqual(structuredClone(M.totals([{code:'A',date:'2026-11-07',payload:shift}],[],employees).A),expected);
 const rule={start:'2026-11-07T13:00',end:'2026-11-07T13:00',codes:['A'],basic:420};
 assert.equal(hours('2026-11-07',employee,shift,[rule]).basic,420);
 const manual=M.normalize({...shift,manual_minutes:{basic:540,normal_ot:0,friday_ot:0,holiday_ot:0}});
 assert.equal(hours('2026-11-07',employee,manual).basic,540);
});

test('editor defaults distinguish empty, timed, pending, and hours-only records',()=>{
 assert.deepEqual(structuredClone(M.editorDefaults(M.normalize())),{hasTimes:true,allocation:'auto'});
 assert.deepEqual(structuredClone(M.editorDefaults(M.parse('3 PM–12 AM'))),{hasTimes:true,allocation:'auto'});
 assert.deepEqual(structuredClone(M.editorDefaults(M.normalize({status:'WORK',working_pending:true}))),{hasTimes:false,allocation:'auto'});
 assert.deepEqual(structuredClone(M.editorDefaults(M.normalize({status:'WORK',manual_minutes:{basic:480}}))),{hasTimes:false,allocation:'manual'});
 assert.deepEqual(structuredClone(M.editorDefaults(M.normalize({...M.parse('3 PM–12 AM'),manual_minutes:{basic:480}}))),{hasTimes:true,allocation:'manual'});
});

test('Auto clipboard resolves destination allowance and day type; Manual preserves its source allocation',()=>{
 const source=M.parse('1 PM–10 PM',{basic_limit:480});
 const employee={code:'B',basic_minutes:480};
 const copy=M.clipboardPayload(source);
 assert.equal(copy.basic_limit,M.DEFAULT_BASIC);
 assert.equal(copy.manual_minutes,undefined);
 const dates=[['2026-11-07',false],['2026-11-13',false],['2026-11-14',true],['2026-11-20',true],['2026-12-01',false]];
 const allocations=dates.map(([date,holiday])=>M.effectiveHours(date,copy,holiday,employee));
 assert.deepEqual(allocations.map(a=>[a.basic,a.normal_ot,a.friday_ot,a.holiday_ot,a.total]),
  [[480,60,0,0,540],[0,0,540,0,540],[0,0,0,540,540],[0,0,0,540,540],[480,60,0,0,540]]);
 const manual=M.parse('1 PM–10 PM',{manual_minutes:{basic:480}});
 const manualCopy=M.clipboardPayload(manual,M.effectiveHours('2026-11-07',manual,false,employee));
 const result=M.effectiveHours('2026-11-20',manualCopy,true,employee);
 assert.deepEqual([result.basic,result.normal_ot,result.friday_ot,result.holiday_ot,result.total],[480,60,0,0,540]);
 assert.equal(M.effectiveHours('2026-12-01',copy,false,{basic_minutes:420}).normal_ot,120);
});
