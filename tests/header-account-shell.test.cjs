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
  run("public/header-account-menu.js");
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
test("shell retains account security controls and static preview has no app runtime",()=>{
  const {document}=fixture();
  for(const id of ["btnChangeSettingsPassword","btnEditSettingsIdentity","btnSaveSettingsIdentity","btnCancelSettingsIdentity"]){assert.equal(document.querySelectorAll(`#${id}`).length,1,id);assert(document.getElementById(id));}
  assert.equal(document.getElementById("headerAccountName").textContent,"Account");
  assert(!document.querySelector(".headerShell #topBarPharmacyCode"));
  const demo=fs.readFileSync("public/account-header-visual-preview.html","utf8");
  const parsed=parseHTML(demo).document;
  assert(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'"));
  assert.deepEqual([...parsed.querySelectorAll("script[src]")].map(x=>x.getAttribute("src")),["/header-account-menu.js","/header-account-popover.js","/account-header-visual-preview.js"]);
  for(const path of ["public/header-account-menu.js","public/header-account-popover.js","public/account-header-visual-preview.js"]){assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|serviceWorker|supabase/i.test(fs.readFileSync(path,"utf8")));}
  assert(!/\bGlobal\b|>WORKSPACE<|Demo Owner/i.test(demo));
  assert.equal(parsed.querySelector('.sidebarFooter .footerCodeLabel').textContent,'PHARMACY CODE');
  assert.equal(document.querySelector('.headerShellFooter .footerCodeLabel').textContent,'PHARMACY CODE');
  assert.equal(document.getElementById('accountPharmacyCode').textContent,'—');
});

 test("account popover opens from keyboard and closes without consuming dialog actions",()=>{
  const {document,run,key}=fixture();run("public/header-account-popover.js");
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
