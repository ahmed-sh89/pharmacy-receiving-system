const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {Worker:Thread}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const js=p=>fs.readFileSync(path.join(root,p),'utf8');
function library(file=path.join(root,'js/vendor/sheetjs-0.20.3/xlsx.full.min.js')){
    const context={};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);return context.XLSX;
}
const XLSX=library();
// Execute the unchanged browser worker with real structured-clone messages and
// termination, using a Node adapter. No application/backend network is loaded.
class NamedWorker{
    constructor(){
        this.thread=new Thread(`
            const {parentPort}=require('node:worker_threads'),fs=require('node:fs'),vm=require('node:vm');
            const c=vm.createContext({console,Blob,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder});
            c.self=c;c.postMessage=value=>parentPort.postMessage(value);
            c.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(root,'js'))}+'/'+name.split('?')[0],'utf8'),c));
            vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(root,'js/excel-parser-worker.js'))},'utf8'),c);
            parentPort.on('message',data=>{data.file.name=data.fileName;c.onmessage({data});});
        `,{eval:true});
        this.thread.on('message',data=>this.onmessage?.({data}));
        this.thread.on('error',error=>this.onerror?.(error));
    }
    postMessage(value){
        value.file.arrayBuffer().then(buffer=>this.thread.postMessage({...value,file:new Blob([buffer]),fileName:value.file.name}));
    }
    terminate(){return this.thread.terminate();}
}
function harness(){
    const c={console:{log(){},warn(){},error(){}},Date,Map,Set,URL,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,setTimeout,clearTimeout,Worker:NamedWorker};
    c.window=c;c.document={currentScript:{src:'http://offline/js/excel-security.js'},getElementById:()=>null};
    c.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
    vm.createContext(c);
    for(const p of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js','js/excel-security.js','js/config.js','js/utils.js','js/state.js','js/excel.js','js/orders.js','js/master-gtin.js'])vm.runInContext(js(p),c);
    c.Logger={info(){},warn(){},error(){}};
    return c;
}
function file(bytes,name='fixture.xlsx'){const f=new Blob([bytes]);f.name=name;f.lastModified=1;return f;}
function bytes(rows,type='xlsx'){
    const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'Sheet1');
    return XLSX.write(w,{type:'array',bookType:type});
}
const json=value=>JSON.parse(JSON.stringify(value));
test('official artifact is exact, pinned, licensed, and selected by both HTML entries',()=>{
    const manifest=JSON.parse(js('js/vendor/sheetjs-0.20.3/manifest.json'));
    const b=fs.readFileSync(path.join(root,'js/vendor/sheetjs-0.20.3/xlsx.full.min.js'));
    assert.equal(XLSX.version,'0.20.3');assert.equal(crypto.createHash('sha256').update(b).digest('hex'),manifest.sha256);
    assert.equal(manifest.sha256,'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
    assert.match(js('js/vendor/sheetjs-0.20.3/LICENSE'),/Apache License/);
    for(const prefix of ['', 'pharmacy-receiving-system-main/']){
        assert.ok(js(prefix+'index.html').includes(manifest.integrity));
        assert.doesNotMatch(js(prefix+'index.html'),/xlsx@0\.18\.5/);
        assert.match(js(prefix+'js/excel.js'),/PharmFlowExcel.readFile/);
        assert.match(js(prefix+'js/master-gtin.js'),/PharmFlowExcel.readFile/);
    }
});
test('secure worker preserves text/formatted leading zeros, dates, quantities and mapping API',async()=>{
    const c=harness();
    const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([['Item Code','GTIN','Quantity','Date'],['000123','00123456789012',27,46321],[123,123456789012,35,46321]]);
    s.A3.z='000000';s.B3.z='00000000000000';s.D2.z='m/d/yyyy';XLSX.utils.book_append_sheet(w,s,'Sheet1');
    const parsed=await c.readExcelWorkbook(file(XLSX.write(w,{type:'array',bookType:'xlsx'})));
    const matrix=c.worksheetToMatrix(parsed.Sheets.Sheet1);
    assert.equal(matrix[1][0],'000123');assert.equal(matrix[1][1],'00123456789012');
    assert.equal(matrix[2][0],'000123');assert.equal(matrix[2][1],'00123456789012');
    assert.deepEqual([matrix[1][2],matrix[2][2]],['27','35']);
    assert.equal(c.normalizeOrderDateValue(parsed.Sheets.Sheet1.D2.v),'2026-10-26');
    const mapping=await c.parseMasterGTINFile(file(bytes([['Barcode','ITEM NUMBER','Name'],['00123456789012','000123','Fixture']])));
    assert.equal(mapping.records[0].itemCode,c.normalizeItemCode('000123')); // Preserve existing numeric Item Code canonicalization.
    assert.equal(mapping.records[0].gtin,'00123456789012');
});
test('legacy binary XLS remains readable in the same worker',async()=>{
    const c=harness(),w=await c.readExcelWorkbook(file(bytes([['Item Code','Quantity'],['000123',8]],'biff8'),'fixture.xls'));
    assert.equal(c.worksheetToMatrix(w.Sheets.Sheet1)[1][0],'000123');
});
test('file limits reject before starting a worker, with actionable messages',async()=>{
    const c=harness();let spawned=0;c.Worker=class{constructor(){spawned++;}};
    await assert.rejects(c.PharmFlowExcel.readFile({name:'large.xlsx',size:32*1024*1024+1}),/32 MB/);
    await assert.rejects(c.PharmFlowExcel.readFile({name:'empty.xlsx',size:0}),/empty/);
    await assert.rejects(c.PharmFlowExcel.readFile({name:'wrong.txt',size:1}),/Unsupported file/);
    assert.equal(spawned,0);
});
test('invalid and truncated workbooks fail with meaningful errors',async()=>{
    const c=harness();
    await assert.rejects(c.readExcelWorkbook(file('not an Excel workbook')),/not a valid Excel/);
    await assert.rejects(c.readExcelWorkbook(file(new Uint8Array([80,75,3,4,0]))),/damaged or incomplete/);
});
test('ZIP expanded-size and entry bounds reject before parser decompression',()=>{
    const c=harness();
    const b=new Uint8Array(bytes([['a'],[1]])),v=new DataView(b.buffer);let entry=-1;
    for(let i=0;i<b.length-46;i++)if(v.getUint32(i,true)===0x02014b50){entry=i;break;}
    assert.ok(entry>=0);v.setUint32(entry+24,128*1024*1024+1,true);
    assert.throws(()=>c.PharmFlowExcel.validateBuffer(b.buffer,'large.xlsx'),/128 MB/);
    const eocd=b.length-22;v.setUint16(eocd+10,4097,true);
    assert.throws(()=>c.PharmFlowExcel.validateBuffer(b.buffer,'large.xlsx'),/too many archive entries/);
});
test('sheet, row and column limits reject whole workbook without truncation',()=>{
    const c=harness(),guard=c.PharmFlowExcel;
    assert.throws(()=>guard.validateWorkbook({SheetNames:['s'],Sheets:{s:{'!ref':'A1:A250001'}}},XLSX),/250,000 rows/);
    assert.throws(()=>guard.validateWorkbook({SheetNames:['s'],Sheets:{s:{'!ref':'A1:IW2'}}},XLSX),/256 columns/);
    assert.throws(()=>guard.validateWorkbook({SheetNames:Array(65).fill('s'),Sheets:{}},XLSX),/64 worksheets/);
    assert.throws(()=>guard.validateWorkbook({SheetNames:['a','b','c'],Sheets:{a:{'!ref':'A1:A250000'},b:{'!ref':'A1:A250000'},c:{'!ref':'A1:A1'}}},XLSX),/500,000/);
});
test('100,000-row mapping-size workload fits declared limits',()=>{
    const c=harness(),s=XLSX.utils.aoa_to_sheet(Array.from({length:100000},(_,i)=>[String(i).padStart(8,'0'),'00000012345678',1]));
    assert.equal(c.PharmFlowExcel.validateWorkbook({SheetNames:['s'],Sheets:{s}},XLSX).SheetNames.length,1);
});
test('timeout terminates worker, rejects and never silently returns partial data',async()=>{
    const c=harness();let terminated=0;
    c.Worker=class{postMessage(){}terminate(){terminated++;}};
    c.setTimeout=fn=>setTimeout(fn,5);
    await assert.rejects(c.PharmFlowExcel.readFile(file('placeholder')),/exceeded 30 seconds/);
    assert.equal(terminated,1);
});
test('Expiry XLSX package/style/date export remains readable with patched library',()=>{
    const c=harness();c.document.createElement=()=>({getContext:()=>({measureText:()=>({width:20})})});
    vm.runInContext(js('js/expiry-inventory-report.js'),c);
    const report=c.ExpiryInventoryReport;
    const data=[{item_code:'000123',identifier_display:'00123456789012',item_name:'Fixture',group_name:'Medicine',quantity:7,expiry_month:2,expiry_year:2027}];
    const sheet=c.XLSX.utils.aoa_to_sheet([report.excelHeaders,...report.excelRows(data)]);
    sheet['!margins']={left:.2,right:.2,top:.2,bottom:.2};
    const w=c.XLSX.utils.book_new();c.XLSX.utils.book_append_sheet(w,sheet,'Expiry Inventory');
    const result=c.XLSX.read(report.workbookBytes(w),{type:'array',cellDates:true});
    const rows=c.XLSX.utils.sheet_to_json(result.Sheets['Expiry Inventory'],{header:1,raw:false});
    assert.equal(rows[1][0],'000123');assert.equal(rows[1][1],'00123456789012');assert.equal(rows[1][5],'02/2027');assert.equal(rows[1][6],'7');
});
const supplierDir=process.env.PHARMFLOW_SUPPLIER_DIR;
for(const [name,total,unique] of [['TO-000529235.xlsx',12,2],['TO-000528294.xlsx',62,1]]){
    test('real supplier '+name+': parser, metadata, original lines, aggregation and duplicate protection',{skip:!supplierDir},async()=>{
        const c=harness(),f=file(fs.readFileSync(path.join(supplierDir,name)),name);
        const parsed=await c.readExcelWorkbook(f),matrix=c.worksheetToMatrix(parsed.Sheets.Sheet1);
        if(process.env.PHARMFLOW_BASELINE_XLSX){
            const old=library(process.env.PHARMFLOW_BASELINE_XLSX),w=old.read(fs.readFileSync(path.join(supplierDir,name)),{type:'buffer',cellDates:true,cellText:true,cellNF:true});
            assert.deepEqual(json(matrix),json(old.utils.sheet_to_json(w.Sheets.Sheet1,{header:1,raw:false,defval:'',blankrows:false})));
        }
        const meta=await c.inspectOrderFileMetadata(f);assert.equal(meta.orderNumber,name.slice(0,-5));assert.equal(meta.orderDate,'2026-10-26');
        const result=await c.importOrderFile(f,meta);assert.equal(result.importedRows,2);
        const snapshot=vm.runInContext('JSON.parse(JSON.stringify(AppState.workspace))',c);
        assert.equal(snapshot.orderFiles.length,1);assert.equal(snapshot.orderFiles[0].sourceRows.length,2);
        assert.equal(snapshot.orderFiles[0].sourceRows.reduce((sum,r)=>sum+r.orderedQty,0),total);
        assert.equal(snapshot.orderData.length,unique);assert.equal(snapshot.orderData.reduce((sum,r)=>sum+r.orderedQty,0),total);
        assert.equal((await c.importOrderFile(f,meta)).duplicateFile,true);
    });
}
