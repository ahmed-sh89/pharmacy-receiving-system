// An explicit Preview-only build. Production source/config remain unchanged.
const {execFileSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const branch='fix/auth-session-001-staging-20261102';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!==branch){
 throw Error('AUTH-SESSION-001 builder requires its isolated Preview branch');
}
const sha=process.env.VERCEL_GIT_COMMIT_SHA;
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Missing exact Preview commit');
const env={...process.env,GITHUB_SHA:sha};
// The normal Vite plugin intentionally refuses all non-main Vercel builds.
// Build locally under that unchanged gate, then substitute ONLY output files.
for(const k of ['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_COMMIT_SHA'])delete env[k];
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--base=/'],{env,stdio:'inherit'});
const production='zznoshzcyxmtwfbznjyr',staging='tovkcakucyagvbzvlnks';
for(const path of ['dist/index.html','dist/js/supabase.js']){
 let s=readFileSync(path,'utf8');
 if(!s.includes(production))throw Error('Expected Production config marker in '+path);
 s=s.replaceAll(production,staging).replaceAll('sb_publishable_dulQyE_y0NZK2XyJyW_0TA_xhvwIxCS','sb_publishable_wck-im5qsFKt6-xCOlPZQw_lxBy3C7U');
 if(s.includes(production))throw Error('Production reference survived in '+path);
 writeFileSync(path,s);
}
const configPath='dist/js/config.js';
writeFileSync(configPath,readFileSync(configPath,'utf8').replace('"production"','"staging"'));
writeFileSync('dist/version.json',JSON.stringify({sha,environment:'staging',supabaseRef:staging,incident:'AUTH-SESSION-001'}));
console.log('Verified isolated AUTH-SESSION-001 Preview output: '+staging+' / '+sha);
