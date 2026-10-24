const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {parseHTML}=require('linkedom');
const baseline=p=>cp.execFileSync('git',['show','66ac0b2f1853285d9e18d87acced61bd0126c2b7:'+p],{encoding:'utf8'});
test('selective Settings release retains Production configuration, deployment, operational pages and Account',()=>{
 for(const p of ['js/supabase.js','vite.config.js','.github/workflows/deploy.yml','js/config.js','js/app.js','js/session.js','js/header-account-ui.js','js/header-account-popover.js','js/header-account-responsive.js','js/header-account-menu.js','cloud-workspace.js','js/orders.js','js/reports.js','js/receiving.js','js/scanner.js','js/handheld-runtime.js','js/identifier-service.js'])assert.equal(fs.readFileSync(p,'utf8'),baseline(p),p);
 const current=parseHTML(fs.readFileSync('index.html','utf8')).document,old=parseHTML(baseline('index.html')).document;
 for(const page of old.querySelectorAll('.appPage'))if(page.id!=='page-settings')assert.equal(current.getElementById(page.id).outerHTML,page.outerHTML,page.id);
 for(const selector of ['#authGate','.sidebar','.topBar','#accountModal','#accountIdentityEditDialog']){const node=old.querySelector(selector);if(node)assert.equal(current.querySelector(selector).outerHTML,node.outerHTML,selector);}
 const scripts=d=>[...d.querySelectorAll('script[src]')].map(e=>e.getAttribute('src'));
 assert.deepEqual(scripts(current).filter(p=>p!=='js/settings-workspace.js'),scripts(old));
 assert(!current.documentElement.outerHTML.includes('tovkcakucyagvbzvlnks'));
 assert(!fs.existsSync('public/staging-runtime-config.js'));assert(!fs.existsSync('scripts/staging-preview-config.mjs'));
 assert(!fs.existsSync('supabase/migrations/20261024001414_staging_owner_set_pharmacy_status_compatibility.sql'));
});
