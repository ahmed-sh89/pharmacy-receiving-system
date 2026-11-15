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
    const [result, empty] = await context.pfhReadItemHistory(params, [period,
        {from: '2026-11-02', to: '2026-11-02'}], '', 'panad', () => true);
    assert.deepEqual(Array.from(result.rows, row => row.received_qty), [0, null]);
    assert.equal(result.rows[1].ordered_qty, 5);
    assert.equal(empty.rows.length, 0);
    assert.match(context.pfhItemSummary(result).join('. '), /Confirmed received total: 0.*1 matching rows/);
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

test('existing discrepancy and NEW reports remain order and Riyadh-date scoped', async () => {
    const calls = [];
    const context = runtime({authRpc: async (name, args) => {
        calls.push([name, args]);
        if (name.startsWith('list_pharmflow_receiving')) return [
            {workspace_history_id: 'yes', completed_at: '2026-10-31T21:01:00Z', discrepancy_count: 1, order_numbers: ['TO-1', 'TO-2']},
            {workspace_history_id: 'no', completed_at: '2026-11-01T21:01:00Z', discrepancy_count: 1, order_numbers: ['TO-1']}
        ];
        if (name.startsWith('get_')) return [{order_number: 'TO-1'}, {order_number: 'TO-2'}];
        return [
            {order_number: 'TO-1', completed_at: '2026-10-31T20:59:59Z'},
            {order_number: 'TO-1', completed_at: '2026-10-31T21:00:00Z'},
            {order_number: 'TO-2', completed_at: '2026-11-01T19:00:00Z'}
        ];
    }});
    assert.equal((await context.pfhReadExistingHistory('discrepancy', params, period, 'TO-1', () => true)).length, 1);
    assert.equal((await context.pfhReadExistingHistory('new', params, period, 'TO-1', () => true)).length, 1);
    assert.equal(calls[0][1].p_from, '2026-10-31');
    assert.equal(calls[1][1].p_workspace_history_id, 'yes');
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
        ['from', 'to', 'from2', 'to2']);
    assert.doesNotMatch(section, /type="date"/);
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
