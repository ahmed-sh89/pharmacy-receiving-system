const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const vm=require("node:vm");
const source=fs.readFileSync("js/receiving-release.js","utf8");
const definition=source.match(/window.PharmFlowDeviceWorkScope={[\s\S]*?\n};/);
assert.ok(definition,"device Work Orders scope definition must exist");

function createScope({pharmacy="DEV001",device="PC-A",storage=new Map()}={}){
    const context={window:{},AuthState:{context:{pharmacy_id:pharmacy}},ensureDeviceId:()=>device,localStorage:{
        getItem:key=>storage.has(key)?storage.get(key):null,
        setItem:(key,value)=>storage.set(key,value)
    }};
    vm.runInNewContext(definition[0],context);
    return {scope:context.window.PharmFlowDeviceWorkScope,storage};
}
test("first use is distinct from an explicit ALL preference",()=>{
    const {scope,storage}=createScope();
    assert.equal(scope.read(),null);
    assert.deepEqual(Array.from(scope.resolve(["A","B"]).orders),["A","B"]);
    assert.equal(storage.size,0,"reading first-use defaults must not persist ALL");
    scope.setAll();
    assert.equal(scope.read().mode,"all");
    assert.deepEqual(Array.from(scope.resolve(["A","B","C"]).orders),["A","B","C"]);
});
test("one or multiple selections survive recreation and remain device-local",()=>{
    const storage=new Map();
    const first=createScope({storage});
    first.scope.setSelected(["A"]);
    assert.deepEqual(Array.from(createScope({storage}).scope.resolve(["A","B"]).orders),["A"]);
    first.scope.setSelected(["A","B"]);
    assert.deepEqual(Array.from(createScope({storage}).scope.resolve(["A","B","C"]).orders),["A","B"]);
    assert.equal(createScope({storage,device:"HH-B"}).scope.read(),null);
});
test("manifest hydration prunes only invalid orders",()=>{
    const {scope}=createScope();
    scope.setSelected(["A","B"]);
    assert.deepEqual(Array.from(scope.resolve(["B","C"]).orders),["B"]);
    assert.deepEqual(Array.from(scope.read().orders),["B"]);
});
test("transient pre-hydration state never destroys a saved selection",()=>{
    const {scope}=createScope();
    scope.setSelected(["A"]);
    assert.deepEqual(Array.from(scope.resolve([],{authoritative:false}).orders),[]);
    assert.deepEqual(Array.from(scope.read().orders),["A"]);
    assert.deepEqual(Array.from(scope.resolve(["A","B"],{authoritative:true}).orders),["A"]);
});
test("a wholly removed selection becomes explicit ALL",()=>{
    const {scope}=createScope();
    scope.setSelected(["A"]);
    assert.deepEqual(Array.from(scope.resolve(["B"]).orders),["B"]);
    assert.equal(scope.read().mode,"all");
});
test("legacy array preferences retain their meaning",()=>{
    const {scope,storage}=createScope();
    storage.set(scope.key(),JSON.stringify([]));
    assert.equal(scope.read().mode,"all");
    storage.set(scope.key(),JSON.stringify(["A","B"]));
    assert.equal(scope.read().mode,"selected");
    assert.deepEqual(Array.from(scope.resolve(["B","C"]).orders),["B"]);
});
