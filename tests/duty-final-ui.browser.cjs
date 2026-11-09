/* Real Chromium, synthetic server data, no network or operational writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-08T20:59:59Z')});
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><body><main style="margin-left:216px;padding:12px"><section id="page-duty" class="appPage active"></section></main></body>'}));await page.goto('https://offline.pharmflow.test/');await page.addStyleTag({content:fs.readFileSync('css/duty.css','utf8')});
 await page.evaluate(()=>{window.APP_CONFIG={environment:'staging'};window.AuthState={identityEpoch:1,session:{},user:{id:'synthetic'},context:{pharmacy_id:'synthetic-ui',user_id:'synthetic',pharmacy_code:'SYNTHETIC'}};window.AUTH_STORAGE_KEY='auth';window.AppRouter={currentRoute:'duty'};window.events={};window.AppEvents={on:(name,cb)=>events[name]=cb};window.PharmFlowPermissions={allowed:()=>true};});
 for(const p of ['duty-model','duty-controls','duty-schedule','duty-reports'])await page.addScriptTag({content:fs.readFileSync('js/'+p+'.js','utf8')});
 await page.evaluate(()=>{
  const names=['Ahmed Hassan','Mohamed Ali','Omar Ibrahim','Khaled Mahmoud','Youssef Ahmed','Mostafa Adel'];
  window.db={pharmacy_id:'synthetic-ui',can_write:true,manual_hours:true,persistent_settings:true,holiday_first:true,positions:DutyModel.defaults,employees:Array.from({length:48},(_,i)=>({code:'E'+String(i+1).padStart(3,'0'),display_code:'SYN-'+String(i+1).padStart(3,'0'),name:names[i]||'Synthetic Employee '+String(i+1).padStart(2,'0'),position_key:i<6?'pharmacist':'labor',active:true,sort_order:i})),entries:[],holidays:[{date:'2026-11-13',active:true,name:'Test Holiday'}],hour_rules:[],shift_presets:[{id:'day',name:'Day',periods:[{start:540,end:1080}]}]};
  for(const e of db.employees.slice(0,6))for(let d=1;d<=30;d++)db.entries.push({code:e.code,date:'2026-11-'+String(d).padStart(2,'0'),revision:1,payload:d===10?DutyModel.normalize({status:'ANNUAL_LEAVE'}):d===11?DutyModel.normalize({status:'OFF'}):DutyModel.parse('9 AM–6 PM')});
  window.writes=0;window.authRpc=async name=>{if(name!=='get_pharmflow_duty_schedule_v1'){writes++;throw Error('Unexpected UI write '+name);}return structuredClone(db);};window.originalData=JSON.stringify(db);
 });
 await page.addScriptTag({content:fs.readFileSync('js/duty.js','utf8')});await page.evaluate(()=>events['route:changed']({routeName:'duty'}));
 const cell=(code,day)=>page.locator(`[data-s-code="${code}"][data-s-date="2026-11-${day}"]`);
 await cell('E001','08').waitFor();assert.equal(await page.locator('[aria-current=date]').getAttribute('data-s-column'),'2026-11-08');await cell('E001','09').click();const selected=await cell('E001','09').getAttribute('aria-selected');await page.clock.runFor(1100);assert.equal(await page.locator('[aria-current=date]').getAttribute('data-s-column'),'2026-11-09');assert.equal(await cell('E001','09').getAttribute('aria-selected'),selected);assert.match(await page.locator('[data-duty-today]').textContent(),/^Today · 9 Nov$/);
 const evidence=process.env.DUTY_UI_EVIDENCE_DIR;if(evidence)fs.mkdirSync(evidence,{recursive:true});
 async function drag(a,b,ctrl=false){await a.evaluate(el=>{const g=el.closest('.duty-grid-scroll');g.scrollTop+=(el.getBoundingClientRect().top-g.querySelector('thead th').getBoundingClientRect().bottom-8)/(g.getBoundingClientRect().width/g.offsetWidth);});const x=await a.boundingBox(),y=await b.boundingBox();if(ctrl)await page.keyboard.down('Control');await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width/2,y.y+y.height/2,{steps:8});await page.mouse.up();if(ctrl)await page.keyboard.up('Control');}
 for(const zoom of [1,.8,.75]){
  await page.evaluate(z=>document.body.style.zoom=z,zoom);
  const geometry=await cell('E001','09').boundingBox();await drag(cell('E001','07'),cell('E001','11'));await drag(cell('E002','07'),cell('E002','11'),true);
  assert.equal(await page.locator('.duty-selected').count(),10);assert(await cell('E001','09').evaluate(e=>e.classList.contains('duty-edge-right')));assert(await cell('E002','09').evaluate(e=>e.classList.contains('duty-edge-left')));
  const after=await cell('E001','09').boundingBox();assert.equal(after.width,geometry.width);assert.equal(after.height,geometry.height);
  const styles=await cell('E001','09').evaluate(e=>({line:getComputedStyle(e,'::after').borderRightWidth,background:getComputedStyle(e).backgroundColor}));assert(parseFloat(styles.line)*zoom>=.9,'touching range edges retain at least one physical pixel per side');assert.notEqual(styles.background,await cell('E002','09').evaluate(e=>getComputedStyle(e).backgroundColor));
  assert(await cell('E001','10').evaluate(e=>e.classList.contains('duty-leave')));assert.match(await cell('E001','11').textContent(),/OFF/);
  assert(await page.locator('[aria-current=date]').evaluate(e=>e.closest('th').classList.contains('duty-today')));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(evidence)await page.screenshot({path:path.join(evidence,'schedule-'+Math.round(zoom*100)+'.png')});
  await page.locator('[data-duty-tab=reports]').click();const trigger=page.locator('[data-report-employee-trigger]');await trigger.click();const list=page.locator('[data-report-employee-list]');await list.waitFor({state:'visible'});
  assert.equal(await list.locator('[role=option]').count(),49);assert.equal(await list.locator('.duty-employee-code').count(),48);
  const box=await list.boundingBox();assert(box.x>=0&&box.x+box.width<=1366&&box.y>=0&&box.y+box.height<=900);
  assert(await list.evaluate(el=>el.scrollHeight>el.clientHeight));assert(await list.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+15));}));
  const heights=await list.locator('[role=option]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert(Math.max(...heights)-Math.min(...heights)<1);
  if(evidence)await page.screenshot({path:path.join(evidence,'reports-'+Math.round(zoom*100)+'.png')});
  await page.keyboard.press('End');await page.keyboard.press('Enter');assert.match(await trigger.textContent(),/Synthetic Employee 48/);assert.equal(await page.locator('[data-report-copy]').isDisabled(),false);
  await trigger.press('ArrowDown');const chosen=list.locator('[aria-selected=true]');assert(await chosen.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;}));await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert(await trigger.evaluate(e=>e===document.activeElement));
  await trigger.click();await page.locator('.duty-report-heading').click();assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  await trigger.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.match(await trigger.textContent(),/Ahmed Hassan/);
  await trigger.click();await page.keyboard.press('Tab');assert(await page.locator('[data-report-period]').evaluate(e=>e===document.activeElement));
  await page.locator('[data-report-clear]').click();assert.match(await trigger.textContent(),/All Employees/);assert.equal(await page.locator('[data-report-copy]').isDisabled(),true);assert.equal(await page.locator('[data-report-download]').isDisabled(),false);
  await page.locator('[data-duty-tab=schedule]').click();
 }
 // Browser zoom layout equivalence: native desktop zoom changes both layout
 // viewport and DPR. Exercise that Chromium rendering path in addition to CSS zoom.
 const cdp=await page.context().newCDPSession(page);
 for(const zoom of [1,.8,.75]){
  await page.evaluate(()=>document.body.style.zoom=1);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.round(1366/zoom),height:Math.round(900/zoom),deviceScaleFactor:zoom,mobile:false});
  assert(Math.abs(await page.evaluate(()=>devicePixelRatio)-zoom)<.02);assert.equal(await page.evaluate(()=>innerWidth),Math.round(1366/zoom));
  await drag(cell('E001','07'),cell('E001','11'));await drag(cell('E002','07'),cell('E002','11'),true);assert.equal(await page.locator('.duty-selected').count(),10);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(evidence){const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,'schedule-'+Math.round(zoom*100)+'.png'),Buffer.from(shot.data,'base64'));}
  await page.locator('[data-duty-tab=reports]').click();await page.locator('[data-report-employee-trigger]').click();
  assert(await page.locator('[data-report-employee-list]').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  if(evidence){const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,'reports-'+Math.round(zoom*100)+'.png'),Buffer.from(shot.data,'base64'));}
  await page.keyboard.press('Escape');await page.locator('[data-duty-tab=schedule]').click();
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 // Current-day marker respects strict month and custom range; focus recovers after sleep.
 await page.locator('[data-duty-action=next]').click();await cell('E001','09').waitFor({state:'detached'});assert.equal(await page.locator('[aria-current=date]').count(),0);await page.locator('[data-duty-action=previous]').click();await cell('E001','09').waitFor();
 await page.locator('[data-range-trigger]').click();await page.evaluate(()=>{const f=document.querySelector('[data-date-range]');f.querySelector('[name=from]').value='2026-11-01';f.querySelector('[name=to]').value='2026-11-05';f.requestSubmit();});assert.equal(await page.locator('[aria-current=date]').count(),0);await page.locator('[data-s-action=full-month]').click();
 await page.clock.setSystemTime(new Date('2026-11-05T22:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert(await cell('E001','06').evaluate(e=>e.closest('tr').classList.contains('duty-friday-row')));
 const fridayColor=await cell('E001','06').evaluate(e=>getComputedStyle(e).backgroundColor);await cell('E001','06').click();assert.equal(await cell('E001','06').evaluate(e=>getComputedStyle(e).backgroundColor),fridayColor);
 await page.clock.setSystemTime(new Date('2026-11-12T22:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await page.locator('[aria-current=date]').getAttribute('data-s-column'),'2026-11-13');assert(await cell('E001','13').evaluate(e=>e.closest('tr').classList.contains('duty-holiday-row')));assert.match(await page.locator('[aria-current=date]').textContent(),/Friday.*Test Holiday/);
 const holidayColor=await cell('E001','13').evaluate(e=>getComputedStyle(e).backgroundColor);await cell('E001','13').click();assert.equal(await cell('E001','13').evaluate(e=>getComputedStyle(e).backgroundColor),holidayColor);
 assert.equal(await page.evaluate(()=>writes),0);assert.equal(await page.evaluate(()=>JSON.stringify(db)===originalData),true);assert.deepEqual(errors,[]);
 console.log('PASS Chromium UI: independent adjacent ranges and unchanged geometry; local midnight/month/custom-range/Friday+Holiday; mouse/keyboard/scroll/outside/Escape/Tab dropdown; 75/80/100% CSS zoom plus viewport/DPR browser-zoom rendering; 0 writes; no page errors.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
