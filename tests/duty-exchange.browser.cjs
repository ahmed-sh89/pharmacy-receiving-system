/* Real browser pointer/double-click tests. Synthetic data and mocked HTTP only. */
const fs=require('node:fs'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><body><section id="page-duty" class="appPage active"></section></body>'}));await page.goto('https://offline.pharmflow.test/');
 async function bootstrap(savedDb){
 await page.addStyleTag({content:fs.readFileSync('css/duty.css','utf8')});
 await page.evaluate(()=>{
  window.APP_CONFIG={environment:'staging'};window.AuthState={identityEpoch:1,session:{},user:{id:'synthetic-user'},context:{pharmacy_id:'synthetic',user_id:'synthetic-user'}};
  window.AUTH_STORAGE_KEY='auth';window.AppRouter={currentRoute:'duty'};window.events={};window.AppEvents={on:(name,cb)=>events[name]=cb};window.PharmFlowPermissions={allowed:()=>true};
 });
 for(const p of ['js/duty-model.js','js/duty-controls.js','js/duty-schedule.js'])await page.addScriptTag({content:fs.readFileSync(p,'utf8')});
 await page.evaluate(()=>{
  window.db={pharmacy_id:'synthetic',can_write:true,manual_hours:true,persistent_settings:true,holiday_first:true,positions:DutyModel.defaults,employees:[{code:'A',name:'Alpha',position_key:'pharmacist',active:true},{code:'B',name:'Beta',position_key:'pharmacist',active:true}],entries:[],holidays:[{date:'2026-11-13',active:true,name:'Holiday'}],hour_rules:[],shift_presets:[{id:'day',name:'Day',periods:[{start:540,end:1080}]}]};
  for(let i=0;i<5;i++)for(const [code,day,start] of [['A',i+1,540+i*15],['B',i+10,780+i*15]])db.entries.push({code,date:'2026-11-'+String(day).padStart(2,'0'),revision:1,payload:DutyModel.normalize({status:'WORK',periods:[{start,end:start+480}],note:code+' original '+day})});
  window.saves=[];window.authRpc=async(name,args)=>{
   if(name==='get_pharmflow_duty_schedule_v1')return structuredClone(db);
   if(name!=='save_pharmflow_duty_schedule_v2')throw Error('Unexpected RPC '+name);
   saves.push(args);const next=structuredClone(db);
   for(const c of args.p_changes){const i=next.entries.findIndex(e=>e.code===c.code&&e.date===c.date),old=next.entries[i];if((old?.revision||0)!==c.expected_revision)throw Error('DUTY_CONFLICT');const row={...c,revision:(old?.revision||0)+1};if(i<0)next.entries.push(row);else next.entries[i]=row;}
   db=next;return structuredClone(db);
  };
 });
 if(savedDb)await page.evaluate(saved=>window.db=saved,savedDb);
 await page.addScriptTag({content:fs.readFileSync('js/duty.js','utf8')});
 await page.evaluate(()=>{document.getElementById('duty-month').value='2026-11';document.getElementById('duty-month').dispatchEvent(new Event('change',{bubbles:true}));});
 }
 await bootstrap();
 const cell=(code,day)=>page.locator(`[data-s-code="${code}"][data-s-date="2026-11-${day}"]`),exchange=page.locator('[data-s-action=exchange]');
 await cell('A','01').waitFor();await cell('A','01').click();assert.equal(await cell('A','01').getAttribute('aria-selected'),'true');await cell('A','01').dblclick();await page.locator('.duty-cell-editor').waitFor();await page.locator('[data-cancel]').click();
 // Repeated real module lifecycle events, including re-entry with identical server data.
 for(let i=0;i<3;i++){
  await page.evaluate(()=>{AppRouter.currentRoute='receiving';events['route:changed']({routeName:'receiving'});AppRouter.currentRoute='duty';events['route:changed']({routeName:'duty'});});
  await cell('A','02').dblclick();await page.locator('.duty-cell-editor').waitFor();await page.locator('[data-cancel]').click();
 }
 for(const tab of ['reports','positions']){if(tab==='reports')await page.evaluate(()=>window.DutyReports={mount(){}});await page.locator(`[data-duty-tab=${tab}]`).click();await page.locator('[data-duty-tab=schedule]').click();await cell('B','03').dblclick();await page.locator('[data-cancel]').click();}
 async function drag(a,b,ctrl=false){await a.evaluate(el=>{const grid=el.closest('.duty-grid-scroll'),head=grid.querySelector('thead th').getBoundingClientRect();grid.scrollTop+=(el.getBoundingClientRect().top-head.bottom-8)/(grid.getBoundingClientRect().width/grid.offsetWidth);});const x=await a.boundingBox(),y=await b.boundingBox();if(ctrl)await page.keyboard.down('Control');await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width/2,y.y+y.height/2,{steps:12});await page.mouse.up();if(ctrl)await page.keyboard.up('Control');}
 for(const zoom of [1,.8,.75]){
  await page.evaluate(z=>document.body.style.zoom=z,zoom);
  await drag(cell('A','01'),cell('A','05'));assert.equal(await page.locator('.duty-selected').count(),5);
  await drag(cell('B','10'),cell('B','14'),true);assert.equal(await page.locator('.duty-selected').count(),10);assert.equal(await page.locator('.duty-range-b').count(),5);assert.equal(await exchange.isDisabled(),false);
  const before=await page.evaluate(()=>structuredClone(db.entries));
  await exchange.click();assert.equal(await page.evaluate(()=>saves.at(-1).p_changes.length),10);
  const after=await page.evaluate(()=>db.entries);
  for(let i=0;i<5;i++){const a='2026-11-'+String(i+1).padStart(2,'0'),b='2026-11-'+String(i+10).padStart(2,'0'),get=(rows,code,date)=>rows.find(e=>e.code===code&&e.date===date).payload;assert.deepEqual(get(after,'A',a),get(before,'B',b));assert.deepEqual(get(after,'B',b),get(before,'A',a));}
  await page.locator('[data-s-action=undo]').click();await page.locator('[data-s-action=redo]').click();
  await drag(cell('A','16'),cell('A','18'),true);assert.equal(await exchange.isDisabled(),true);assert.match(await page.locator('.duty-footnote').textContent(),/Select two equal ranges/);
  await drag(cell('A','01'),cell('A','02'));assert.equal(await page.locator('.duty-selected').count(),2);
 }
 // Shape mismatch (2x1 versus 1x2), overlap, and multi-column compatible rectangles.
 await page.evaluate(()=>document.body.style.zoom=1);
 await drag(cell('A','01'),cell('B','01'));await drag(cell('A','03'),cell('A','04'),true);assert.equal(await exchange.isDisabled(),true);assert.match(await page.locator('.duty-footnote').textContent(),/Select two equal ranges/);
 await drag(cell('A','01'),cell('A','03'));await drag(cell('A','02'),cell('A','04'),true);assert.equal(await exchange.isDisabled(),true);
 await drag(cell('A','01'),cell('B','03'));await drag(cell('A','10'),cell('B','12'),true);assert.equal(await exchange.isDisabled(),false);await exchange.click();assert.equal(await page.evaluate(()=>saves.at(-1).p_changes.length),12);
 // Async authoritative refresh and redundant activation both retain ready handlers.
 await page.evaluate(()=>{db.entries[0].payload=DutyModel.parse('9 AM–6 PM');window.dispatchEvent(new Event('auth:context-ready'));});await cell('A','01').dblclick();await page.locator('[data-cancel]').click();
 const cloud=fs.readFileSync('cloud-workspace.js','utf8');
 await page.addStyleTag({content:fs.readFileSync('css/identity.css','utf8')});
 await page.addScriptTag({content:cloud.slice(0,cloud.indexOf('/* ====================================================='))});
 await page.evaluate(()=>PharmFlowIdleSleep.enter());
 assert.equal(await page.evaluate(()=>PharmFlowIdleSleep.active),true);
 await page.locator('#pf-idle-refresh').click();
 assert.equal(await page.evaluate(()=>PharmFlowIdleSleep.active),false);
 await cell('A','01').dblclick();await page.locator('[data-cancel]').click();
 const persisted=await page.evaluate(()=>db);await page.reload();await bootstrap(persisted);
 await cell('A','01').dblclick();await page.locator('[data-cancel]').click();
 assert.deepEqual(await page.evaluate(()=>db.entries),persisted.entries);
 assert.deepEqual(errors,[]);console.log('PASS real Chromium: click/double-click, repeated navigation/equal response, Reports/Positions, async refresh, Ctrl+Drag 5↔5, multi-column rectangles, third/mismatch/overlap, one-request Exchange, Undo/Redo, CSS zoom 100/80/75%, real Session Paused/resume button, document reload with retained server fixture, no page errors');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
