"use strict";
/* Page-wise OOXML/ZIP writer: retain UTF-8 chunks, never a full cell-object graph.
   Native compression is optional; stored ZIP entries are valid XLSX fallback. */
const encoder=new TextEncoder(),crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let b=0;b<8;b++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[i]=c>>>0;}
let sheets=null;
function xml(value){return String(value??'').replace(/_x[0-9a-f]{4}_/gi,m=>'_x005F_'+m.slice(1)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,c=>'_x'+c.charCodeAt(0).toString(16).padStart(4,'0')+'_').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function rowXml(values,number){return '<row r="'+number+'">'+values.map((v,i)=>{const ref=String.fromCharCode(65+i)+number;return typeof v==='number'?'<c r="'+ref+'"><v>'+v+'</v></c>':'<c r="'+ref+'" s="1" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';}).join('')+'</row>';}
const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
async function entry(name,chunks){
 let crc=0xffffffff,size=0;for(const chunk of chunks){size+=chunk.length;for(const byte of chunk)crc=crcTable[(crc^byte)&255]^(crc>>>8);}crc=(crc^0xffffffff)>>>0;
 let parts=chunks,method=0;
 if(typeof CompressionStream==='function'){
  const stream=new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}}).pipeThrough(new CompressionStream('deflate'));
  const zlib=new Uint8Array(await new Response(stream).arrayBuffer());
  // ZIP method 8 stores RFC1951 bytes, without the RFC1950 header/checksum.
  if(zlib.length<6 || (zlib[1]&32)!==0)throw Error('Unsupported compression output');
  parts=[zlib.subarray(2,zlib.length-4)];method=8;
 }
 return {name:encoder.encode(name),parts,method,crc,size,compressed:parts.reduce((n,p)=>n+p.length,0)};
}
function zip(entries){
 const headers=[],central=[];let offset=0;
 for(const e of entries){
  e.offset=offset;const h=new Uint8Array(30+e.name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,e.method,true);v.setUint16(12,33,true);v.setUint32(14,e.crc,true);v.setUint32(18,e.compressed,true);v.setUint32(22,e.size,true);v.setUint16(26,e.name.length,true);h.set(e.name,30);headers.push(h,...e.parts);offset+=h.length+e.compressed;
  const c=new Uint8Array(46+e.name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(10,e.method,true);d.setUint16(14,33,true);d.setUint32(16,e.crc,true);d.setUint32(20,e.compressed,true);d.setUint32(24,e.size,true);d.setUint16(28,e.name.length,true);d.setUint32(42,e.offset,true);c.set(e.name,46);central.push(c);
 }
 const centralSize=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 const size=offset+centralSize+22;if(size>=0xffffffff)throw Error('Excel archive size limit exceeded');
 const out=new Uint8Array(size);let at=0;for(const chunk of [...headers,...central,end]){out.set(chunk,at);at+=chunk.length;}return out.buffer;
}
async function finish(){
 const specs=[
 ['[Content_Types].xml',prefix+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
 ['_rels/.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml',prefix+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Items" sheetId="1" r:id="rId1"/><sheet name="Identifiers" sheetId="2" r:id="rId2"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml',prefix+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']
 ];
 const entries=[];for(const [name,value]of specs)entries.push(await entry(name,[encoder.encode(value)]));
 for(const [i,kind]of ['Items','Identifiers'].entries()){
  const sheet=sheets[kind],widths=kind==='Items'?[18,48,20,18,20,20]:[18,32,40];
  const head=prefix+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+String.fromCharCode(64+widths.length)+sheet.rows+'"/><cols>'+widths.map((w,n)=>'<col min="'+(n+1)+'" max="'+(n+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>';
  entries.push(await entry('xl/worksheets/sheet'+(i+1)+'.xml',[encoder.encode(head),...sheet.chunks,encoder.encode('</sheetData></worksheet>')]));sheet.chunks=[];
 }
 return zip(entries);
}
self.onmessage=async({data})=>{
 const {id,type}=data;
 try{
  if(type==='start'){
   sheets={};for(const [kind,headers]of [['Items',['Item Code','Item Name','Group','Identifier Count','Category','Sub Category']],['Identifiers',['Item Code','Identifier / GTIN / Barcode','Identifier Reference']]])sheets[kind]={rows:1,chunks:[encoder.encode(rowXml(headers,1))]};
  }else if(type==='page'){
   if(!sheets || !['Items','Identifiers'].includes(data.kind))throw Error('Export not initialized');
   const sheet=sheets[data.kind];if(sheet.rows+data.rows.length>1048576)throw Error('Excel row limit exceeded');
   sheet.chunks.push(encoder.encode(data.rows.map((i,n)=>rowXml(data.kind==='Items'?[String(i.item_code),String(i.item_name??''),String(i.group_name??''),Number(i.identifier_count),String(i.category??''),String(i.sub_category??'')]:[String(i.item_code),String(i.identifier_display),String(i.id)],sheet.rows+n+1)).join('')));sheet.rows+=data.rows.length;
  }else if(type==='finish'){
   if(!sheets)throw Error('Export not initialized');const buffer=await finish();sheets=null;self.postMessage({id,buffer},[buffer]);return;
  }else throw Error('Invalid export request');
  self.postMessage({id,ready:true});
 }catch(error){sheets=null;self.postMessage({id,error:error.message||'Unable to generate Excel file. Please retry.'});}
};
