"use strict";
importScripts("vendor/sheetjs-0.20.3/xlsx.full.min.js", "excel-security.js?v=SEC001_1", "item-transfer-parser.js?v=4");
self.onmessage = async ({data}) => {
    try {
        if (XLSX.version !== PharmFlowExcel.version) throw new Error("Excel reader version mismatch.");
        const {pharmacy, fixture} = data;
        let file = data.file;
        let buffer;
        if (fixture) {
            buffer = PharmFlowTransferParser.syntheticTransfer(XLSX, fixture, pharmacy);
            file = {name: "Synthetic-" + fixture + ".xlsx", size: buffer.byteLength};
        } else {
            PharmFlowExcel.validateFile(file);
            buffer = await file.arrayBuffer();
        }
        const start = performance.now();
        const transfer = PharmFlowTransferParser.parseTransfer(buffer, file, XLSX, PharmFlowExcel, pharmacy);
        self.postMessage({transfer, readMs: performance.now() - start, bytes: buffer.byteLength});
    } catch (error) {
        self.postMessage({error: error.message || "Unable to read this transfer."});
    }
};
