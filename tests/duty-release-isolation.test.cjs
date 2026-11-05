const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');

test('release retains the verified Production operational and deployment files byte-for-byte',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
 assert.equal(manifest.production_base,'2295d2de5d69ad8e2c9bf10193aea8cc7b254f3f');
 for(const [path,expected] of Object.entries(manifest.protected_files)){
  const bytes=fs.readFileSync(path);
  const actual=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(actual,expected,path);
 }
 assert.ok(Object.keys(manifest.protected_files).length>=80);
});
