"use strict";
(function (root) {
    const clean = value => String(value ?? "").trim().replace(/\s+/g, " ");
    const key = value => clean(value).toLowerCase().replace(/[^a-z]/g, "");
    const layout = {
        userid: "user_id", tonumber: "number", fromwarehouse: "source",
        towarehouse: "destination", receiveingdate: "date", receivingdate: "date"
    };
    function isoDate(value, xlsx, date1904) {
        if (Object.prototype.toString.call(value) === "[object Date]") {
            return String(value.getFullYear()).padStart(4, "0") + "-" +
                String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
        }
        if (typeof value === "number") {
            const date = xlsx.SSF.parse_date_code(value, {date1904});
            if (!date || date.y < 1900) throw new Error("Invalid receiving date.");
            return isoDate([date.y, date.m, date.d].map((part, index) => String(part).padStart(index ? 2 : 4, "0")).join("-"), xlsx, date1904);
        }
        const text = clean(value);
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const local = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
        if (!iso && !local) throw new Error("Expected a receiving date in day/month/year format.");
        const [y, m, d] = iso ? iso.slice(1).map(Number) :
            [Number(local[3]), Number(local[2]), Number(local[1])];
        const date = new Date(Date.UTC(y, m - 1, d));
        if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) {
            throw new Error("Invalid receiving date.");
        }
        return date.toISOString().slice(0, 10);
    }

    function parseTransfer(buffer, file, xlsx, validation, expectedPharmacy) {
        validation.validateFile(file);
        validation.validateBuffer(buffer, file.name);
        const book = validation.validateWorkbook(xlsx.read(buffer, {type: "array", cellDates: true}), xlsx);
        const candidates = book.SheetNames.map(name => xlsx.utils.sheet_to_json(book.Sheets[name], {header: 1, blankrows: false}))
            .filter(rows => rows.some(row => row.some(cell => key(cell) === "itemnumber")));
        if (candidates.length !== 1) throw new Error("Expected one transfer worksheet with Item Number.");
        const rows = candidates[0];
        const headerIndex = rows.findIndex(row => row.some(cell => key(cell) === "itemnumber"));
        const header = rows[headerIndex].map(key);
        const columns = ["itemnumber", "itemname", "quantity"].map(name => header.indexOf(name));
        if (columns.some(index => index < 0)) throw new Error("Missing item number, item name, or quantity column.");
        const metadata = {};
        for (const row of rows.slice(0, headerIndex)) {
            const index = row.findIndex(cell => layout[key(cell)]);
            if (index !== -1) {
                const field = layout[key(row[index])];
                if (Object.hasOwn(metadata, field)) throw new Error("Repeated transfer field: " + field);
                metadata[field] = row.slice(index + 1).find(value => value != null && clean(value) !== "");
            }
        }
        const user_id = clean(metadata.user_id).toUpperCase();
        if (!user_id || user_id !== clean(expectedPharmacy).toUpperCase()) throw new Error("File User ID does not match this pharmacy.");
        const number = clean(metadata.number).toUpperCase();
        const source = clean(metadata.source).toUpperCase(), destination = clean(metadata.destination).toUpperCase();
        if (!/^TO-[0-9]{1,30}$/.test(number) || !source || !destination || source.length > 64 || destination.length > 64) {
            throw new Error("Invalid TO number, source or destination.");
        }
        const items = rows.slice(headerIndex + 1).map((row, index) => {
            const [code, name, qty] = columns.map(column => clean(row[column]));
            const quantity = Number(qty);
            if (!code || code.length > 64 || !name || name.length > 250 ||
                !/^\d+(?:\.\d{1,6})?$/.test(qty) || !Number.isFinite(quantity) || quantity < 0 || quantity > 1e9) {
                throw new Error("Invalid item or quantity on item row " + (index + 1) + ".");
            }
            return {code, name, quantity};
        });
        if (!items.length || items.length > 5000) throw new Error("A transfer must have 1 to 5,000 item rows.");
        return {number, user_id, source, destination, date: isoDate(metadata.date, xlsx, book.Workbook?.WBProps?.date1904 === true), items};
    }

    function syntheticTransfer(xlsx, number, pharmacy) {
        const rows = [
            [null, "Bulk-TO Receive"], [null, "User ID", pharmacy], [null, "TO Number", "TO-" + String(900000 + number)],
            [null, "From Warehouse", "TEST-" + (number % 8 + 1)], [null, "To Warehouse", "TEST-DEST"],
            [null, "Receiveing Date", "2026-09-" + String(number % 28 + 1).padStart(2, "0")],
            [null, "Item Number", "Item Name", "Category", "Price", "Size", "Color", "Quantity"],
            ...Array.from({length: 6}, (_, i) => [null, String(810001 + i), "Synthetic item " + (i + 1), "", "", "", "", (number % 12 + 1) * (i + 1)])
        ];
        const book = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), "Sheet1");
        return xlsx.write(book, {type: "array", bookType: "xlsx", compression: true});
    }

    root.PharmFlowTransferParser = {parseTransfer, syntheticTransfer};
})(globalThis);
