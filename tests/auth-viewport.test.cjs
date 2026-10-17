const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/auth-viewport.js','utf8'),html=fs.readFileSync('index.html','utf8');
function run(handheld,visibleHeight=480){const classes=new Set(),values={},listeners={};const gate={classList:{add:v=>classes.add(v)},style:{setProperty:(k,v)=>values[k]=v}};
 const c={document:{documentElement:gate,getElementById:()=>gate},isLikelyZebraDevice:()=>handheld,window:{innerHeight:640,visualViewport:{height:visibleHeight,addEventListener:(t,f)=>listeners.visual=f},addEventListener:(t,f)=>listeners.window=f}};
 vm.runInNewContext(source,c);return {classes,values,listeners,c};}
test('Handheld login is selected before auth and protected initialization without changing body/workspace',()=>{
 assert.ok(html.indexOf('ui.js?v=')<html.indexOf('js/auth-viewport.js?v='));assert.ok(html.indexOf('js/auth-viewport.js?v=')<html.indexOf('js/auth.js?v='));
 const h=run(true);assert.ok(h.classes.has('handheldAuth'));assert.ok(h.classes.has('handheldViewport'));assert.equal(h.values['--handheld-visible-height'],'480px');
 assert.doesNotMatch(source,/initializeZebraInterface|bootProtectedApplication|AuthState|localStorage|fetch|authRpc|document\.body/);
});
test('Desktop unchanged; visible viewport keyboard resize updates presentation only',()=>{
 assert.equal(run(false).classes.size,0);const h=run(true);h.c.window.visualViewport.height=260;h.listeners.visual();assert.equal(h.values['--handheld-visible-height'],'260px');
 h.c.window.visualViewport.height=0;h.listeners.window();assert.equal(h.values['--handheld-visible-height'],'640px');
});

test('Visual viewport pan keeps the fixed surface inside the visible area',()=>{
 const h=run(true);h.c.window.visualViewport.offsetTop=90;h.listeners.visual();assert.equal(h.values['--handheld-visible-top'],'90px');
});
