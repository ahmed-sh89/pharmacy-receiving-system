const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('splash and login logo keep their approved sizing and stylesheet order', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const identityCss = fs.readFileSync(path.join(root, 'css/identity.css'), 'utf8');

  const authCssPosition = html.indexOf('css/auth.css');
  const identityCssPosition = html.indexOf('css/identity.css');
  assert.ok(authCssPosition >= 0 && identityCssPosition > authCssPosition);
  assert.match(html, /class="pfBootCapsule"/);
  assert.match(html, /src="assets\/pharmflow-login-mark\.svg"/);
  assert.match(identityCss, /\.authBrandLogoCard\s*\{[^}]*width:132px;height:132px/s);
  assert.match(identityCss, /\.authBrandLogoCard img\s*\{[^}]*width:112px;height:112px/s);
  assert.match(identityCss, /\.pfBootCapsule,\.pfRealCapsule\s*\{[^}]*scale\(\.52\)/);
});

test('Preview build emits root-relative CSS and preserves logo sizing rules', (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmflow-preview-build-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));

  const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
  execFileSync(process.execPath, [viteBin, 'build', '--outDir', outputDir], {
    cwd: root,
    env: { ...process.env, VERCEL: '', VERCEL_ENV: 'preview' },
    stdio: 'pipe',
  });

  const builtHtml = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(builtHtml, /href="\/assets\/index-[^\"]+\.css"/);
  assert.doesNotMatch(builtHtml, /href="\/pharmacy-receiving-system\/assets\//);

  const stylesheetPath = builtHtml.match(/href="(\/assets\/index-[^\"]+\.css)"/)[1];
  const stylesheet = fs.readFileSync(path.join(outputDir, stylesheetPath.replace(/^\//, '')), 'utf8');
  assert.match(stylesheet, /\.authBrandLogoCard\s*\{[^}]*width:132px;height:132px/s);
  assert.match(stylesheet, /\.authBrandLogoCard img\s*\{[^}]*width:112px;height:112px/s);
});
