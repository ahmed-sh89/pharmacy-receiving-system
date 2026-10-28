const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{performance}=require('perf_hooks'),{fixture,worker}=require('./helpers/export-v2-fixture.cjs');
test('Production-size real SQL pages stream into streamed workbook with exact counts and reduced DB work',async()=>{
 const {db,rpc}=await fixture();try{
 await db.exec(`insert into public.pharmflow_global_items_v2(item_code,item_name,group_name) select lpad(g::text,8,'0'),'Synthetic product '||g,'Medicine' from generate_series(0,56587) g;
 insert into public.pharmflow_global_item_identifiers_v2(id,item_code,identifier_display,identifier_key) select md5('id'||g)::uuid,lpad((g%56588)::text,8,'0'),'0000SYN'||g,'0000SYN'||g from generate_series(0,78163) g;`);
 const hashAt=performance.now();await db.query("select (select md5(string_agg(md5(row_to_json(i)::text),'' order by item_code)) from public.pharmflow_global_items_v2 i),(select md5(string_agg(md5(row_to_json(d)::text),'' order by id)) from public.pharmflow_global_item_identifiers_v2 d)");const baselineHashMs=performance.now()-hashAt;
 const window={};vm.runInNewContext(fs.readFileSync('js/global-items-export.js','utf8'),{window,document:{readyState:'loading',addEventListener(){}}});
 const w=worker();await w.send('start');let calls=0,dbMs=0,metaResponses=0;const start=performance.now();
 const counts=await window.PharmFlowGlobalItemsExport.collect(async(name,args)=>{const at=performance.now();const r=await rpc(name,args);dbMs+=performance.now()-at;calls++;if(r.items!==undefined)metaResponses++;return r;},()=>{},(kind,rows)=>w.send('page',{kind,rows}));
 assert.equal(counts.items.length,0);assert.equal(counts.identifiers.length,0);assert.equal(counts.itemCount,56588);assert.equal(counts.identifierCount,78164);assert.equal(calls,183);assert.equal(metaResponses,1);
 const buildAt=performance.now(),{buffer}=await w.send('finish'),workbookMs=performance.now()-buildAt,writerRssMiB=Math.round(process.memoryUsage().rss/1048576);
 if(process.env.PHARMFLOW_EXPORT_TEST_XLSX)fs.writeFileSync(process.env.PHARMFLOW_EXPORT_TEST_XLSX,Buffer.from(buffer));
 const exportMs=performance.now()-start;
 const book=w.c.XLSX.read(buffer,{type:'array'});assert.equal(w.c.XLSX.utils.decode_range(book.Sheets.Items['!ref']).e.r,56588);assert.equal(w.c.XLSX.utils.decode_range(book.Sheets.Identifiers['!ref']).e.r,78164);assert.equal(book.Sheets.Items.A2.v,'00000000');assert.equal(book.Sheets.Identifiers.B2.t,'s');
 console.log('V2_SCALE',JSON.stringify({items:56588,identifiers:78164,requests:calls,countQueries:2,metadataResponses:metaResponses,fullFingerprints:0,baselineSingleHashMs:+baselineHashMs.toFixed(2),databaseAllPagesMs:+dbMs.toFixed(2),workbookMs:+workbookMs.toFixed(2),exportMs:+exportMs.toFixed(2),totalMs:+(performance.now()-start).toFixed(2),xlsxBytes:buffer.byteLength,writerRssMiB,wholeProcessPeakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),conditions:'local PGlite and Node VM; includes SQL/collector/workbook/readback, excludes browser/network'}));
 }finally{await db.close();}
});
