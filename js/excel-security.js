"use strict";

// Shared by the browser and its dedicated parsing worker. No backend access.
(function(root){
    const version="0.20.3";
    const limits=Object.freeze({
        fileBytes:32*1024*1024,
        expandedBytes:128*1024*1024,
        zipEntries:4096,
        sheets:64,
        rowsPerSheet:250000,
        totalRows:500000,
        columns:256,
        cells:4000000,
        timeoutMs:30000
    });
    const scriptUrl=root.document?.currentScript?.src;
    const fail=message=>{throw new Error(message);};
    function validateFile(file){
        if(!file || !Number.isSafeInteger(file.size) || file.size<=0)
            fail("The Excel file is empty or unreadable. Select a valid .xlsx or .xls file.");
        if(!/\.(xlsx|xls)$/i.test(file.name||""))
            fail("Unsupported file. Select an Excel .xlsx or .xls file.");
        if(file.size>limits.fileBytes)
            fail("Excel file exceeds 32 MB. Split it into smaller workbooks and retry.");
    }
    // ZIP directory sizes are checked before decompression. Worker timeout also
    // bounds processing; directory declarations are not a hard memory sandbox.
    function validateBuffer(buffer,name){
        const bytes=new Uint8Array(buffer),view=new DataView(buffer);
        const zip=bytes[0]===0x50 && bytes[1]===0x4b;
        if(!zip){
            const cfb=bytes.length>=8 && [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v,i)=>bytes[i]===v);
            const xml=new TextDecoder().decode(bytes.subarray(0,1024)).replace(/^\uFEFF/,"").trimStart();
            const legacyMarkup=/^<(?:\?xml|html\b|table\b|Workbook\b)/i.test(xml);
            if(/\.xlsx$/i.test(name) || (!cfb && !legacyMarkup))
                fail("This is not a valid Excel workbook. Open it in Excel and save a fresh .xlsx copy.");
            return;
        }
        let end=-1;
        for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
            if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
        }
        if(end<0)fail("The Excel workbook is damaged or incomplete. Save a fresh copy and retry.");
        const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
        if(view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0 || count===65535 || offset===0xffffffff || size===0xffffffff)
            fail("This workbook uses an unsupported archive format. Save a standard .xlsx copy.");
        if(count>limits.zipEntries)fail("Excel workbook contains too many archive entries. Split it and retry.");
        if(offset+size>end)fail("The Excel workbook archive is invalid. Save a fresh copy.");
        let cursor=offset,expanded=0;
        for(let i=0;i<count;i++){
            if(cursor+46>offset+size || view.getUint32(cursor,true)!==0x02014b50)
                fail("The Excel workbook archive is invalid. Save a fresh copy.");
            if(view.getUint16(cursor+8,true)&1)fail("Password-protected workbooks are not supported. Save an unencrypted copy.");
            expanded+=view.getUint32(cursor+24,true);
            if(expanded>limits.expandedBytes)fail("Expanded Excel workbook exceeds 128 MB. Split it and retry.");
            cursor+=46+view.getUint16(cursor+28,true)+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
            if(cursor>offset+size)fail("The Excel workbook archive is invalid. Save a fresh copy.");
        }
        if(cursor!==offset+size)fail("The Excel workbook archive is invalid. Save a fresh copy.");
    }
    function validateWorkbook(workbook,xlsx){
        if(!workbook?.SheetNames?.length)fail("Excel workbook contains no worksheets.");
        if(workbook.SheetNames.length>limits.sheets)fail("Excel workbook exceeds 64 worksheets. Split it and retry.");
        let rows=0,cells=0;
        for(const name of workbook.SheetNames){
            const sheet=workbook.Sheets[name];
            if(!sheet)continue;
            if(sheet['!ref']){
                let range;
                try{range=xlsx.utils.decode_range(sheet['!ref']);}catch(_){fail("Excel worksheet has an invalid range.");}
                if(!Number.isSafeInteger(range.e.r) || range.e.r<0 || range.e.r>=limits.rowsPerSheet)
                    fail("Excel worksheet exceeds 250,000 rows. Split it and retry.");
                if(!Number.isSafeInteger(range.e.c) || range.e.c<0 || range.e.c>=limits.columns)
                    fail("Excel worksheet exceeds 256 columns. Remove unused far-right columns and retry.");
                rows+=range.e.r+1;
                if(rows>limits.totalRows)fail("Excel workbook exceeds 500,000 total rows. Split it and retry.");
            }
            cells+=Object.keys(sheet).filter(key=>key[0]!=="!").length;
            if(cells>limits.cells)fail("Excel workbook exceeds 4,000,000 cells. Split it and retry.");
        }
        return workbook;
    }
    function readFile(file,options={}){
        try{validateFile(file);}catch(error){return Promise.reject(error);}
        if(typeof root.Worker!=="function" || !scriptUrl)
            return Promise.reject(new Error("Secure Excel processing is unavailable. Use an up-to-date Chrome or Edge browser."));
        return new Promise((resolve,reject)=>{
            let worker,timer;
            const finish=(error,workbook)=>{
                clearTimeout(timer);worker?.terminate();
                if(error)reject(error);else resolve(workbook);
            };
            try{
                worker=new root.Worker(new URL('excel-parser-worker.js?v=SEC001_1',scriptUrl));
                timer=setTimeout(()=>finish(new Error("Excel processing exceeded 30 seconds. Split the workbook into smaller files and retry.")),limits.timeoutMs);
                worker.onmessage=event=>{
                    if(event.data?.ok && event.data.version===version)finish(null,event.data.workbook);
                    else finish(new Error(event.data?.error||"Excel processing failed. Save a fresh workbook and retry."));
                };
                worker.onerror=()=>finish(new Error("Excel processing could not start. Reload PharmFlow and retry."));
                worker.postMessage({file,cellDates:options.cellDates===true});
            }catch(_){finish(new Error("Secure Excel processing could not start. Reload PharmFlow and retry."));}
        });
    }
    root.PharmFlowExcel=Object.freeze({version,limits,validateFile,validateBuffer,validateWorkbook,readFile});
})(globalThis);
