/* Real classic auth + permission + connection presenters; all HTTP is mocked.
   No Production accounts, data or network are used. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const baseline=process.env.SLEEP_BASELINE==='1';
const read=p=>baseline?require('node:child_process').execFileSync('git',['show','9ed6736:'+p],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TC26_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--no-zygote','--single-process']});
 try{
 const context=await browser.newContext();const page=await context.newPage();let reads=0,refreshes=0,fail=false,invalid=false,deny=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url==='https://offline.pharmflow.test/')return route.fulfill({body:'<!doctype html>'});
  if(url.includes('/rest/v1/rpc/get_my_pharmflow_permissions_v1')){
   reads++;if(fail)return route.abort('internetdisconnected');
   if(deny)return route.fulfill({status:403,json:{message:'Pharmacy access required'}});
   return route.fulfill({json:{pharmacy_id:'synthetic',receiving:'FULL',expiry:'FULL',data_access:'PHARMACY_ONLY',system_administrator:false}});
  }
  if(url.includes('grant_type=refresh_token')){refreshes++;return invalid?route.fulfill({status:400,json:{msg:'Invalid refresh token'}}):route.fulfill({json:{access_token:'rotated',refresh_token:'next',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-user'}}});}
  throw Error('Unexpected network request: '+url);
 });
 await page.goto('https://offline.pharmflow.test/');
 await page.setContent('<html><body><main class="mainContent"><section id="page-receiving"><input id="barcodeInput" value="UNSAVED" /></section></main><button data-page="receiving">Receiving</button><button data-page="expiry">Expiry</button><button data-page="settings">Settings</button><div id="authGate"></div><div id="authFormsPanel"></div><div id="authAccessPanel"></div><div id="btnHeaderStatus"></div><div id="headerStatusPopover"></div><span id="headerUnifiedStatusLabel"></span><span id="sidebarConnection"></span><span id="headerMasterGTINStatus">ACTIVE</span><span id="systemStatus" class="ready">READY</span><span id="cloudWorkspaceStatus">● SYNCED</span></body></html>');
 await page.addStyleTag({content:read('css/permissions.css')});
 await page.evaluate(()=>{
  window.CLOUD_CONFIG={url:'https://mock.supabase.test',publishableKey:'public-test'};window.Logger={warn(){}};window.AppRouter={currentRoute:'receiving'};
  window.navigateTo=route=>AppRouter.currentRoute=route;
  // Only the application-shell auth presenter dependencies are replaced.
  window.setText=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t;};
 });
 await page.addScriptTag({content:read('js/permissions.js')});await page.addScriptTag({content:read('js/auth.js')});
 await page.evaluate(()=>{
  window.bindAuthUI=()=>{};window.renderAuthState=()=>{if(!AuthState.session)lockApplicationForAuth();};window.setAuthMessage=()=>{};
  persistAuthSession({access_token:'valid',refresh_token:'original',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-user'}});
  AuthState.context={pharmacy_id:'synthetic',user_id:'synthetic-user',member_role:'admin'};
 });
 await page.addScriptTag({content:read('js/header-account-ui.js')});
 await page.evaluate(()=>PharmFlowPermissions.load());assert.equal(await page.locator('[data-page="receiving"]').isVisible(),true);
 // The original bug: a failed focus read clears saved permissions; the next
 // focus skips recovery because active() is now false.
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(50);
 assert.equal(await page.locator('[data-page="receiving"]').isVisible(),false);
 fail=false;await page.waitForFunction(()=>document.querySelector('[data-page="receiving"]').offsetParent!==null,{},{timeout:5000});
 assert.equal(await page.inputValue('#barcodeInput'),'UNSAVED');assert.equal(await page.evaluate(()=>AppRouter.currentRoute),'receiving');assert.equal(await page.locator('#sidebarConnection').textContent(),'ONLINE');
 console.log('PASS transient permission failure -> bounded automatic recovery, input/page retained, ONLINE');
 // Run the real idle guard and resume lifecycle, plus the existing foreground
 // sync coordinator with boundary services mocked. Its successful ledger read
 // is what clears the stale OFFLINE projection, not permission success alone.
 const cloud=read('cloud-workspace.js');
 await page.addScriptTag({content:cloud.slice(0,cloud.indexOf('/* ====================================================='))});
 await page.evaluate(()=>{
  window.AppState={workspace:{orderFiles:[{}],orderData:[{}]}};
  window.PharmFlowCloudWorkspace={startupAuthorityReady:true,loginAuthorityReady:true,lastForegroundSyncAt:0};
  window.runAdaptiveCloudSync=()=>{};window.attemptCloudWorkspaceHydration=()=>{};
  for(const n of ['pullActiveOrderManifest','bootstrapActiveOrdersOnEmptyDevice','reconcileWorkspaceGeneration','reconcileCloudWorkspaceAuthority','flushCloudWorkspaceQueue'])window[n]=async()=>true;
  window.pullCloudWorkspaceTransactions=async()=>{document.getElementById('cloudWorkspaceStatus').textContent='● SYNCED';document.documentElement.dataset.cloudWorkspaceState='synced';};
 });
 const foreground=cloud.indexOf('    const syncForegroundAuthority=()=>');
 await page.addScriptTag({content:cloud.slice(foreground,cloud.lastIndexOf('    attemptCloudWorkspaceHydration();'))});
 const beforeIdle=reads;
 await page.evaluate(async()=>{
  document.getElementById('cloudWorkspaceStatus').textContent='● OFFLINE — PENDING SYNC';document.documentElement.dataset.cloudWorkspaceState='offline';
  await PharmFlowIdleSleep.enter();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.waitForTimeout(150);assert.equal(reads,beforeIdle,'no network while idle guard is active');
 await page.evaluate(()=>PharmFlowIdleSleep.resume());await page.waitForFunction(()=>PharmFlowPermissions.state()==='ready'&&document.getElementById('sidebarConnection').textContent==='ONLINE');
 assert.equal(reads,beforeIdle+1);assert.equal(await page.inputValue('#barcodeInput'),'UNSAVED');console.log('PASS real idle guard/resume -> permission recovery and existing sync clear stale OFFLINE; input retained');
 // Simulated sleep: visible resume plus focus/pageshow, with stale access token.
 const before=reads;await page.waitForTimeout(1550);await page.evaluate(()=>{AuthState.session.expires_at=1;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));});
 await page.waitForFunction(()=>PharmFlowPermissions.state()==='ready');assert.equal(reads,before+1);assert.equal(refreshes,1);assert.equal(await page.inputValue('#barcodeInput'),'UNSAVED');console.log('PASS wake event burst -> one token rotation + one permission read; no reload');
 // A server denial does not expose navigation or retry indefinitely.
 deny=true;await page.evaluate(()=>PharmFlowPermissions.load().catch(()=>{}));assert.equal(await page.locator('[data-page="receiving"]').isVisible(),false);const deniedReads=reads;await page.waitForTimeout(1200);assert.equal(reads,deniedReads);console.log('PASS unauthorized server response -> hidden navigation, no retries');deny=false;
 // Genuine refresh rejection invokes the actual clearRejectedAuthSession path.
 invalid=true;await page.evaluate(()=>{AuthState.session.expires_at=1;return PharmFlowPermissions.load().catch(()=>{});});
 assert.equal(await page.evaluate(()=>AuthState.session),null);assert.equal(await page.evaluate(()=>document.body.classList.contains('authLocked')),true);assert.equal(await page.locator('[data-page="expiry"]').isVisible(),false);console.log('PASS genuinely invalid refresh -> safe existing auth lock, no grants');
 assert.deepEqual(errors,[]);assert.equal(await page.inputValue('#barcodeInput'),'UNSAVED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
