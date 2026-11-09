/* Same actual Duty components, synthetic server and fixed desktop surface before/after.
   Zoom is Chromium layout viewport + DPR, with direct CDP captures (no image edits). */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const osScale=Number(process.env.DUTY_LAYOUT_OS_SCALE||1),physical=osScale===1?{width:1366,height:768}:{width:1280,height:720};
const before=process.env.GRID_PHASE==='before',base='d97d60417f53659d34782953a67c48c3b2a542db';
const read=p=>before?execFileSync('git',['show',base+':'+p],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:physical}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-09T07:00Z')});
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><body style="font-family:Arial,sans-serif"><header class="topBar" style="height:56px"></header><main style="margin-left:216px;padding:12px"><section id="page-duty" class="appPage active"></section></main></body>'}));await page.goto('https://offline.pharmflow.test/');await page.addStyleTag({content:read('css/duty.css')});
 await page.evaluate(()=>{window.APP_CONFIG={environment:'staging'};window.AuthState={identityEpoch:1,session:{},user:{id:'synthetic'},context:{pharmacy_id:'layout-test',user_id:'synthetic',pharmacy_code:'SYNTHETIC'}};window.AUTH_STORAGE_KEY='auth';window.AppRouter={currentRoute:'duty'};window.events={};window.AppEvents={on:(n,fn)=>events[n]=fn};window.PharmFlowPermissions={allowed:()=>true};});
 for(const p of ['duty-model','duty-controls','duty-schedule','duty-reports'])await page.addScriptTag({content:read('js/'+p+'.js')});
 await page.evaluate(()=>{
  const names=['Ahmed Hassan','Mohamed Ali','Omar Ibrahim','Khaled Mahmoud','Youssef Ahmed','Mostafa Adel'];
  window.db={pharmacy_id:'layout-test',can_write:true,manual_hours:true,persistent_settings:true,holiday_first:true,positions:DutyModel.defaults,employees:Array.from({length:32},(_,i)=>({code:'E'+String(i+1).padStart(3,'0'),display_code:'SYN-'+String(i+1).padStart(3,'0'),name:names[i]||'Synthetic Employee '+(i+1),position_key:i<8?'pharmacist':'labor',active:true,sort_order:i,basic_minutes:480})),entries:[],holidays:[{date:'2026-11-13',active:true,name:'Test Holiday'}],hour_rules:[],shift_presets:[{id:'day',name:'Day',periods:[{start:540,end:1080}]}]};
  for(const e of db.employees.slice(0,8))for(let d=1;d<=30;d++)db.entries.push({code:e.code,date:'2026-11-'+String(d).padStart(2,'0'),revision:1,payload:d===10?DutyModel.normalize({status:'ANNUAL_LEAVE'}):d===11?DutyModel.normalize({status:'OFF'}):DutyModel.parse('9 AM–6 PM')});
  window.writes=0;window.authRpc=async name=>{if(name!=='get_pharmflow_duty_schedule_v1'){writes++;throw Error('Unexpected layout write');}return structuredClone(db);};window.originalData=JSON.stringify(db);
 });await page.addScriptTag({content:read('js/duty.js')});await page.evaluate(()=>events['route:changed']({routeName:'duty'}));await page.locator('[data-s-code=E001]').first().waitFor();
 const cdp=await page.context().newCDPSession(page),evidence=process.env.DUTY_GRID_EVIDENCE_DIR,measurements=[];if(evidence)fs.mkdirSync(evidence,{recursive:true});
 const cell=(code,day)=>page.locator(`[data-s-code="${code}"][data-s-date="2026-11-${day}"]`);
 async function capture(name){if(evidence){const shot=await cdp.send('Page.captureScreenshot',{format:'webp',quality:90,fromSurface:true,captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,name+'.webp'),Buffer.from(shot.data,'base64'));}}
 async function drag(a,b,ctrl=false){await a.evaluate(el=>{const g=el.closest('.duty-grid-scroll');g.scrollTop+=el.getBoundingClientRect().top-g.querySelector('thead th').getBoundingClientRect().bottom-4;});const x=await a.boundingBox(),y=await b.boundingBox();if(ctrl)await page.keyboard.down('Control');await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width/2,y.y+y.height/2,{steps:8});await page.mouse.up();if(ctrl)await page.keyboard.up('Control');}
 for(const zoom of [.75,.8,.9,1]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.round(1366/zoom),height:Math.round(768/zoom),deviceScaleFactor:zoom,mobile:false});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.evaluate(()=>new Promise(requestAnimationFrame));
  await cell('E001','08').press('Escape');await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,0);
  await cell('E001','07').evaluate(e=>{const g=e.closest('.duty-grid-scroll');g.scrollTop+=e.getBoundingClientRect().top-g.querySelector('thead th').getBoundingClientRect().bottom-4;});
  if(!before)await page.evaluate(()=>{
   for(const card of document.querySelectorAll('.duty-mini-kpis')){
    const total=card.querySelector('.duty-category-total'),number=total.querySelector('b'),r=total.getBoundingClientRect(),n=number.getBoundingClientRect();if(r.height!==26)throw Error('Total bar height changed');if(Math.abs((n.left+n.width/2)-(r.left+r.width/2))>.1)throw Error('Total not mathematically centered');
    for(const item of card.children){const text=document.createRange();text.selectNodeContents(item.querySelector('.duty-kpi-label'));const label=text.getBoundingClientRect(),value=item.querySelector('b').getBoundingClientRect();if(value.left-label.right<3.9)throw Error('KPI label/value gap '+item.textContent+' '+(value.left-label.right)+' width '+item.clientWidth+' font '+getComputedStyle(item).fontSize+' labelFont '+getComputedStyle(item.querySelector('.duty-kpi-label')).fontSize+' label '+label.width+' value '+value.width+' tracks '+getComputedStyle(item).gridTemplateColumns);if(item.scrollWidth>item.clientWidth)throw Error('KPI overflow');}
   }
   const badge=document.querySelector('[data-duty-today]');if(badge.textContent!=='Today · 9 Nov'||badge.querySelector('small')||getComputedStyle(badge).whiteSpace!=='nowrap')throw Error('Badge must be one line without weekday');
  });
  const m=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
   const cell=q('[data-s-code=E001][data-s-date="2026-11-08"]'),style=getComputedStyle(cell);
   const backgrounds={};for(const day of ['06','09','10','11','13']){const td=q(`[data-s-code=E001][data-s-date="2026-11-${day}"]`);backgrounds[day]=[getComputedStyle(td).backgroundColor,td.closest('tr').className,td.textContent.trim()];}
   return {geometry:{grid:rect(q('.duty-grid-scroll')),table:rect(q('.duty-vertical table')),header:rect(q('.duty-vertical thead')),kpis:[...document.querySelectorAll('.duty-mini-kpis')].map(rect),cells:[...document.querySelectorAll('[data-s-code]')].map(rect),scroll:[q('.duty-grid-scroll').clientWidth,q('.duty-grid-scroll').scrollWidth]},borders:{vertical:style.borderRightColor,horizontal:style.borderBottomColor,width:style.borderRightWidth,bottom:style.borderBottomWidth},backgrounds,pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });m.zoom=zoom;measurements.push(m);
  if(!before){assert.equal(m.borders.vertical,'rgb(145, 171, 196)');assert.equal(m.borders.horizontal,'rgb(203, 217, 230)');assert(!m.pageOverflow);assert.equal(m.geometry.scroll[0],m.geometry.scroll[1]);}
  await capture((before?'before':'after')+'-'+Math.round(zoom*100));
  if(!before){
   await drag(cell('E001','07'),cell('E001','09'));await drag(cell('E002','07'),cell('E002','09'),true);assert.equal(await page.locator('.duty-selected').count(),6);
   assert(await cell('E001','08').evaluate(e=>e.classList.contains('duty-edge-right')));assert(await cell('E002','08').evaluate(e=>e.classList.contains('duty-edge-left')));
   assert.equal(await cell('E001','08').evaluate(e=>getComputedStyle(e,'::after').borderRightColor),'rgb(35, 108, 166)');
   assert.equal(await cell('E002','08').evaluate(e=>getComputedStyle(e,'::after').borderLeftColor),'rgb(23, 78, 130)');
   if(zoom===.8)await capture('after-selected-80');
   await cell('E001','08').dblclick();await page.locator('.duty-cell-editor').waitFor();await page.locator('[data-cancel]').click();
   await page.locator('[data-duty-tab=reports]').click();await page.locator('[data-report-employee-trigger]').click();await page.locator('[data-employee-option=E001]').click();assert.equal(await page.locator('[data-report-copy]').isDisabled(),false);assert.equal(await page.locator('[data-report-download]').isDisabled(),false);await page.locator('[data-report-clear]').click();await page.locator('[data-duty-tab=schedule]').click();
  }
 }
 if(!before){
  const reference=JSON.parse(fs.readFileSync(path.join(evidence,'before-measurements.json'),'utf8'));
  for(let i=0;i<reference.length;i++){assert.deepEqual(measurements[i].geometry,reference[i].geometry,'all cell/header/KPI/scroll geometry must match accepted baseline at '+measurements[i].zoom);assert.deepEqual(measurements[i].backgrounds,reference[i].backgrounds,'Friday/Holiday/Today/OFF/Leave unchanged');assert.equal(measurements[i].borders.width,reference[i].borders.width);assert.equal(measurements[i].borders.bottom,reference[i].borders.bottom);}
  assert.equal(await page.evaluate(()=>writes),0);assert.equal(await page.evaluate(()=>JSON.stringify(db)===originalData),true);assert.deepEqual(errors,[]);
 }
 if(evidence)fs.writeFileSync(path.join(evidence,(before?'before':'after')+'-measurements.json'),JSON.stringify(measurements));console.log(JSON.stringify({phase:before?'before':'after',zooms:measurements.map(m=>({zoom:m.zoom,borders:m.borders,header:m.geometry.header,grid:m.geometry.grid})),writes:await page.evaluate(()=>writes),errors}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
