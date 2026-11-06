const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');

test('release retains the verified Production operational and deployment files byte-for-byte',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/duty/RELEASE_MANIFEST.json','utf8'));
 assert.equal(manifest.production_base,'7f0bcc1fe167415e38372b1db1d9c2f0c24858de');
 for(const [path,expected] of Object.entries(manifest.protected_files)){
  const bytes=fs.readFileSync(path);
  const actual=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(actual,expected,path);
 }
 assert.ok(Object.keys(manifest.protected_files).length>=80);
});
