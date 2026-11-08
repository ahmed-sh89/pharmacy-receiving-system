const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
test('Duty Preview branch targets only Staging, omits timing diagnostics, preserves exact script preloads and rejects other preview refs',()=>{
 const branch='fix/duty-exchange-staging-20261109',build=(ref)=>cp.spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{env:{...process.env,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ref},encoding:'utf8',timeout:30000});
 let result=build(branch);assert.equal(result.status,0,result.stderr);
 for(const file of ['dist/index.html','dist/js/supabase.js','dist/version.json']){const s=fs.readFileSync(file,'utf8');assert(s.includes('tovkcakucyagvbzvlnks'));assert(!s.includes('zznoshzcyxmtwfbznjyr'));}
 assert(!fs.readFileSync('dist/index.html','utf8').includes('startup-timing.js'));assert(!fs.existsSync('dist/js/startup-timing.js'));
 const version=JSON.parse(fs.readFileSync('dist/version.json'));assert.equal(version.environment,'staging');assert.equal(version.branch,branch);
 const {document}=require('linkedom').parseHTML(fs.readFileSync('dist/index.html','utf8'));
 const scripts=[...document.querySelectorAll('script[src]')].filter(s=>s.getAttribute('type')!=='module'&&!s.getAttribute('src').startsWith('http')).map(s=>s.getAttribute('src'));
 assert.deepEqual([...document.querySelectorAll('link[rel=preload][as=script]')].map(l=>l.getAttribute('href')),scripts);
 result=build('unapproved-duty-preview');assert.notEqual(result.status,0);assert.match(result.stderr,/Production release requires main/);
});
