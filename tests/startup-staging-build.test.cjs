const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
test('build environment fence: Production stays Production; exact Preview is Staging; arbitrary Preview rejected',()=>{
 const build=(env={})=>cp.spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{env:{...process.env,VERCEL:'',VERCEL_ENV:'',VERCEL_GIT_COMMIT_REF:'',...env},encoding:'utf8',timeout:30000});
 const production=build();assert.equal(production.status,0,production.stderr);
 assert(fs.readFileSync('dist/js/supabase.js','utf8').includes('https://zznoshzcyxmtwfbznjyr.supabase.co'));
 assert(!fs.readFileSync('dist/index.html','utf8').includes('startup-timing.js'));assert(!fs.existsSync('dist/js/startup-timing.js'));
 const preview=build({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'fix/startup-handheld-staging-20261108'});assert.equal(preview.status,0,preview.stderr);
 for(const p of ['dist/index.html','dist/js/supabase.js','dist/version.json']){const s=fs.readFileSync(p,'utf8');assert(s.includes('tovkcakucyagvbzvlnks'),p);assert(!s.includes('zznoshzcyxmtwfbznjyr'),p);}
 assert(fs.readFileSync('dist/index.html','utf8').includes('startup-timing.js'));assert(fs.existsSync('dist/js/startup-timing.js'));assert(fs.readFileSync('dist/index.html','utf8').includes('window.PharmFlowDeviceMode'));
 assert.equal(JSON.parse(fs.readFileSync('dist/version.json')).environment,'staging');
 const {document}=require('linkedom').parseHTML(fs.readFileSync('dist/index.html','utf8'));
 const scripts=[...document.querySelectorAll('script[src]')].filter(s=>s.getAttribute('type')!=='module'&&!s.getAttribute('src').startsWith('http')&&!s.getAttribute('src').endsWith('/startup-timing.js'));
 const links=[...document.querySelectorAll('link[rel="preload"][as="script"]')];
 assert.deepEqual(links.map(l=>l.getAttribute('href')),scripts.map(s=>s.getAttribute('src')),'Vite preloads must reuse the executed URL, without hashed duplicate files');
 const rejected=build({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'unapproved-preview'});assert.notEqual(rejected.status,0);assert(rejected.stderr.includes('Production release requires main and Production configuration'));
});
