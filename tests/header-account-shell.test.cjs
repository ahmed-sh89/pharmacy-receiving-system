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
  const context={document,window,navigator,MutationObserver:class{observe(){}}};
  const run=path=>vm.runInNewContext(fs.readFileSync(path,"utf8"),context);
  const key=(el,value)=>{const e=new window.Event("keydown",{bubbles:true,cancelable:true});e.key=value;el.dispatchEvent(e);};
  return {document,window,navigator,run,key};
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
  assert.equal(update("CACHED","READY","SYNCED"),"ATTENTION");
  assert.equal(master.textContent,"CACHED");
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
  assert(!/PHARMACY CODE/i.test(parsed.querySelector('.sidebarFooter').textContent));
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
