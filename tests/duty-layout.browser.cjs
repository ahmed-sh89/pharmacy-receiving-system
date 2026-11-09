/* Same actual Duty components, synthetic server and fixed desktop surface before/after.
   Zoom is Chromium layout viewport + DPR, with direct CDP captures (no image edits). */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const osScale=Number(process.env.DUTY_LAYOUT_OS_SCALE||1),physical=osScale===1?{width:1366,height:768}:{width:1280,height:720};
const before=process.env.LAYOUT_PHASE==='before',base='6be3bb2ba474c1bf24c821d50026b48e4931e5cb';
const read=p=>before?execFileSync('git',['show',base+':'+p],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:physical}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-09T07:00Z')});
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><body style="font-family:Arial,sans-serif"><header class="topBar" style="height:56px"></header><main style="margin-left:216px;padding:12px"><section id="page-duty" class="appPage active"></section></main></body>'}));await page.goto('https://offline.pharmflow.test/');await page.addStyleTag({content:read('css/duty.css')});
 await page.evaluate(()=>{window.APP_CONFIG={environment:'staging'};window.AuthState={identityEpoch:1,session:{},user:{id:'synthetic'},context:{pharmacy_id:'layout-test',user_id:'synthetic',pharmacy_code:'SYNTHETIC'}};window.AUTH_STORAGE_KEY='auth';window.AppRouter={currentRoute:'duty'};window.events={};window.AppEvents={on:(n,fn)=>events[n]=fn};window.PharmFlowPermissions={allowed:()=>true};});
 for(const p of ['duty-model','duty-controls','duty-schedule','duty-reports'])await page.addScriptTag({content:read('js/'+p+'.js')});
 await page.evaluate(()=>{
  const names=['Ahmed Hassan','Mohamed Ali','Omar Ibrahim','Khaled Mahmoud','Youssef Ahmed','Mostafa Adel'];
  window.db={pharmacy_id:'layout-test',can_write:true,manual_hours:true,persistent_settings:true,holiday_first:true,positions:DutyModel.defaults,employees:Array.from({length:32},(_,i)=>({code:'E'+String(i+1).padStart(3,'0'),display_code:'SYN-'+String(i+1).padStart(3,'0'),name:names[i]||'Synthetic Employee '+(i+1),position_key:i<8?'pharmacist':'labor',active:true,sort_order:i,basic_minutes:480})),entries:[],holidays:[{date:'2026-11-13',active:true,name:'Test Holiday'}],hour_rules:[],shift_presets:[{id:'day',name:'Day',periods:[{start:540,end:1080}]}]};
  for(const e of db.employees.slice(0,8))for(let d=1;d<=30;d++)db.entries.push({code:e.code,date:'2026-11-'+String(d).padStart(2,'0'),revision:1,payload:DutyModel.parse('9 AM–6 PM')});
  window.writes=0;window.authRpc=async name=>{if(name!=='get_pharmflow_duty_schedule_v1'){writes++;throw Error('Unexpected layout write');}return structuredClone(db);};window.originalData=JSON.stringify(db);
 });await page.addScriptTag({content:read('js/duty.js')});await page.evaluate(()=>events['route:changed']({routeName:'duty'}));await page.locator('[data-s-code=E001]').first().waitFor();
 const cdp=await page.context().newCDPSession(page),evidence=process.env.DUTY_LAYOUT_EVIDENCE_DIR,measurements=[];if(evidence)fs.mkdirSync(evidence,{recursive:true});
 const snap=async name=>{if(evidence){const shot=await cdp.send('Page.captureScreenshot',{format:'webp',quality:90,fromSurface:true,captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,(before?'before':'after')+'-'+name+'.webp'),Buffer.from(shot.data,'base64'));}};
 for(const zoom of [.67,.7,.75,.8,.9,1]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.round(physical.width/(zoom*osScale)),height:Math.round(physical.height/(zoom*osScale)),deviceScaleFactor:zoom*osScale,mobile:false});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.evaluate(()=>new Promise(requestAnimationFrame));
  const m=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};},q=s=>document.querySelector(s);
   const controls=q('.duty-schedule-controls'),grid=q('.duty-grid-scroll'),head=q('.duty-vertical thead');
   const cards=[...document.querySelectorAll('.duty-mini-kpis')].map(e=>({box:box(e),items:[...e.children].map(c=>({text:c.textContent,...box(c),overflow:c.scrollWidth>c.clientWidth}))}));
   return {viewport:innerWidth,pagination:box(q('.duty-period')),controls:box(controls),badge:box(q('[data-duty-today]')),grid:box(grid),head:box(head),cards,pageOverflow:document.documentElement.scrollWidth>innerWidth,headerActions:[...q('.duty-toolbar').querySelectorAll('button')].filter(e=>e.getClientRects().length).map(box),actions:[...controls.querySelectorAll('button,[data-duty-today]')].filter(e=>e.getClientRects().length).map(box)};
  });m.zoom=zoom;measurements.push(m);
  if(!before){
   assert(!m.pageOverflow);assert(m.pagination.w<=82,'staff pagination uses compact intrinsic width');
   assert.equal(m.cards.length,6);
   for(const c of m.cards){const a=c.items;assert.equal(a.length,5);assert(Math.abs(a[0].y-a[1].y)<1);assert(Math.abs(a[2].y-a[3].y)<1);assert(a[2].y>a[0].y&&a[4].y>a[2].y);assert(Math.abs(a[4].w-c.box.w)<1);assert(a.every(v=>!v.overflow),'no KPI text overflow');assert(a[4].h>=24&&a[4].h<=28,'Total gets 4–6px extra within compact section');assert(c.box.h<=66,'KPI section does not grow to enlarge Total');}
   for(const controls of [m.actions,m.headerActions])for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1),'no overlapping controls');}
   assert(m.badge.bottom<=m.controls.bottom+1,'badge contained by toolbar');
   assert(m.controls.h<=(m.controls.w>1040?36:72),'one compact row where it fits, otherwise two deliberate rows');
  }
  // Put today's row into view without changing selected records.
  await page.locator('[data-s-code=E001][data-s-date="2026-11-07"]').evaluate(e=>{const g=e.closest('.duty-grid-scroll');g.scrollTop+=e.getBoundingClientRect().top-g.querySelector('thead th').getBoundingClientRect().bottom-4;});
  if([.75,.8,.9].includes(zoom))await snap('schedule-'+Math.round(zoom*100));
  await page.locator('[data-duty-tab=reports]').click();await page.locator('[data-report-employee-trigger]').click();
  const rows=page.locator('[data-report-employee-list] [role=option]'),row1=rows.nth(1),row2=rows.nth(2);await row1.hover();
  if(!before){
   const color=await row1.evaluate(e=>getComputedStyle(e).backgroundColor);await row2.hover();assert.notEqual(await row1.evaluate(e=>getComputedStyle(e).backgroundColor),color);assert.equal(await row2.evaluate(e=>getComputedStyle(e).backgroundColor),color);
   assert(await row2.evaluate(e=>{const c=getComputedStyle(e);return c.borderTopStyle==='solid'&&parseFloat(c.borderTopWidth)>=1;}));
  }
  await row1.click();await page.locator('[data-report-employee-trigger]').click();await rows.nth(2).hover();
  if(!before){assert.notEqual(await rows.nth(1).evaluate(e=>getComputedStyle(e).backgroundColor),await rows.nth(2).evaluate(e=>getComputedStyle(e).backgroundColor));
  }
  if(zoom===.8&&osScale===1)await snap('reports-'+Math.round(zoom*100));
  await page.keyboard.press('Escape');if(!before){assert.equal(await page.locator('[data-report-employee-trigger]').getAttribute('aria-expanded'),'false');}
  await page.locator('[data-report-clear]').evaluate(e=>{if(!e.disabled)e.click();});await page.locator('[data-duty-tab=schedule]').click();
 }
 if(!before){
  await page.locator('[data-s-action=staff-next]').click();assert.match(await page.locator('.duty-period').textContent(),/2\/2/);assert.equal(await page.locator('.duty-staff-card').count(),2);await page.locator('[data-s-action=staff-back]').click();assert.equal(await page.locator('.duty-staff-card').count(),6);
  // A genuinely narrow content area gets a coherent two-row toolbar; only the
  // internal table may scroll horizontally. Never overlap or force page scroll.
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.evaluate(()=>new Promise(requestAnimationFrame));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('.duty-grid-scroll').evaluate(e=>e.scrollWidth>e.clientWidth));
  assert.equal(await page.evaluate(()=>writes),0);assert.equal(await page.evaluate(()=>JSON.stringify(db)===originalData),true);assert.deepEqual(errors,[]);
 }
 if(evidence)fs.writeFileSync(path.join(evidence,(before?'before':'after')+'-measurements.json'),JSON.stringify(measurements));console.log(JSON.stringify({phase:before?'before':'after',osScale,physical,zooms:measurements.map(m=>({zoom:m.zoom,controls:m.controls.h,pagination:m.pagination.w,kpi:m.cards[0].box.h,grid:m.grid.h,header:m.head.h})),errors}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
