const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {test} = require('node:test');
const {PGlite} = require('@electric-sql/pglite');

const context = vm.createContext({TextDecoder, TextEncoder, Uint8Array, DataView, ArrayBuffer});
for (const file of ['js/vendor/sheetjs-0.20.3/xlsx.full.min.js', 'js/excel-security.js', 'js/item-transfer-parser.js']) {
    vm.runInContext(readFileSync(file, 'utf8'), context);
}
const xlsx = context.XLSX, parser = context.PharmFlowTransferParser, validation = context.PharmFlowExcel;
const scope = 'f1000000-0000-4000-8000-000000000001';
const outside = 'f1000000-0000-4000-8000-000000000002';
const actor = 'f1000000-0000-4000-8000-000000000003';
const sqlFile = 'proposals/staging/20261116010000_item_transfer_history.sql';

function buffers() {
    return Array.from({length: 100}, (_, i) => parser.syntheticTransfer(xlsx, i + 1, 'BENCHMARK'));
}
function parse(files) {
    return files.map((buffer, i) => parser.parseTransfer(buffer, {name: 'Synthetic-' + i + '.xlsx', size: buffer.byteLength},
        xlsx, validation, 'BENCHMARK'));
}

test('real source layout, pharmacy identity and day-first dates', () => {
    const rows = [
        ['Bulk-TO Receive'], ['User ID', 'benchmark'], ['TO Number', 'TO-001'], ['From Warehouse', 'TEST-A'],
        ['To Warehouse', 'TEST-B'], ['Receiveing Date', '9/3/2026'],
        ['Item Number', 'Item Name', 'Category', 'Price', 'Size', 'Color', 'Quantity'], ['0012', 'Synthetic name', '', '', '', '', '100.0']
    ];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows.map(row => [null,...row])), 'Sheet1');
    const data = xlsx.write(wb, {type: 'array', bookType: 'xlsx'});
    const file = {name: 'fixture.xlsx', size: data.byteLength};
    assert.throws(() => parser.parseTransfer(data, file, xlsx, validation, 'OTHER'), /User ID/);
    const result = parser.parseTransfer(data, file, xlsx, validation, 'BENCHMARK');
    assert.equal(result.date, '2026-03-09');
    assert.equal(result.items[0].code, '0012');
    assert.equal(result.items[0].quantity, 100);
});

test('100 XLSX reads, receipt and replay, conflict and tenant isolation using the candidate SQL', async t => {
    const files = buffers();
    const cold = performance.now();
    const transfers = parse(files);
    const firstReadMs = performance.now() - cold;
    const repeat = [];
    for (let trial = 0; trial < 4; trial++) {
        const start = performance.now();
        parse(files);
        repeat.push(performance.now() - start);
    }
    const excelBytes = files.reduce((total, file) => total + file.byteLength, 0);
    assert.equal(transfers.length, 100);
    assert.equal(transfers.reduce((n, x) => n + x.items.length, 0), 600);
    const db = new PGlite();
    t.after(() => db.close());
    // Minimal test doubles for existing application authorization; the import/query functions are the actual SQL.
    await db.exec(`
        create role authenticated; create role anon;
        create schema auth; create schema pharmflow_auth_private;
        create table public.pharmacies(id uuid primary key, code text not null);
        insert into public.pharmacies values ('${scope}','BENCHMARK'),('${outside}','OTHER');
        create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
        create function pharmflow_auth_private.require_access(pid uuid, module text, writing boolean, action text)
        returns void language plpgsql as $$ begin
          if pid <> '${scope}' or (writing and current_setting('test.read_only', true) = 'yes') then
            raise exception 'permission denied' using errcode='42501';
          end if;
        end $$;
    `);
    await db.exec(readFileSync(sqlFile, 'utf8'));
    await db.exec('set role authenticated');
    let payloadBytes = 0;
    const batches = Array.from({length: 4}, (_, i) => transfers.slice(i * 25, i * 25 + 25));
    const sql = 'select * from public.import_pharmflow_transfer_history_v1($1,$2::jsonb)';
    const save = async () => {
        const rows = [];
        for (const batch of batches) {
            const json = JSON.stringify(batch);
            payloadBytes += Buffer.byteLength(JSON.stringify({p_pharmacy_id: scope, p_transfers: batch}));
            rows.push(...(await db.query(sql, [scope, json])).rows);
        }
        return rows;
    };
    const started = performance.now();
    const inserted = await save();
    const firstSaveMs = performance.now() - started;
    const firstPayloadBytes = payloadBytes;
    assert.equal(inserted.filter(r => r.outcome === 'imported').length, 100);
    const replayStart = performance.now();
    const replay = await save();
    const replayMs = performance.now() - replayStart;
    assert.equal(replay.filter(r => r.outcome === 'duplicate').length, 100);
    const changed = structuredClone(transfers[0]);
    changed.items[0].quantity += 1;
    assert.equal((await db.query(sql, [scope, JSON.stringify([changed])])).rows[0].outcome, 'conflict');
    const reordered = {...transfers[0], items: [...transfers[0].items].reverse()};
    assert.equal((await db.query(sql, [scope, JSON.stringify([reordered])])).rows[0].outcome, 'duplicate');
    await assert.rejects(db.query(sql, [outside, JSON.stringify([transfers[0]])]), /permission denied/);
    await db.exec("set test.read_only='yes'");
    await assert.rejects(db.query(sql, [scope, JSON.stringify([transfers[0]])]), /permission denied/);
    const searchStart = performance.now();
    const search = await db.query('select * from public.search_pharmflow_transfer_history_v1($1,$2,$3,$4)', [scope,'810001','2026-09-01','2026-09-30']);
    const searchMs = performance.now() - searchStart;
    assert.equal(search.rows.length, 100);
    assert.equal(search.rows.find(row => row.number === transfers[0].number).source, transfers[0].source);
    const partial = await db.query('select * from public.search_pharmflow_transfer_history_v1($1,$2,$3,$4,$5)', [scope,'Synthetic item','2026-09-01','2026-09-30',100]);
    assert.equal(partial.rows.length, 101);
    await assert.rejects(db.query('select * from public.search_pharmflow_transfer_history_v1($1,$2,$3,$4)', [outside,'810001','2026-09-01','2026-09-30']), /permission denied/);
    await assert.rejects(db.query('select * from pharmflow_transfer_private.documents'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query(sql,[scope,JSON.stringify([transfers[0]])]), /permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from pharmflow_transfer_private.items')).rows[0].n,600);
    t.diagnostic(JSON.stringify({files:100,items:600,excelBytes,firstPayloadBytes,requests:4,firstReadMs,repeatReadMs:repeat,firstSaveMs,replayMs,searchMs}));
});
