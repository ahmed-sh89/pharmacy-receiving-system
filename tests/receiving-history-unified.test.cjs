const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function runtime(options = {}) {
    const context = vm.createContext({window: {}, document: {
        readyState: 'loading', addEventListener() {}
    }, ...options});
    vm.runInContext(readFileSync('js/receiving-history.js', 'utf8'), context);
    return context;
}

const params = {p_pharmacy_id: 'staging-pharmacy'};
const period = {from: '2026-11-01', to: '2026-11-01'};

test('single and bulk completion use independent order snapshots from the shared quantity projection', () => {
    const ledger = new Map([['TO-1', 0], ['TO-2', 7]]);
    const context = runtime({
        buildReceivedQuantityByOrder: () => ledger,
        getPerOrderReceivingRows: (order, options) => {
            assert.equal(options.receivedMap, ledger);
            return [{'Item Number': '101', 'Item Name': 'Test', 'Ordered Qty': 7, 'Received Qty': ledger.get(order)}];
        }
    });
    const snapshots = context.buildPharmFlowItemHistorySnapshots(['to-1', 'to-2']);
    assert.equal(snapshots.get('TO-1')[0].received_qty, 0);
    assert.equal(snapshots.get('TO-2')[0].received_qty, 7);
    const orders = readFileSync('js/orders.js', 'utf8');
    assert.match(orders, /closeAndArchiveAllCurrentOrders\(summary.orderNumbers,itemHistory\)/);
    assert.match(orders, /closeAndArchiveCurrentOrder\(orderNumber,itemHistory.get\(orderNumber\)\)/);
    const session = readFileSync('js/session.js', 'utf8');
    assert.match(session, /itemReceivingHistory:itemHistory\?\.get\(targetOrder\)/);
    assert.match(session, /itemReceivingHistory:itemHistory,/);
});

test('item search uses verified zero, uploaded-only unknown and de-duplicates order archives', async () => {
    const calls = [];
    const archive = (number, snapshot) => ({
        order_numbers: [number], closed_at: '2026-10-31T21:10:00Z',
        archive_payload: {orderNumber: number, itemReceivingHistory: snapshot}
    });
    const context = runtime({authRpc: async (name, args, query) => {
        calls.push([name, args, query]);
        assert.equal(args.p_pharmacy_id, params.p_pharmacy_id);
        if (name === 'list_pharmflow_finalized_archives') return [
            archive('TO-1', [{item_code: '101', item_name: 'Panadol', ordered_qty: 7, received_qty: 0}]),
            archive('TO-1', [{item_code: '101', item_name: 'Panadol', ordered_qty: 7, received_qty: 7}]),
            archive('TO-2')
        ];
        assert.equal(args.p_order_number, 'TO-2');
        return [{item_code: '101', item_name: 'Panadol', ordered_qty: 3},
            {item_code: '101', item_name: 'Panadol', ordered_qty: 2}];
    }});
    const result = await context.pfhReadItemHistory(params, period, '', 'panad', () => true);
    assert.deepEqual(Array.from(result.rows, row => row.received_qty), [0, null]);
    assert.equal(result.rows[1].ordered_qty, 5);
    assert.deepEqual(JSON.parse(JSON.stringify(context.pfhItemTotals(result.rows))), [['101', 'Panadol', 12, 0]]);
    assert.match(context.pfhItemNotes(result).join('. '), /1 matching rows lack a confirmed received quantity/);
    assert.equal(calls.length, 2);
    assert.match(JSON.stringify(calls[0][2]), /2026-11-01T00:00:00\+03:00/);
});

test('older grouped archives only apply the matching order discrepancy', () => {
    const context = runtime();
    const row = {'Item Number': '101', 'Item Name': 'Test', 'Ordered Qty': 8, 'Received Qty': 6};
    const report = {discrepancyReport: {orderGroups: [
        {orderNumber: 'TO-1', rows: [row]},
        {orderNumber: 'TO-2', rows: [{...row, 'Received Qty': 2}]}
    ]}};
    assert.equal(context.pfhLegacyItemRows(report, 'TO-1', [])[0].received_qty, 6);
    assert.equal(context.pfhLegacyItemRows(report, 'TO-2', [])[0].received_qty, 2);
    assert.equal(context.pfhLegacyItemRows(report, 'TO-3', []).length, 0);
});

test('Discrepancies and NEW items use one joined request per page with dates, order and stable paging', async () => {
    const calls = [];
    const context = runtime({readPharmFlowReceivingHistoryRows: async (pharmacy, query) => {
        calls.push([pharmacy, query]);
        return Array.from({length: calls.length === 1 ? 101 : 2}, () =>
            ({order_number: 'TO-1', workspace: {completed_at: '2026-10-31T21:00:00Z'}}));
    }});
    const first = await context.pfhReadHistoryPage('discrepancy', params.p_pharmacy_id, period, 'TO-1');
    assert.equal(calls.length, 1);
    assert.equal(first.rows.length, 100);
    assert.equal(first.nextOffset, 100);
    assert.equal(first.rows[0].completed_at, '2026-10-31T21:00:00Z');
    const filters = new URLSearchParams(calls[0][1]);
    assert.equal(filters.get('event_type'), 'eq.DISCREPANCY');
    assert.equal(filters.get('order_number'), 'eq.TO-1');
    assert.equal(filters.get('order'), 'workspace(completed_at).desc,id.desc');
    assert.deepEqual(filters.getAll('workspace.completed_at'),
        ['gte.2026-11-01T00:00:00+03:00', 'lt.2026-11-02T00:00:00+03:00']);
    const next = await context.pfhReadHistoryPage('discrepancy', params.p_pharmacy_id, period, 'TO-1', first.nextOffset);
    assert.equal(next.rows.length, 2);
    assert.equal(next.nextOffset, null);
    assert.equal(new URLSearchParams(calls[1][1]).get('offset'), '100');
    await context.pfhReadHistoryPage('new', params.p_pharmacy_id, period, '');
    assert.equal(new URLSearchParams(calls[2][1]).get('event_type'), 'eq.NEW_ITEM');
});

test('RPC pagination reaches the network and scoped history reads require the active pharmacy', async () => {
    const source = readFileSync('js/auth.js', 'utf8');
    const requests = [];
    const checks = [];
    const context = {
        URLSearchParams, AuthState: {context: {pharmacy_id: 'p1'}},
        window: {PharmFlowPermissions: {require: (...value) => checks.push(value)}},
        authRequest: (path, options) => requests.push({path, options}),
        getSupabaseAccessToken: () => 'test', getSupabasePublishableKey: () => 'publishable'
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('async function publicRpc'), source.indexOf('// SEC-007 also rejects')) +
        source.slice(source.indexOf('async function authRpc'), source.indexOf('async function loadPublicSetupStatus')), context);
    await context.publicRpc('get_public_setup_status');
    await context.authRpc('list_pharmflow_finalized_archives', {p_pharmacy_id: 'p1'}, [['limit', 250], ['offset', 250]]);
    await context.readPharmFlowReceivingHistoryRows('p1', [['pharmacy_id', 'eq.other'], ['workspace.pharmacy_id', 'eq.other']]);
    assert.equal(requests[0].path, '/rest/v1/rpc/get_public_setup_status');
    assert.equal(requests[1].path, '/rest/v1/rpc/list_pharmflow_finalized_archives?limit=250&offset=250');
    assert.equal(requests[2].path, '/rest/v1/pharmflow_receiving_history_items_v1?pharmacy_id=eq.p1&workspace.pharmacy_id=eq.p1');
    assert.deepEqual(checks[0], ['RECEIVING', false]);
    assert.throws(() => context.readPharmFlowReceivingHistoryRows('other', []), /Pharmacy context/);
    assert.equal(requests.length, 3);
});

test('items selected from separate searches keep ordered totals per code and export the same summary', () => {
    const context = runtime({TextEncoder, TextDecoder, Uint8Array, ArrayBuffer});
    vm.runInContext(readFileSync('js/vendor/sheetjs-0.20.3/xlsx.full.min.js', 'utf8'), context);
    const rows = [
        {item_code: '101', item_name: 'Klavox 1G', ordered_qty: 318, received_qty: 0},
        {item_code: '101', item_name: 'Klavox 1G', ordered_qty: '4', received_qty: null},
        {item_code: '102', item_name: 'Klavox 375', ordered_qty: 4, received_qty: null}
    ];
    const firstSearch = {...period, order: '', rows: rows.slice(0, 2)};
    const secondSearch = {...period, order: '', rows: rows.slice(2)};
    const selection = context.pfhAddToExportList(null, firstSearch, '101');
    assert.equal(context.pfhAddToExportList(selection, firstSearch, '101').items.size, 1);
    assert.equal(context.pfhAddToExportList(selection, secondSearch, 'unknown').items.size, 1);
    assert.equal(context.pfhAddToExportList(selection, {...secondSearch, to: '2026-11-02'}, '102').items.size, 1);
    assert.equal(context.pfhAddToExportList(selection, secondSearch, '102').items.size, 2);
    const result = {type: 'item', periods: [context.pfhExportListPeriod(selection)]};
    assert.deepEqual(JSON.parse(JSON.stringify(context.pfhItemTotals(rows))),
        [['101', 'Klavox 1G', 322, 0], ['102', 'Klavox 375', 4, 'Not available']]);
    assert.match(context.pfhRenderResult(result), /Total Ordered/);
    assert.doesNotMatch(context.pfhRenderResult(result), /No matching rows/);
    const tables = context.pfhExportTables(result.type, result.periods[0]);
    const bytes = context.pfhWorkbook(tables, 'PharmFlow | Item Receiving History', '2026-11-01 | Riyadh');
    const {XLSX} = context;
    const workbook = XLSX.read(bytes, {type: 'array'});
    assert.deepEqual(Array.from(workbook.SheetNames), ['Summary', 'Order Details']);
    assert.equal(workbook.Sheets.Summary.C6.v, 322);
    assert.equal(workbook.Sheets.Summary.C7.t, 'n');
    assert.equal(workbook.Sheets.Summary.C7.v, 4);
    assert.equal(workbook.Sheets['Order Details'].E5.v, 'Klavox 1G');
    const archive = XLSX.CFB.read(bytes, {type: 'buffer'});
    const part = path => new TextDecoder().decode(archive.FileIndex[
        archive.FullPaths.findIndex(name => name.endsWith(path))].content);
    assert.match(part('/sheet1.xml'), /<pane ySplit="5"[^>]*state="frozen"/);
    assert.match(part('/sheet1.xml'), /<autoFilter ref="A5:D7"/);
    assert.match(part('/sheet2.xml'), /<pane ySplit="4"[^>]*state="frozen"/);
    assert.match(part('/styles.xml'), /FF174A79/);
    assert.match(part('/styles.xml'), /FFF0F6FC/);
});

test('list admits distinct items across order filters and the PDF plan contains totals only', () => {
    const context = runtime();
    const first = {...period, order: 'TO-1', rows: [
        {item_code: '101', item_name: 'Item one', ordered_qty: 5, received_qty: 5}
    ]};
    const next = {...period, order: '', rows: [
        {item_code: '102', item_name: 'Item two', ordered_qty: 9, received_qty: 0},
        {item_code: '102', item_name: 'Item two', ordered_qty: 3, received_qty: null}
    ]};
    const list = context.pfhAddToExportList(null, first, '101');
    context.pfhAddToExportList(list, next, '102');
    assert.equal(list.items.size, 2);
    assert.equal(context.pfhAddToExportList(list, {...next, to: '2026-11-02'}, '103').items.size, 2);
    const report = context.pfhExportListPeriod(list);
    const summaryOnly = context.pfhExportTables('item', report, true);
    assert.equal(summaryOnly.length, 1);
    assert.equal(summaryOnly[0].name, 'Summary');
    assert.deepEqual(JSON.parse(JSON.stringify(summaryOnly[0].rows)), [
        ['101', 'Item one', 5, 5, 'TO-1'],
        ['102', 'Item two', 12, 0, 'All orders']
    ]);
    assert.equal(context.pfhExportTables('item', report)[1].rows.length, 3);
});

test('query pagination stops fetching as soon as the account or report changes', async () => {
    let active = true;
    let calls = 0;
    const context = runtime({authRpc: async () => {
        calls++;
        active = false;
        return Array.from({length: 250}, () => ({}));
    }});
    await context.pfhReadRows('report', params, [], () => active);
    assert.equal(calls, 1);
});

test('the report picker defaults to Item Receiving History and retains both existing report options', () => {
    const html = readFileSync('index.html', 'utf8');
    const section = html.slice(html.indexOf('id="receivingHistoryContent"'), html.indexOf('id="page-files"'));
    assert.deepEqual([...section.matchAll(/data-pfh-type="([^"]+)"/g)].map(match => match[1]),
        ['item', 'new', 'discrepancy']);
    assert.match(section, /name="reportType" value="item"/);
    assert.deepEqual([...section.matchAll(/data-pfh-date="([^"]+)"/g)].map(match => match[1]),
        ['from', 'to']);
    assert.doesNotMatch(section, /type="date"|<textarea/);
    assert.match(section, /id="pfhItemEntry"[\s\S]*?name="item" type="search"[^>]*>[\s\S]*?<button[^>]*type="submit">Search<\/button>/);
});

test('the restored calendar handles month days, selected dates and the Today shortcut', () => {
    const context = runtime();
    const popover = {};
    context.pfhRenderCalendar(popover, new Date('2028-02-01T00:00:00Z'), '2028-02-29', '2028-03-01');
    assert.match(popover.innerHTML, /February 2028/);
    assert.match(popover.innerHTML, /data-month="-1" aria-label="Previous month"/);
    assert.match(popover.innerHTML, /data-month="1" aria-label="Next month"/);
    assert.match(popover.innerHTML, /class="pfhCalDay selected" data-date="2028-02-29"/);
    assert.equal((popover.innerHTML.match(/class="pfhCalDay/g) || []).length, 29);
    assert.match(popover.innerHTML, /data-date="2028-03-01">Today/);
});

test('report and date pickers use the top layer and open where the viewport has room', () => {
    const html = readFileSync('index.html', 'utf8');
    assert.match(html, /id="pfhTypeOptions"[^>]*popover="manual"/);
    const document = {readyState: 'loading', addEventListener() {},
        documentElement: {clientHeight: 640, clientWidth: 820}};
    const context = runtime({document});
    const picker = {offsetWidth: 296, style: {}, getBoundingClientRect: () => ({width: 222, height: 208})};
    const anchor = {getBoundingClientRect: () => ({left: 750, top: 520, bottom: 550, width: 70})};
    context.pfhPositionPicker(picker, anchor);
    assert.equal(picker.style.left, (820 - 222 - 8) / .75 + 'px');
    assert.equal(picker.style.top, (520 - 6 - 208) / .75 + 'px');
    anchor.getBoundingClientRect = () => ({left: 200, top: 180, bottom: 210, width: 180});
    context.pfhPositionPicker(picker, anchor, true);
    assert.equal(picker.style.top, (210 + 6) / .75 + 'px');
    assert.equal(picker.style.width, 180 / .75 + 'px');
});
