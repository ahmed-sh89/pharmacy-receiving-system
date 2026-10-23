"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const stage='tovkcakucyagvbzvlnks';
const token=(ref,role='anon')=>'x.'+Buffer.from(JSON.stringify({ref,role})).toString('base64url')+'.x';
test('Preview configuration rejects missing, Production, privileged and wrong-branch values',async()=>{
 const {stagingPreviewConfig}=await import('../scripts/staging-preview-config.mjs');
 const good={PHARMFLOW_STAGING_SUPABASE_URL:`https://${stage}.supabase.co`,PHARMFLOW_STAGING_SUPABASE_ANON_KEY:token(stage)};
 assert.equal(stagingPreviewConfig(good).url,good.PHARMFLOW_STAGING_SUPABASE_URL);
 for(const bad of [{},{...good,PHARMFLOW_STAGING_SUPABASE_URL:'https://production.example'}, {...good,PHARMFLOW_STAGING_SUPABASE_ANON_KEY:token(stage,'service_role')},{...good,PHARMFLOW_STAGING_SUPABASE_ANON_KEY:token('other')},{...good,VERCEL:'1',VERCEL_ENV:'production'},{...good,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}]){assert.throws(()=>stagingPreviewConfig(bad));}
});
test('classic runtime has no fallback and root CSP permits only the Staging backend',()=>{
 const source=fs.readFileSync('js/supabase.js','utf8').split('const CloudSyncEngine')[0];
 assert.throws(()=>vm.runInNewContext(source,{window:{}}),/Connection disabled/);
 assert.throws(()=>vm.runInNewContext(source,{window:{PHARMFLOW_STAGING_CONFIG:{url:'https://production.example',publishableKey:'x'}}}),/Connection disabled/);
 assert(!source.includes('zznoshzcyxmtwfbznjyr'));
 const html=fs.readFileSync('index.html','utf8');
 assert(html.indexOf('/staging-runtime-config.js')<html.indexOf('src="js/supabase.js'));
 assert(html.includes(`connect-src 'self' https://${stage}.supabase.co wss://${stage}.supabase.co`));
 assert(!html.includes('zznoshzcyxmtwfbznjyr'));
});
