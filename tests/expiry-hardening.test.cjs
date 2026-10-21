const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./expiry-desktop-harness.cjs');
test('Inventory Operator follows Quantity and action menu uses existing quantity correction',async()=>{
 const h=harness();h.data[0].first_operator_name='Original Operator · long pharmacy name';await h.refresh();await h.click('btnOpenExpiryInventory');
 const heads=[...h.document.querySelector('.expiryInventoryTable thead').querySelectorAll('th')].map(e=>e.textContent);
 assert.deepEqual(heads.slice(-4),['Quantity','Operator','Last Updated','Actions']);
 assert.equal(h.document.querySelector('.expiryOperatorCell').textContent,h.data[0].first_operator_name);
 const trigger=h.document.querySelector('[data-row-actions]');trigger.onclick();
 const panel=h.e('expiryRowActionPanel');assert.equal(panel.hidden,false);assert.match(panel.textContent,/EditRemove/);
 panel.querySelector('[data-menu-edit]').click();const d=h.document.querySelector('dialog');assert.equal(d.open,true);
 for(const name of ['Item Name','Item Code','GTIN','Batch','Expiry'])assert.match(d.textContent,new RegExp(name));
 d.querySelector('[data-total]').value='12';await h.submit();assert(h.calls.some(c=>c.name==='mutate_pharmflow_expiry_inventory_v1'&&c.p.p_quantity===12));
 assert.equal(h.data[0].first_operator_name,'Original Operator · long pharmacy name');
});
test('Expiry access-token recovery retains the caller and validates account after await',async()=>{
 const source=fs.readFileSync('js/expiry-active-session.js','utf8').split('/* Server-owned')[0];let refreshes=0,resolve;
 const c={AuthState:{user:{id:'A'},session:{}},expiryPharmacyId:()=>c.pharmacy,pharmacy:'P',isRestoredAccessTokenStale:()=>true,refreshAuthToken:()=>{refreshes++;return new Promise(r=>resolve=r);}};
 vm.createContext(c);vm.runInContext(source,c);
 const pending=c.ensureExpiryAuthenticationFresh();assert.equal(refreshes,1);resolve(true);await pending;
 const changed=c.ensureExpiryAuthenticationFresh();c.AuthState.user={id:'B'};resolve(true);await assert.rejects(changed,/retained/);
 c.AuthState.user={id:'A'};const failed=c.ensureExpiryAuthenticationFresh();resolve(false);await assert.rejects(failed,/reconnect or sign in/);
});
test('Token scheduler uses absolute remaining lifetime after 30–60 minute idle',()=>{
 const source=fs.readFileSync('js/auth.js','utf8'),a=source.indexOf('function scheduleTokenRefresh('),b=source.indexOf('\nasync function authRequest',a);let delay;
 const c={AuthState:{},Date:{now:()=>3600000},setTimeout:(fn,ms)=>{delay=ms;return 1},clearTimeout(){},refreshAuthToken(){return Promise.resolve(true)}};vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 c.scheduleTokenRefresh({expires_at:3600,expires_in:3600,refresh_token:'fixture'});assert.equal(delay,1000);
 c.scheduleTokenRefresh({expires_at:5400,expires_in:3600,refresh_token:'fixture'});assert.equal(delay,1680000);
});
test('A4 Landscape and workbook fit-width preserve existing report columns',()=>{
 const s=fs.readFileSync('js/expiry-inventory-report.js','utf8');assert.match(s,/orientation:'landscape'/);assert.doesNotMatch(s,/orientation:'portrait'/);assert.match(s,/orientation="landscape" fitToWidth="1" fitToHeight="0"/);assert.match(s,/_xlnm.Print_Titles/);assert.match(fs.readFileSync('css/dashboard.css','utf8'),/@page pharmflowExpiry\{size:A4 landscape/);
});
test('Needs Review terminal success removes only its case, never remounts the overlay',()=>{
 const s=fs.readFileSync('ui.js','utf8').split('async function openExpiryNeedsReviewPanel')[1];assert.match(s,/completeCase\(section\)/);assert.doesNotMatch(s,/await openExpiryNeedsReviewPanel\(/);
});
test('Late token refresh cannot resurrect a signed-out session',async()=>{
 const s=fs.readFileSync('js/auth.js','utf8'),a=s.indexOf('async function refreshAuthToken(){'),b=s.indexOf('\nwindow.addEventListener("online"',a);let finish,persisted=false;
 const initial={access_token:'fixture-access',refresh_token:'fixture-refresh'},c={AuthState:{session:initial},readStoredAuthSession:()=>initial,acquireAuthRefreshLock:()=>true,releaseAuthRefreshLock(){},authRequest:()=>new Promise(r=>finish=r),persistAuthSession:()=>{persisted=true},setAuthConnectionDegraded(){},isIrrecoverableRefreshError:()=>false};
 vm.createContext(c);vm.runInContext(s.slice(a,b),c);const pending=c.refreshAuthToken();c.AuthState.session=null;finish({access_token:'late-fixture',refresh_token:'late-fixture'});assert.equal(await pending,false);assert.equal(persisted,false);
});
