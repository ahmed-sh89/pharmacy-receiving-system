"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {parseHTML}=require("linkedom");
const html=fs.readFileSync("index.html","utf8");
function fixture(){
  const {document,window}=parseHTML(html);
  let active=document.body;
  Object.defineProperty(document,"activeElement",{get:()=>active});
  document.querySelectorAll("*").forEach(el=>el.focus=()=>{active=el;el.dispatchEvent(new window.Event("focusin",{bubbles:true}));});
  const navigator={onLine:true};
  const observers=[];
  const context={document,window,navigator,CustomEvent:window.CustomEvent,MutationObserver:class{constructor(callback){this.callback=callback;}observe(target){observers.push({target,callback:this.callback});}}};
  const run=path=>vm.runInNewContext(fs.readFileSync(path,"utf8"),context);
  const key=(el,value)=>{const e=new window.Event("keydown",{bubbles:true,cancelable:true});e.key=value;el.dispatchEvent(e);};
  const notify=target=>observers.filter(x=>x.target===target).forEach(x=>x.callback());
  return {document,window,navigator,run,key,notify};
}
test("logout menu supports keyboard, outside dismissal and existing action",()=>{
  const {document,run,key}=fixture();
  let calls=0;
  const trigger=document.getElementById("btnHeaderLogoutToggle"),menu=document.getElementById("headerLogoutMenu"),action=document.getElementById("btnLogout");
  // Models the pre-existing AuthState binding; the menu must never intercept it.
  action.addEventListener("click",()=>calls++);
  run("js/header-account-menu.js");
  key(trigger,"ArrowDown");
  assert.equal(menu.hidden,false);assert.equal(document.activeElement,action);
  key(action,"Escape");assert.equal(menu.hidden,true);assert.equal(document.activeElement,trigger);
  trigger.click();document.body.click();assert.equal(menu.hidden,true);
  trigger.click();document.getElementById("btnAccountModalOpen").focus();assert.equal(menu.hidden,true);
  trigger.click();action.click();assert.equal(menu.hidden,true);assert.equal(calls,1);
  assert.equal(document.querySelectorAll("#btnLogout").length,1);
});
test("status requires all existing readiness sources and retains degraded states",()=>{
  const {document,window,navigator,run}=fixture();
  run("js/header-account-ui.js");
  const master=document.getElementById("headerMasterGTINStatus"),ready=document.getElementById("systemStatus"),sync=document.getElementById("cloudWorkspaceStatus");
  const label=document.getElementById("headerUnifiedStatusLabel"),sidebar=document.getElementById("sidebarConnection");
  const update=(a,b,c,online=true)=>{master.textContent=a;ready.textContent=b;sync.textContent=c;navigator.onLine=online;window.dispatchEvent(new window.Event("online"));assert.equal(sidebar.textContent,label.textContent);return label.textContent;};
  assert.equal(update("ACTIVE","READY","SYNCED"),"ONLINE");
  assert.deepEqual([master,ready,sync].map(x=>x.dataset.uiTone),["success","success","success"]);
  assert.equal(update("CACHED","READY","SYNCED"),"ATTENTION");
  assert.equal(master.textContent,"CACHED");
  assert.equal(master.dataset.uiTone,"warning");
  update("FAILED","READY","SYNCED");assert.equal(master.dataset.uiTone,"error");
  assert.equal(update("ACTIVE","READY","SYNCING"),"ATTENTION");
  assert.equal(update("ACTIVE","LOADING","SYNCED"),"ATTENTION");
  assert.equal(update("ACTIVE","READY","CLOUD"),"ATTENTION");
  assert.equal(update("ACTIVE","READY","OFFLINE"),"OFFLINE");
  assert.equal(update("ACTIVE","READY","SYNCED",false),"OFFLINE");
  assert.equal(sidebar.dataset.headerStatusManaged,"true");
});
test("shell retains unique account security controls",()=>{
  const {document}=fixture();
  for(const id of ["btnChangeSettingsPassword","btnEditSettingsIdentity","btnSaveSettingsIdentity","btnCancelSettingsIdentity"]){assert.equal(document.querySelectorAll(`#${id}`).length,1,id);assert(document.getElementById(id));}
  assert.equal(document.getElementById("headerAccountName").textContent,"Account");
  assert(!document.querySelector(".headerShell #topBarPharmacyCode"));
  assert.equal(document.querySelector('.headerShellFooter .footerCodeLabel').textContent,'PHARMACY CODE');
  assert.equal(document.getElementById('accountPharmacyCode').textContent,'—');
});

 test("account popover opens from keyboard and closes without consuming dialog actions",()=>{
  const {document,run,key}=fixture();run("js/header-account-popover.js");
  const trigger=document.getElementById("btnAccountModalOpen"),panel=document.getElementById("accountPopover");
  key(trigger,"ArrowDown");assert.equal(panel.hidden,false);assert.equal(document.activeElement,panel);
  key(panel,"Escape");assert.equal(panel.hidden,true);assert.equal(document.activeElement,trigger);
  trigger.click();document.body.click();assert.equal(panel.hidden,true);
  let opened=0;document.getElementById("btnChangeSettingsPassword").addEventListener("click",()=>opened++);
  trigger.click();document.getElementById("btnChangeSettingsPassword").click();assert.equal(panel.hidden,true);assert.equal(opened,1);
 });
 test("relocated identity edit still obeys the original owner and protected code guards",()=>{
  const {document}=fixture();const auth=fs.readFileSync("js/auth.js","utf8");
  const start=auth.indexOf("function setSettingsIdentityEditMode(editing){"),end=auth.indexOf("\nasync function saveSettingsIdentity",start);
  for(const owner of [false,true]){
   const context={document,isSystemOwner:()=>owner,AuthState:{context:{pharmacy_id:"mock",pharmacy_name:"Demo",pharmacy_code:"HHP084"}},setInputValue:(id,value)=>{document.getElementById(id).value=value;}};
   vm.runInNewContext(auth.slice(start,end)+";setSettingsIdentityEditMode(true);",context);
   assert.equal(document.getElementById("settingsIdentityEdit").classList.contains("hidden"),!owner);
   if(owner)assert.equal(document.getElementById("settingsIdentityCodeInput").disabled,true);
  }
 });

test("Edit feedback follows actual dialog state regardless of click binding order",()=>{
  for(const uiFirst of [true,false]){
    const {document,run,notify}=fixture();
    const panel=document.getElementById("settingsIdentityEdit"),overlay=document.getElementById("accountEditOverlay");
    const feedback=document.getElementById("settingsAccessMessage"),message=document.getElementById("accountIdentityEditMessage");
    const bindAuth=()=>{
      document.getElementById("btnEditSettingsIdentity").addEventListener("click",()=>panel.classList.remove("hidden"));
      document.getElementById("btnCancelSettingsIdentity").addEventListener("click",()=>panel.classList.add("hidden"));
    };
    if(!uiFirst)bindAuth();run("js/header-account-ui.js");if(uiFirst)bindAuth();
    document.getElementById("btnEditSettingsIdentity").click();notify(panel);
    assert.equal(overlay.hidden,false);
    feedback.textContent="Pharmacy Name and a valid Pharmacy Code are required.";
    feedback.className="authMessage error";notify(feedback);
    assert.equal(message.textContent,feedback.textContent,`binding order uiFirst=${uiFirst}`);
    assert.equal(message.className,"authMessage error");
    feedback.textContent="Unable to update pharmacy identity.";notify(feedback);
    assert.equal(message.textContent,feedback.textContent);
    document.getElementById("btnCancelSettingsIdentity").click();notify(panel);
    feedback.textContent="Unrelated Settings feedback";notify(feedback);
    assert.equal(message.textContent,"Unable to update pharmacy identity.");
    document.getElementById("btnEditSettingsIdentity").click();notify(panel);
    panel.classList.add("hidden");notify(panel);
    feedback.textContent="Pharmacy identity updated. Operational history was preserved.";
    feedback.className="authMessage success";notify(feedback);
    assert.equal(document.getElementById("accountFeedbackMessage").textContent,feedback.textContent);
    assert.equal(message.className,"authMessage success");
  }
});
test("Handheld Account is reachable from Modes with canonical fields and guarded logout unchanged",()=>{
 const {document,window,run,key}=fixture();document.body.classList.add("zebraDevice");
 run("js/header-account-responsive.js");
 const panel=document.getElementById("handheldAccountSettings"),overlay=document.getElementById("handheldAccountOverlay");
 for(const id of ["settingsIdentityView","settingsIdentityEdit","settingsAccessMessage"]){assert.equal(document.getElementById(id).parentElement,panel);}
 assert.equal(panel.closest(".appPage"),null);assert.equal(panel.closest(".topBar"),null);
 window.openHandheldAccount();assert.equal(overlay.hidden,false);assert.equal(document.activeElement,panel);
 key(panel,"Escape");assert.equal(overlay.hidden,true);
 window.openHandheldAccount();panel.querySelector('[data-handheld-account-close]').click();assert.equal(overlay.hidden,true);
 let calls=0;document.getElementById('btnLogout').addEventListener('click',()=>calls++);
 for(const script of ["js/header-account-menu.js","js/header-account-popover.js","js/header-account-ui.js"]){run(script);}
 document.getElementById('btnLogout').click();assert.equal(calls,1);
 for(const id of ["btnLogout","settingsPharmacyName","btnChangeSettingsPassword","btnEditSettingsIdentity","systemStatus","cloudWorkspaceStatus"]){assert.equal(document.querySelectorAll('#'+id).length,1,id);}
 const cp=require('node:child_process'),ui=fs.readFileSync('ui.js','utf8'),baseline=cp.execFileSync('git',['show','9abf06b:ui.js'],{encoding:'utf8'});
 const logout=s=>s.slice(s.indexOf('        document.getElementById("btnZebraSignOut")?.addEventListener'),s.indexOf('    if(!document.getElementById("zebraJoinHeader"))'));
 assert.equal(logout(ui),logout(baseline));assert(ui.includes('window.openHandheldAccount?.()'));
});
test("Desktop retains approved header controls without a duplicate Settings account",()=>{
 const {document,run}=fixture();run("js/header-account-responsive.js");
 assert.equal(document.getElementById("handheldAccountOverlay").hidden,true);
 assert.equal(document.getElementById("settingsIdentityView").parentElement.id,"accountPopover");
 assert.equal(document.getElementById("btnLogout").parentElement.id,"headerLogoutMenu");
});
test("Production connection, authentication, release workflow and operational files remain exact baseline",()=>{
 const cp=require('node:child_process');
 for(const path of ['js/supabase.js','js/auth.js','vite.config.js','.github/workflows/deploy.yml','js/receiving.js','js/handheld-runtime.js','css/receiving-approved-visuals.css']){
  assert.equal(fs.readFileSync(path,'utf8'),cp.execFileSync('git',['show','9abf06bc249ecf5613e49adcb77b4b998e332959:'+path],{encoding:'utf8'}),path);
 }
 assert(!html.includes('staging-runtime-config'));
 assert(!html.includes('tovkcakucyagvbzvlnks'));
 assert(!html.includes('src="/header-account'));
});

test("Modes Account and existing Sign Out dispatch; pending work still prevents logout",()=>{
 const {document,window,run}=fixture();document.body.classList.add('zebraDevice');
 run('js/header-account-responsive.js');
 const ui=fs.readFileSync('ui.js','utf8'),AppState={session:{pendingQueue:[]}};let loggedOut=0,warned=0;
 document.getElementById('btnLogout').addEventListener('click',()=>loggedOut++);
 const block=ui.slice(ui.indexOf('    if(!document.getElementById("zebraHome")){'),ui.indexOf('    if(!document.getElementById("zebraJoinHeader")){'));
 vm.runInNewContext(block,{document,window,AppState,showToast:()=>warned++,openUnifiedHandheldReceiving:()=>{},setZebraExpiryMode:()=>{}});
 document.getElementById('btnZebraAccount').click();assert.equal(document.getElementById('handheldAccountOverlay').hidden,false);
 document.querySelector('#handheldAccountSettings [data-handheld-account-close]').click();
 document.getElementById('btnZebraSignOut').click();assert.equal(loggedOut,1);
 AppState.session.pendingQueue.push({});document.getElementById('btnZebraSignOut').click();assert.equal(loggedOut,1);assert.equal(warned,1);
});
