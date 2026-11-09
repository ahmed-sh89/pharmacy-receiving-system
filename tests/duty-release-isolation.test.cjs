const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const manifest=JSON.parse(fs.readFileSync('docs/receiving/selected-receipts-20261110/RELEASE_MANIFEST.json','utf8'));
const historical=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const blobHash=bytes=>crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
function verifyRelease(read=path=>fs.readFileSync(path)){
 for(const [path,productionBlob] of Object.entries(manifest.protected_files)){
  const expected=Object.hasOwn(manifest.approved_changes,path)?manifest.approved_changes[path]:productionBlob;
  assert.equal(blobHash(read(path)),expected,path);
 }
}

test('release baseline is pinned to verified Production and the declared Staging Receiving source',()=>{
 assert.equal(manifest.production_base,'70d3e2059317f460a9be482dac0445049cf9045d');
 assert.equal(manifest.approved_source,'958fe37abc81a0872d80f05c34d46168b6996184');
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

test('release retains Production and declared Receiving bytes without excluding changed files',()=>{
 verifyRelease();
});

test('release isolation rejects mutations to Duty, deployment, and accepted Receiving files',()=>{
 for(const path of ['js/duty.js','.github/workflows/deploy.yml','js/receiving.js']){
  assert.throws(()=>verifyRelease(p=>p===path?Buffer.concat([fs.readFileSync(p),Buffer.from('\nmutation')]):fs.readFileSync(p)),error=>error.code==='ERR_ASSERTION'&&error.message.includes(path));
 }
});
