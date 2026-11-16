const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const manifest=JSON.parse(fs.readFileSync('docs/receiving/email-wo-wrap/RELEASE_MANIFEST.json','utf8'));
const login=JSON.parse(fs.readFileSync('docs/auth/pharmacy-admin-login-release.json','utf8'));
const activation=JSON.parse(fs.readFileSync('docs/auth/pharmacy-activation-release.json','utf8'));
const itemHistory=JSON.parse(fs.readFileSync('docs/receiving/item-history-release.json','utf8'));
const transfer=JSON.parse(fs.readFileSync('docs/receiving/item-transfer-staging-release.json','utf8'));
const productionTransfer=JSON.parse(fs.readFileSync('docs/receiving/item-transfer-production-release.json','utf8'));
const productionHistoryHotfix=JSON.parse(fs.readFileSync('docs/receiving/item-history-production-hotfix.json','utf8'));
const movementSpeed=JSON.parse(fs.readFileSync('docs/receiving/item-movement-speed-staging.json','utf8'));
const historical=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const blobHash=bytes=>crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
function verifyRelease(read=path=>fs.readFileSync(path)){
 for(const [path,productionBlob] of Object.entries(manifest.protected_files)){
  const expected=movementSpeed.changes[path] ?? productionHistoryHotfix.changes[path] ?? productionTransfer.changes[path] ?? transfer.changes[path] ?? itemHistory.changes[path] ?? activation.changes[path] ?? login.changes[path] ?? manifest.approved_changes[path] ?? productionBlob;
  assert.equal(blobHash(read(path)),expected,path);
 }
}

test('release baseline is pinned to verified Production and the declared Receiving hotfix source',()=>{
 assert.equal(manifest.production_base,'0fda480ba6945a905ea8c45df3ad091739b03df1');
 assert.equal(manifest.approved_source,'9da1f777dd4248348d6ee57334d288934c3ee6d1');
 git('merge-base','--is-ancestor',manifest.production_base,manifest.approved_source);
 for(const path of Object.keys(historical.protected_files))assert.ok(Object.hasOwn(manifest.protected_files,path),`Protection removed: ${path}`);
 for(const path of ['css/duty.css','js/duty.js','js/duty-model.js','js/duty-controls.js','js/duty-schedule.js','js/duty-reports.js']){
  assert.ok(Object.hasOwn(manifest.protected_files,path),path);
  assert.ok(!Object.hasOwn(manifest.approved_changes,path),`Unexpected Duty change: ${path}`);
 }
 assert.ok(Object.keys(manifest.protected_files).length>=80);
 for(const [path,productionBlob] of Object.entries(manifest.protected_files)){
  if(productionBlob===null){
   assert.equal(git('ls-tree',manifest.production_base,'--',path),'',path);
   assert.ok(Object.hasOwn(manifest.approved_changes,path),`New file is unpinned: ${path}`);
  }else assert.equal(git('rev-parse',`${manifest.production_base}:${path}`),productionBlob,path);
  const approvedBlob=git('rev-parse',`${manifest.approved_source}:${path}`);
  assert.equal(Object.hasOwn(manifest.approved_changes,path),approvedBlob!==productionBlob,`Incorrect change declaration: ${path}`);
  if(approvedBlob!==productionBlob)assert.equal(manifest.approved_changes[path],approvedBlob,path);
 }
 for(const path of Object.keys(manifest.approved_changes))assert.ok(Object.hasOwn(manifest.protected_files,path),`Unprotected approval: ${path}`);
});

test('release retains the protected files with only the pinned sign-in updates',()=>{
 assert.deepEqual(Object.keys(login.changes).sort(),['PHARMFLOW_CURRENT_CHECKPOINT.md','index.html','js/auth.js','vite.config.js']);
 for(const file of Object.keys(login.changes)){
  assert.equal(git('rev-parse',`${login.production_base}:${file}`),manifest.approved_changes[file] ?? manifest.protected_files[file]);
 }
 assert.deepEqual(Object.keys(activation.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','css/identity.css','css/settings-workspace.css','index.html','js/app-version.js','js/auth.js','vite.config.js'
 ]);
 for(const file of Object.keys(activation.changes)){
  assert.equal(git('rev-parse',`${activation.production_base}:${file}`),login.changes[file] ?? manifest.approved_changes[file] ?? manifest.protected_files[file]);
 }
 verifyRelease();
});

test('Receiving History release only changes its declared protected surfaces',()=>{
 assert.deepEqual(Object.keys(itemHistory.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','css/receiving-history.css','index.html',
  'js/auth.js','js/orders.js','js/receiving-history.js','js/session.js','vite.config.js'
 ]);
 for(const file of Object.keys(itemHistory.changes)){
  assert.ok(Object.hasOwn(manifest.protected_files,file),file);
 }
});

test('transfer pilot only changes its declared protected surfaces',()=>{
 assert.deepEqual(Object.keys(transfer.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','css/receiving-history.css','index.html','js/config.js',
  'js/permissions.js','js/receiving-history.js','vite.config.js'
 ]);
 for(const [file, expected] of Object.entries(transfer.changes))assert.equal(blobHash(fs.readFileSync(file)),movementSpeed.changes[file] ?? productionHistoryHotfix.changes[file] ?? productionTransfer.changes[file] ?? expected,file);
});

test('production handoff preserves accepted Staging runtime except for declared activation files',()=>{
 assert.deepEqual(Object.keys(productionTransfer.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','index.html','js/config.js','js/item-transfer-staging.js','js/receiving-history.js'
 ]);
 for(const [file, expected] of Object.entries(productionTransfer.changes)){
  assert.equal(blobHash(fs.readFileSync(file)),movementSpeed.changes[file] ?? productionHistoryHotfix.changes[file] ?? expected,file);
 }
 for(const [file, expected] of Object.entries(productionTransfer.sql)){
  assert.equal(blobHash(fs.readFileSync(file)),expected,file);
 }
});

test('history and update notice hotfix only changes its declared protected files',()=>{
 assert.deepEqual(Object.keys(productionHistoryHotfix.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','css/identity.css','index.html','js/app-version.js','js/receiving-history.js'
 ]);
 for(const [file, expected] of Object.entries(productionHistoryHotfix.changes)){
  assert.ok(Object.hasOwn(manifest.protected_files,file),file);
  assert.equal(blobHash(fs.readFileSync(file)),movementSpeed.changes[file] ?? expected,file);
 }
});

test('movement speed preview only changes its declared runtime surfaces',()=>{
 assert.deepEqual(Object.keys(movementSpeed.changes).sort(),[
  'PHARMFLOW_CURRENT_CHECKPOINT.md','index.html','js/app-version.js','js/item-transfer-parser.js',
  'js/item-transfer-staging.js','js/item-transfer-worker.js','js/receiving-history.js','js/session.js','vite.config.js'
 ]);
 for(const [file, expected] of Object.entries(movementSpeed.changes)){
  assert.equal(blobHash(fs.readFileSync(file)),expected,file);
 }
});

test('release isolation rejects mutations to Duty, deployment, and accepted Receiving files',()=>{
 for(const path of ['js/duty.js','.github/workflows/deploy.yml','js/receiving.js']){
  assert.throws(()=>verifyRelease(p=>p===path?Buffer.concat([fs.readFileSync(p),Buffer.from('\nmutation')]):fs.readFileSync(p)),error=>error.code==='ERR_ASSERTION'&&error.message.includes(path));
 }
});
