const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('Timing diagnostic absent with any URL parameter; no runtime activation code',()=>{
 assert.equal(fs.existsSync('js/expiry-save-diagnostic.js'),false);
 for(const f of ['index.html','js/expiry.js','js/expiry-desktop-v2.js'])assert.doesNotMatch(fs.readFileSync(f,'utf8'),/ExpirySaveDiagnostic|expirySaveTiming|Development · Save timings|Copy Timings/);
});
test('Search shell retains four-sided1px border, dimensions and radius; input cannot overflow bottom edge',()=>{
 const css=fs.readFileSync('css/dashboard.css','utf8');const shell=css.match(/\.expirySessionSearch\{([^}]+)/)[1],input=css.match(/#expirySessionSearch\{([^}]+)/)[1];
 for(const v of ['height:36px','max-width:420px','border:1px solid var(--exp-border)','border-radius:8px','overflow:hidden'])assert.ok(shell.includes(v),v);
 for(const v of ['height:34px','min-height:0','box-sizing:border-box','background:transparent'])assert.ok(input.includes(v),v);
});
