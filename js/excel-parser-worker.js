"use strict";
importScripts('vendor/sheetjs-0.20.3/xlsx.full.min.js','excel-security.js?v=SEC001_1');
self.onmessage=async event=>{
    try{
        const {file,cellDates}=event.data;
        PharmFlowExcel.validateFile(file);
        if(XLSX.version!==PharmFlowExcel.version)throw new Error('Excel library version mismatch. Reload PharmFlow.');
        const buffer=await file.arrayBuffer();
        PharmFlowExcel.validateBuffer(buffer,file.name);
        let workbook;
        try{
            workbook=XLSX.read(buffer,{type:'array',cellDates:cellDates===true,cellText:true,cellNF:true});
        }catch(_){throw new Error('Unable to read this Excel workbook. Save a fresh, unencrypted .xlsx copy and retry.');}
        PharmFlowExcel.validateWorkbook(workbook,XLSX);
        self.postMessage({ok:true,version:XLSX.version,workbook});
    }catch(error){
        self.postMessage({ok:false,error:error.message||'Unable to process this Excel workbook.'});
    }
};
