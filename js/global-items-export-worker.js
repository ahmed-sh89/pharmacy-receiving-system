"use strict";
importScripts('vendor/sheetjs-0.20.3/xlsx.full.min.js');
self.onmessage=({data})=>{
 try{
  const book=XLSX.utils.book_new();
  // Explicit strings preserve leading zeros, alphanumeric identifiers and
  // formula-looking values. Item Code is the current schema's unique PK.
  const items=[['Item Code','Item Name','Group','Identifier Count','Category','Sub Category'],...data.items.map(i=>[String(i.item_code),String(i.item_name||''),String(i.group_name||''),i.identifier_count,String(i.category||''),String(i.sub_category||'')])];
  const ids=[['Item Code','Identifier / GTIN / Barcode','Identifier Reference'],...data.identifiers.map(i=>[String(i.item_code),String(i.identifier_display),String(i.id)])];
  for(const [name,rows]of [['Items',items],['Identifiers',ids]]){
   const sheet=XLSX.utils.aoa_to_sheet(rows);
   for(const key of Object.keys(sheet))if(key[0]!=='!' && sheet[key].t==='s'){sheet[key].z='@';delete sheet[key].f;}
   sheet['!cols']=name==='Items'?[{wch:18},{wch:48},{wch:20},{wch:18},{wch:20},{wch:20}]:[{wch:18},{wch:32},{wch:40}];
   XLSX.utils.book_append_sheet(book,sheet,name);
  }
  const buffer=XLSX.write(book,{bookType:'xlsx',type:'array',compression:true});self.postMessage({buffer},[buffer]);
 }catch(_){self.postMessage({error:'Unable to generate Excel file. Please retry.'});}
};
