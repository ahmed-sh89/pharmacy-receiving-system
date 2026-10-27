// Offline built-artifact checks. Never contacts Supabase or reads credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const pins = {
  'js/vendor/sheetjs-0.20.3/xlsx.full.min.js': 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41',
  'js/excel-parser-worker.js': 'eda2ed6dc06571b9d455529524934bdcd0f4ef9a8025b49577d30094b11c6873',
  'js/excel-security.js': '5e5c9abd16cf15fbcc91fd31ed3c81bedba6cbc4a2822e8fcd02063869dcf183'
};
for (const [file, expected] of Object.entries(pins)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex'), expected,
    'Reviewed Excel artifact changed: ' + file);
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert(!/xlsx(?:@|\/|[-.])0\.18\.5/i.test(html), 'Legacy parser entry in built HTML');
const version = JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8'));
assert.equal(version.supabaseRef, 'zznoshzcyxmtwfbznjyr', 'Production baseline build binding changed');
function scan(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(?:js|html|json|css)$/.test(entry.name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text), 'Private key marker in client asset');
    assert(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(text), 'Secret API key marker in client asset');
    for (const jwt of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      let claims;
      try { claims = JSON.parse(Buffer.from(jwt[1], 'base64url').toString()); } catch { continue; }
      assert.notEqual(claims.role, 'service_role', 'Privileged JWT in client asset');
    }
  }
}
scan(dist);
console.log('PASS: pinned Excel artifacts, baseline binding and targeted client-secret markers (offline only)');
