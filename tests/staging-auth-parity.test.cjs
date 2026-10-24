const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cp=require('node:child_process');

test('loaded cloud client has one Staging target and CSP rejects Production requests',()=>{
  const source=fs.readFileSync('js/supabase.js','utf8');
  const context={navigator:{onLine:true},window:{}};vm.createContext(context);
  vm.runInContext(source+';globalThis.config=CLOUD_CONFIG',context);
  assert.equal(context.config.url,'https://tovkcakucyagvbzvlnks.supabase.co');
  const html=fs.readFileSync('index.html','utf8');
  const policy=html.match(/Content-Security-Policy" content="([^"]+)/)[1];
  assert(policy.includes('https://tovkcakucyagvbzvlnks.supabase.co'));
  assert(!policy.includes('zznoshzcyxmtwfbznjyr'));
  assert(!policy.includes('https:;'));
});

test('temporary-password state keeps the protected application locked',()=>{
  const source=fs.readFileSync('js/auth.js','utf8');
  const start=source.indexOf('function renderAuthState(){');
  const fn=source.slice(start,source.indexOf('\n}',start)+2);
  const calls=[];
  const context={AuthState:{mustChangePassword:true,session:{}},finishAuthBootState(){calls.push('finish');},lockApplicationForAuth(){calls.push('lock');},showForcedPasswordPanel(){calls.push('force');}};
  vm.createContext(context);vm.runInContext(fn+';renderAuthState()',context);
  assert.deepEqual(calls,['finish','lock','force']);
});

test('Staging source cannot build for a Vercel Production target',()=>{
  const result=cp.spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{
    env:{...process.env,VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'},encoding:'utf8'
  });
  assert.notEqual(result.status,0);
  assert((result.stdout+result.stderr).includes('Staging parity source requires the isolated Preview branch'));
});
