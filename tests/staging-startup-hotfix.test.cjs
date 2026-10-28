const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),cp=require('child_process'),{parseHTML}=require('linkedom');
const html=fs.readFileSync('index.html','utf8'),app=fs.readFileSync('js/app.js','utf8');
function fn(s,name){const at=s.search(new RegExp('(?:async )?function '+name+'\\('));return s.slice(at,s.indexOf('\n}',at)+2);}
test('Optional CDN downloads cannot hold DOMContentLoaded; local XLSX stays ordered and SRI unchanged',()=>{
 const doc=parseHTML(html).document,old=parseHTML(cp.execFileSync('git',['show','2071027:index.html'],{encoding:'utf8'})).document;
 const optional=[...doc.querySelectorAll('script[src]')].filter(s=>s.getAttribute('src').startsWith('https://cdnjs.cloudflare.com/'));assert.equal(optional.length,2);
 for(const s of optional){assert(s.hasAttribute('async'));assert(!s.hasAttribute('defer'));const prior=[...old.querySelectorAll('script[src]')].find(x=>x.getAttribute('src')===s.getAttribute('src'));assert.equal(s.getAttribute('integrity'),prior.getAttribute('integrity'));assert.equal(s.getAttribute('crossorigin'),'anonymous');}
 assert(doc.querySelector('script[src^="js/vendor/sheetjs"]')?.hasAttribute('defer'));
 assert.equal(doc.querySelector('.pfBootCapsule').outerHTML,old.querySelector('.pfBootCapsule').outerHTML);assert.equal(doc.querySelector('.workspaceBootCard').textContent.trim(),'Loading...');
});
function bootHarness({session=false,failure=false,allowed=true}={}){
 const {document}=parseHTML(html);const events=[];const c={document,window:{},console:{error:(...args)=>events.push('error')},AuthState:{session:session?{}:null},applyBrandIdentity(){},initializeAuth:async()=>{events.push('auth');if(failure)throw Error('controlled initialization failure');},getSupabaseAccessToken:()=>session?'fixture':'',finishPendingAccessIfPossible:async()=>events.push('pending'),loadMyAppContext:async()=>events.push('context'),loadMyRegistrationStatus:async()=>events.push('registration'),renderAuthState(){events.push('auth-render');document.body.classList.remove('authBooting');},hasApplicationAccess:()=>session&&allowed,startApplication:async()=>events.push('workspace'),setAuthMessage:()=>events.push('message')};
 vm.createContext(c);for(const n of ['showWorkspaceStartupAuthorityFailure','showAuthenticationStartupFailure','bootstrapMedryvo'])vm.runInContext(fn(app,n),c);return {c,document,events};
}
test('Fresh and restored startup reach their real terminal owners without waiting for window.load',async()=>{
 for(const session of [false,true]){const h=bootHarness({session});await h.c.bootstrapMedryvo();assert(h.events.includes('auth-render'));assert.equal(h.events.includes('workspace'),session);if(session)assert(h.events.indexOf('context')<h.events.indexOf('workspace'));}
});
test('Initialization failure is explicit and retryable, with protected content still covered',async()=>{
 const h=bootHarness({session:true,failure:true});await h.c.bootstrapMedryvo();assert.equal(h.document.querySelector('.workspaceBootCard strong').textContent,'Secure startup failed');assert.equal(h.document.querySelector('.workspaceBootCard small').hidden,false);assert(h.document.getElementById('workspaceBootRetry'));assert(h.document.body.classList.contains('authLocked'));assert(h.document.body.classList.contains('workspaceBooting'));assert(!h.events.includes('workspace'));
});
test('Permission denial never opens a workspace; core bindings do not wait for optional load completion',async()=>{
 const h=bootHarness({session:true,allowed:false});await h.c.bootstrapMedryvo();assert(!h.events.includes('workspace'));
 const tail=app.slice(app.indexOf('window.addEventListener',app.indexOf('   FINAL STARTUP BINDING')));let callback;vm.runInNewContext(tail,{window:{addEventListener:(type,fn)=>{assert.equal(type,'DOMContentLoaded');callback=fn;}},bindCoreApplicationEvents:()=>h.events.push('bound'),logApplicationHealth(){},Logger:{error(){}}});callback();assert(h.events.includes('bound'));
});
test('Export, role mapping, security and capsule styles are byte-unchanged from failed Preview',()=>{
 for(const p of ['js/auth.js','js/permissions.js','js/global-items-export.js','js/global-items-export-worker.js','css/identity.css','js/supabase.js','vercel.json'])assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','2071027:'+p],{encoding:'utf8'}),p);
});
