/* Authoritative Inventory dataset -> compact paper rows and full-value electronic rows. */
(function(){
  const headers=['✓','Item Code','GTIN','Product Name','Group','Batch','Expiry','Qty'];
  const excelHeaders=['Item Code','GTIN','Product Name','Group','Batch','Expiry','Quantity','Operator','Last Updated','Status'];
  const groupLabel=row=>window.ExpiryInventoryFilters?.rowGroup(row).label||'Uncategorized';
  const rows=source=>source.map(r=>['',String(r.item_code??''),String(r.identifier_display??''),String(r.item_name??''),groupLabel(r),r.batch_no||'—',String(r.expiry_month).padStart(2,'0')+'/'+r.expiry_year,Number(r.quantity)||0]);
  const localDate=value=>{const date=new Date(value);return value&&!Number.isNaN(date.getTime())?date.toLocaleString():'';};
  const excelRows=source=>rows(source).map((r,i)=>[...r.slice(1,7),r[7],String(source[i].first_operator_name||'—'),localDate(source[i].updated_at),String(source[i].status||'ACTIVE')]);
  const layout={margin:14.1732,rowHeight:10.5,headerHeight:10,metaHeight:9,font:7,minFont:6.5,widths:[10,49,70,0,53,80,40,25]};
  const columnWidths=width=>layout.widths.map((v,i)=>i===3?width-layout.widths.reduce((a,b)=>a+b,0):v);
  // Keep A4 columns bounded. Exact identifiers wrap; their values are never shortened.
  function paperWidths(data,width){return columnWidths(width);}
  function wrap(value,width,measure,words=false){
    const lines=[''];for(const character of Array.from(String(value))){
      if(character==='\n'){lines.push('');continue;}
      const i=lines.length-1;
      if(lines[i]&&measure(lines[i]+character,layout.font)>width){const space=words?lines[i].lastIndexOf(' '):-1;if(space>0){const tail=lines[i].slice(space+1);lines[i]=lines[i].slice(0,space+1);lines.push(tail+character);}else lines.push(character);}else lines[i]+=character;
    }return lines;
  }
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fit(value,width,measure,abbreviate,identity){
    const text=String(value);let size=layout.font;
    if(measure(text,size)>width)size=layout.minFont;
    if(measure(text,size)<=width)return {text,size,shortened:false};
    if(!abbreviate||!identity)throw Error('Paper field cannot fit safely: '+text.slice(0,36)+'. Use Excel or request a paper layout review.');
    let short=text;while(short&&measure(short+'…',size)>width)short=short.slice(0,-1);
    return {text:short+'…',size,shortened:true};
  }
  let fontPromise;
  async function fontData(){
    if(!fontPromise)fontPromise=fetch(new URL('../assets/fonts/DejaVuSans.ttf',document.currentScript?.src||new URL('js/expiry-inventory-report.js',document.baseURI)),{credentials:'omit'}).then(r=>{if(!r.ok)throw Error('Report font unavailable');return r.arrayBuffer();}).then(buffer=>{
      const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
    }).catch(e=>{fontPromise=null;throw e;});
    return fontPromise;
  }
  async function pdf(data,meta,guard=()=>{},save=true){
    if(!window.jspdf?.jsPDF)throw Error('PDF library unavailable. Please retry when connected.');
    const font=await fontData();guard();
    const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'a4'});
    doc.addFileToVFS('ShelfSans.ttf',font);doc.addFont('ShelfSans.ttf','ShelfSans','normal');doc.setFont('ShelfSans','normal');
    const m=layout.margin,w=doc.internal.pageSize.getWidth()-2*m,h=doc.internal.pageSize.getHeight(),measure=(text,size)=>{doc.setFontSize(size);return doc.getTextWidth(text);},widths=paperWidths(data,w,measure),xs=[m];
    widths.slice(0,-1).forEach(v=>xs.push(xs.at(-1)+v));
    const fitted=data.map(row=>row.map((v,i)=>i===0?['']:wrap(v,widths[i]-3,measure,i===3||i===4)));
    let y=0,page=0,perPage=[];
    const heading=()=>{page++;perPage.push(0);doc.setFontSize(6.5);doc.setTextColor(35);doc.text('PharmFlow Expiry Shelf Check - '+String(meta.pharmacy||'')+' - '+meta.date,m,m+6);doc.text(String(page),m+w,m+6,{align:'right'});y=m+layout.metaHeight;doc.setFillColor(240);doc.rect(m,y,w,layout.headerHeight,'F');doc.setFontSize(6.5);headers.forEach((v,i)=>{if(i)doc.text(v,xs[i]+1.5,y+7);});y+=layout.headerHeight;};
    heading();
    fitted.forEach(row=>{
      const height=Math.max(layout.rowHeight,...row.map(lines=>lines.length*9+3));
      if(height>h-2*m-layout.metaHeight-layout.headerHeight)throw Error('A report row exceeds one page. Use Excel for this record.');
      if(y+height>h-m){doc.addPage();heading();}
      doc.setDrawColor(165);doc.setLineWidth(.2);doc.line(m,y+height,m+w,y+height);
      row.forEach((lines,i)=>{if(!i){doc.rect(xs[0]+2,y+3,4.5,4.5);return;}doc.setFontSize(layout.font);lines.forEach((line,j)=>doc.text(line,i===7?xs[i]+widths[i]-1.5:xs[i]+1.5,y+8+j*9,i===7?{align:'right'}:undefined));});
      y+=height;perPage[page-1]++;
    });
    doc.pharmflowReport={rows:data.length,rowsPerPage:perPage,orientation:'portrait',font:layout.font,rowHeight:'content',shortenedNames:0};
    guard();if(save)doc.save('PharmFlow_Expiry_Shelf_Check.pdf');return doc;
  }
  function printMarkup(data,meta){
    const widths=paperWidths(data,595.28-2*layout.margin);
    return '<div class="expiryPaperMeta">PharmFlow Expiry Shelf Check - '+escape(meta.pharmacy)+' - '+escape(meta.date)+'</div><table><colgroup>'+widths.map(w=>'<col style="width:'+w/(595.28-2*layout.margin)*100+'%">').join('')+'</colgroup><thead><tr>'+headers.map(v=>'<th>'+escape(v)+'</th>').join('')+'</tr></thead><tbody>'+data.map(row=>'<tr>'+row.map((v,i)=>'<td'+([1,2,5,6,7].includes(i)?' class="essential"':'')+'><span'+''+'>'+escape(i===0?'□':v)+'</span></td>').join('')+'</tr>').join('')+'</tbody></table>';
  }
  function workbookBytes(wb){
    if(!XLSX.CFB)throw Error('Excel print configuration unavailable. Reload and retry.');
    const zip=XLSX.CFB.read(new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'})),{type:'buffer'}),decoder=new TextDecoder(),encoder=new TextEncoder();
    const patch=(path,fn)=>{const i=zip.FullPaths.findIndex(p=>p.endsWith('/'+path));if(i<0)throw Error('Excel package missing '+path);const entry=zip.FileIndex[i];entry.content=encoder.encode(fn(decoder.decode(entry.content)));entry.size=entry.content.length;};
    patch('xl/worksheets/sheet1.xml',xml=>xml.replace(/<worksheet([^>]*)>/,'<worksheet$1><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>').replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>').replace(/<pageMargins[^>]*\/>/,m=>'<pageMargins left="0.2" right="0.2" top="0.2" bottom="0.2" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'));
    let headerStyle;
    patch('xl/styles.xml',xml=>{
      const fonts=Number(xml.match(/<fonts count="(\d+)"/)[1]),fills=Number(xml.match(/<fills count="(\d+)"/)[1]);
      headerStyle=Number(xml.match(/<cellXfs count="(\d+)"/)[1]);
      return xml.replace(/<sz val="[\d.]+"\s*\/>/g,'<sz val="10"/>')
        .replace(/<fonts count="\d+"/, '<fonts count="'+(fonts+1)+'"').replace('</fonts>','<font><sz val="10"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>')
        .replace(/<fills count="\d+"/,'<fills count="'+(fills+1)+'"').replace('</fills>','<fill><patternFill patternType="solid"><fgColor rgb="FF304E70"/><bgColor indexed="64"/></patternFill></fill></fills>')
        .replace(/<cellXfs count="\d+"/,'<cellXfs count="'+(headerStyle+1)+'"')
        .replace(/<xf([^>]*?)\/>/g,'<xf$1 applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>')
        .replace('</cellXfs>','<xf numFmtId="0" fontId="'+fonts+'" fillId="'+fills+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>');
    });
    patch('xl/worksheets/sheet1.xml',xml=>xml.replace(/(<row r="1"[^>]*>)([\s\S]*?)(<\/row>)/,(all,start,body,end)=>start+body.replace(/<c([^>]*)>/g,(match,attrs)=>'<c'+attrs.replace(/ s="\d+"/,'')+' s="'+headerStyle+'">')+end));

    const ref=wb.Sheets[wb.SheetNames[0]]['!ref'];
    const names='<definedName name="_xlnm.Print_Area" localSheetId="0">&apos;Expiry Inventory&apos;!'+ref.split(':').map(a=>a.replace(/([A-Z]+)(\d+)/,'$$$1$$$2')).join(':')+'</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;Expiry Inventory&apos;!$1:$1</definedName>';
    patch('xl/workbook.xml',xml=>xml.includes('</definedNames>')?xml.replace('</definedNames>',names+'</definedNames>'):xml.replace('</workbook>','<definedNames>'+names+'</definedNames></workbook>'));
    return new Uint8Array(XLSX.CFB.write(zip,{fileType:'zip',type:'array'}));
  }
  function saveWorkbook(wb,guard=()=>{}){const bytes=workbookBytes(wb);guard();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download='PharmFlow_Expiry_Inventory.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  window.ExpiryInventoryReport={headers,rows,excelHeaders,excelRows,pdf,printMarkup,workbookBytes,saveWorkbook,layout,fit,paperWidths,wrap};
})();
