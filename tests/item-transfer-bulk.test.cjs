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

async function initializeDatabase(db) {
    await db.exec(`
        create role authenticated; create role anon;
        create schema auth; create schema pharmflow_auth_private;
        create table public.pharmacies(id uuid primary key, code text not null, name text not null);
        insert into public.pharmacies values ('${scope}','BENCHMARK','Benchmark'),('${outside}','SOURCE-2','Example Pharmacy');
        create table public.archive_fixture (pharmacy_id uuid, archive_id text, order_numbers text[], closed_at timestamptz, archive_payload jsonb);
        create function public.list_pharmflow_finalized_archives(p_pharmacy_id uuid)
        returns table(archive_id text, order_numbers text[], closed_at timestamptz, archive_payload jsonb)
        language plpgsql as $$ begin
          perform pharmflow_auth_private.require_access(p_pharmacy_id, 'RECEIVING', false, 'archives');
          return query select a.archive_id,a.order_numbers,a.closed_at,a.archive_payload from public.archive_fixture a where pharmacy_id=p_pharmacy_id;
        end $$;
        create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
        create function pharmflow_auth_private.require_access(pid uuid, module text, writing boolean, action text)
        returns void language plpgsql as $$ begin
          if pid <> '${scope}' or (writing and current_setting('test.read_only', true) = 'yes') then
            raise exception 'permission denied' using errcode='42501';
          end if;
        end $$;
    `);
    await db.exec(readFileSync(sqlFile, 'utf8'));
    await db.exec(readFileSync('proposals/staging/20261116030000_item_movement_source_and_manage_imports.sql', 'utf8'));
    await db.exec(readFileSync('proposals/staging/20261116040000_transfer_import_upload_date.sql', 'utf8'));
    await db.exec(readFileSync('proposals/staging/20261116050000_latest_transfer_import.sql', 'utf8'));
}

test('batched warehouse source normalizes codes and retains tenant and admin scope', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await initializeDatabase(db);
    await db.exec(`
        create table public.pharmflow_order_source_items (
            pharmacy_id uuid, order_number text, line_no int, id int,
            item_code text,item_name text,ordered_qty numeric
        );
        create function pharmflow_auth_private.require_receiving_compat(uuid,text,boolean,text)
        returns void language sql as $$ select pharmflow_auth_private.require_access($1,$2,$3,$4) $$;
        create function public.is_pharmacy_admin(uuid) returns boolean language sql as $$
            select coalesce(current_setting('test.admin',true),'yes')='yes'
        $$;
        insert into public.pharmflow_order_source_items values
            ('${scope}','TO-1',1,1,'001017808.0','Fixture item',2),
            ('${scope}',' to -1 ',2,2,'1017808','Alternate name',3),
            ('${scope}','TO-2',1,3,'200','Something else',1),
            ('${outside}','TO-1',1,4,'1017808','Outside pharmacy',5000);
    `);
    await db.exec(readFileSync('proposals/staging/20261116110000_batch_legacy_movement_items.sql','utf8'));
    await db.exec('set role authenticated');
    const search = (item,pharmacy = scope) => db.query(
        "select * from public.get_pharmflow_movement_source_batch_v1($1,array['TO-1','TO-2','TO-3'],$2) order by order_number",
        [pharmacy,item]);
    const {rows} = await search('1017808');
    assert.deepEqual(rows.map(row=>row.has_source),[true,true,false]);
    assert.deepEqual(rows[0].items,[{item_code:'1017808',item_name:'Fixture item',ordered_qty:5}]);
    assert.deepEqual(rows[1].items,[]);
    assert.deepEqual((await search('fixture item')).rows[0].items,rows[0].items);
    await assert.rejects(search('1017808',outside),/permission denied/);
    await db.exec("set test.admin='no'");
    assert.equal((await search('1017808')).rows.length,0);
    await db.exec("reset role; set role anon");
    await assert.rejects(search('1017808'),/permission denied/);
});

test('real source layout, pharmacy identity and flexible transfer dates', () => {
    const rows = [
        ['Bulk-TO Receive'], ['User ID', 'benchmark'], ['TO Number', 'TO-001'], ['From Warehouse', 'TEST-A'],
        ['To Warehouse', 'TEST-B'], ['Receiveing Date', '9/3/2026'],
        ['Item Number', 'Item Name', 'Category', 'Price', 'Size', 'Color', 'Quantity'], ['0012', 'Synthetic name', '', '', '', '', '100.0']
    ];
    function receiveDate(receivingDate, pharmacy = 'BENCHMARK') {
        rows[5][1] = receivingDate;
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows.map(row => [null,...row])), 'Sheet1');
        const data = xlsx.write(wb, {type: 'array', bookType: 'xlsx'});
        return parser.parseTransfer(data, {name: 'fixture.xlsx', size: data.byteLength}, xlsx, validation, pharmacy);
    }
    assert.throws(() => receiveDate('9/3/2026', 'OTHER'), /User ID/);
    const result = receiveDate('9/3/2026');
    assert.equal(result.date, '2026-09-03');
    assert.equal(receiveDate('22/9/2026').date, '2026-09-22');
    assert.equal(receiveDate('9/22/2026').date, '2026-09-22');
    assert.equal(receiveDate('2026-09-03').date, '2026-09-03');
    assert.equal(receiveDate(vm.runInContext('new Date(2026, 8, 3)', context)).date, '2026-09-03');
    assert.throws(() => receiveDate('2/30/2026'), /Invalid receiving date/);
    assert.throws(() => receiveDate('27/13/2026'), /Invalid receiving date/);
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
    await initializeDatabase(db);
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

test('roll-forward 50 to 60, source and date filter, atomic selected deletion and reimport', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await initializeDatabase(db);
    const archive = {orderFiles: [
        {documentId:'TO-WAREHOUSE',orderDate:'2025-02-03'},
        {documentId:'TO-BAD',orderDate:'2026-02-31'}
    ]};
    await db.query("insert into archive_fixture values ($1,'test',array['TO-WAREHOUSE','TO-BAD'],'2026-11-16',$2)",
        [scope,JSON.stringify(archive)]);
    await db.exec('set role authenticated');
    const listArchives = (from,to,order = '') => db.query(
        'select order_numbers from public.list_pharmflow_movement_archives_v1($1,$2,$3,$4)',[scope,from,to,order]);
    assert.equal((await listArchives('2026-01-01','2026-12-31')).rows.length,0);
    assert.deepEqual((await listArchives('2025-01-01','2026-12-31','TO-WAREHOUSE')).rows[0].order_numbers,['TO-WAREHOUSE']);
    const imports = Array.from({length:60}, (_,i) => ({number:'TO-' + (100+i),
        source:i % 2 ? 'SOURCE-2' : 'SOURCE-1',destination:'BENCHMARK',user_id:'BENCHMARK',date:'2026-11-16',
        items:[{code:'101',name:'Example Item',quantity:20}]}));
    const save = async records => {
        const outcomes = [];
        for (let i=0; i<records.length; i+=25) {
            const result = await db.query('select * from public.import_pharmflow_transfer_history_v1($1,$2::jsonb)',
                [scope,JSON.stringify(records.slice(i,i+25))]);
            outcomes.push(...result.rows.map(r=>r.outcome));
        }
        return outcomes;
    };
    const latest = async (pharmacy = scope) => (await db.query(
        'select * from public.get_pharmflow_latest_transfer_import_v1($1)',[pharmacy])).rows[0];
    assert.equal(await latest(),undefined);
    assert.deepEqual(await save(imports.slice(0,50)),Array(50).fill('imported'));
    assert.deepEqual(await save(imports),[...Array(50).fill('duplicate'),...Array(10).fill('imported')]);
    const latestBatch = await latest();
    assert.equal(latestBatch.number,'TO-150');
    assert.equal(latestBatch.batch_size,10);
    assert.equal(latestBatch.received_date.toISOString().slice(0,10),'2026-11-16');
    assert.deepEqual(await save(imports),Array(60).fill('duplicate'));
    assert.deepEqual(await latest(),latestBatch);
    await assert.rejects(latest(outside),/permission denied/);

    assert.deepEqual(await save([{...imports[1],date:'2026-11-15'}]),['conflict']);
    const search = (item,source,order = '',pharmacy = scope) => db.query(
        "select * from public.search_pharmflow_transfer_history_v2($1,$2,$3,$4,'2026-11-01','2026-11-30')",
        [pharmacy,item,source,order]);
    const found = await search('','Example Pharmacy');
    assert.equal(found.rows.length,30);
    assert.equal(found.rows.reduce((n,row) => n+Number(row.quantity),0),600);
    assert.equal((await search('101','source-2','TO-101')).rows.length,1);
    assert.equal((await search('999','source-2')).rows.length,0);
    assert.equal((await search('','Benchmark')).rows.length,0);
    await assert.rejects(search('','SOURCE-2','',outside),/permission denied/);
    const list = (order = '',from = null,to = null,pharmacy = scope) => db.query(
        'select * from public.list_pharmflow_transfer_imports_v1($1,$2,$3,$4)',[pharmacy,order,from,to]);
    const selection = (await list('TO-101')).rows;
    assert.equal(selection.length,1);
    const deleteImports = (rows,pharmacy = scope) => db.query(
        'select public.delete_pharmflow_transfer_imports_v1($1,$2) as deleted',[pharmacy,JSON.stringify(rows)]);
    await assert.rejects(list('TO-101',null,null,outside),/permission denied/);
    await assert.rejects(deleteImports(selection,outside),/permission denied/);
    await db.exec("set test.read_only='yes'");
    await assert.rejects(list('TO-101'),/permission denied/);
    await assert.rejects(deleteImports(selection),/permission denied/);
    await db.exec("set test.read_only='no'");
    await assert.rejects(deleteImports([...selection,{...selection[0],number:'TO-MISSING'}]),/changed since selection/);
    assert.equal((await list('TO-101')).rows.length,1);
    assert.equal((await deleteImports(selection)).rows[0].deleted,1);
    assert.equal((await search('101','SOURCE-2','TO-101')).rows.length,0);
    assert.equal((await list('','2026-11-16','2026-11-16')).rows.length,59);
    assert.equal((await listArchives('2025-01-01','2026-12-31')).rows.length,1);
    assert.deepEqual(await save([imports[1]]),['imported']);
    await assert.rejects(deleteImports(selection),/changed since selection/);
    assert.equal((await search('101','SOURCE-2','TO-101')).rows.length,1);

    // The Riyadh day starts at 21:00 UTC on the previous date.
    await db.exec("reset role");
    await db.query(`update pharmflow_transfer_private.documents
        set imported_at = case number
            when 'TO-100' then '2026-11-14 20:59:59+00'::timestamptz
            when 'TO-101' then '2026-11-14 21:00:00+00'::timestamptz
            when 'TO-102' then '2026-11-15 20:59:59+00'::timestamptz
            else '2026-11-15 21:00:00+00'::timestamptz end
        where pharmacy_id = $1`, [scope]);
    await db.exec("set role authenticated");
    const byUpload = (order = '',from = null,to = null,pharmacy = scope) => db.query(
        'select * from public.list_pharmflow_transfer_imports_v2($1,$2,$3,$4)',[pharmacy,order,from,to]);
    const uploadRows = (await byUpload('','2026-11-15','2026-11-15')).rows;
    assert.deepEqual(uploadRows.map(row => row.number), ['TO-102','TO-101']);
    assert.equal(uploadRows[0].received_date.toISOString().slice(0,10),'2026-11-16');
    assert.equal((await byUpload('TO-100')).rows.length,1);
    assert.equal((await byUpload('TO-100','2026-11-15','2026-11-15')).rows.length,0);
    await assert.rejects(byUpload('TO-100',null,null,outside),/permission denied/);
    await db.exec("set test.read_only='yes'");
    await assert.rejects(byUpload('TO-100'),/permission denied/);
    await assert.rejects(latest(),/permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(latest(),/permission denied/);
});
