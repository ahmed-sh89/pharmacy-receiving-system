const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/reports.js'), 'utf8');
const start = source.indexOf('function objectsToCSV(');
const end = source.indexOf('function getReportsDebugSnapshot(', start);
const ctx = vm.createContext({});
vm.runInContext(source.slice(start, end), ctx);

test('CSV formula-leading text and whitespace/control prefixes are neutralized', () => {
  for(const prefix of ['', ' ', '\t', '\r\n', '\u0000', '\u00a0', '\ufeff']){
    for(const marker of ['=', '+', '-', '@']){
      const value = prefix + marker + '1+2';
      assert.equal(ctx.escapeCSVValue(value), '"\'' + value + '"');
    }
  }
});
test('CSV numeric corrections, leading-zero text, Arabic, quoting and null remain intact', () => {
  for(const value of [-27, 0, 35.5, '001234', 'صيدلية', 'Order A', null]){
    assert.equal(ctx.escapeCSVValue(value), '"' + String(value ?? '') + '"');
  }
  assert.equal(ctx.escapeCSVValue('a,"b"'), '"a,""b"""');
});
test('complete CSV serialization protects headers and cells without changing numeric quantities', () => {
  assert.equal(ctx.objectsToCSV([{'=header':'\t=1+2', Quantity:-2, GTIN:'001234'}]),
    '"\'=header","Quantity","GTIN"\r\n"\'\t=1+2","-2","001234"');
  assert.equal(ctx.objectsToCSV([]), '');
});
test('active external scripts carry SRI and anonymous CORS', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src="https:\/\/[^\"]+"[^>]*>/g)];
  assert.equal(scripts.length, 2);
  for(const [tag] of scripts){
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/]+=*"/);
    assert.match(tag, /crossorigin="anonymous"/);
  }
});
test('proposed deployment Actions use only immutable commit references', () => {
  for(const file of ['deploy.yml', 'expiry-photo-cleanup.yml']){
    const yaml = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    for(const [,ref] of yaml.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(ref, /@[a-f0-9]{40}$/);
  }
});
