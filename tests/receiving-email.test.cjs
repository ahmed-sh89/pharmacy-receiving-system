const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');

function harness(options = {}) {
    const writes = [], plain = [];
    const {document, Event} = parseHTML('<html><body></body></html>');
    const c = {
        document, window: {}, setTimeout() {}, Blob, URLSearchParams, showToast() {},
        navigator: {clipboard: {
            write: async items => {
                if (options.reject) throw Error('Unsupported');
                writes.push(items);
            },
            writeText: async text => plain.push(text)
        }},
        ClipboardItem: class { constructor(data) { this.data = data; } }
    };
    if (options.textOnly) delete c.ClipboardItem;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('js/orders.js', 'utf8'), c);
    return {c, writes, plain, document, Event};
}

const row = (code, ordered, received, issue) => ({
    'Item Number': code,
    'Item Name': 'Very long product name <test> & عناية',
    'Ordered Qty': ordered,
    'Received Qty': received,
    'Difference': received - ordered,
    'Issue Type': issue
});
const group = (orderNumber, rows, orderDate = '2026-11-01') => ({orderNumber, orderDate, rows});
const fixture = () => ({
    orderGroups: [
        group('TO-001', [row('001', 100, 31), row('002', 10, 0), row('003', 7, 8), row('004', 5, 5)]),
        group('TO-002', [row('001', 34, 31)], '2026-11-02')
    ],
    orders: [{orderNumber: 'UNRELATED'}],
    rows: [row('FLAT-MUST-NOT-COUNT', 1, 0)]
});
const details = document => document.querySelector('th[scope=col]').closest('table');
const values = nodes => [...nodes].map(node => node.textContent);

test('subject lists up to three unique TO numbers, with a fallback for orderless extras', () => {
    const {c} = harness();
    const orders = ['TO-001', 'TO-001', 'TO-002', 'TO-003', 'TO-004']
        .map(number => group(number, [row('001', 10, 9)]));
    const subject = count => c.buildReceivingDiscrepancyEmailSubject({orderGroups: orders.slice(0, count)});
    assert.equal(subject(2), 'TO-001');
    assert.equal(subject(3), 'TO-001 + TO-002');
    assert.equal(subject(4), 'TO-001 + TO-002 + TO-003');
    assert.equal(subject(5), 'TO-001 + TO-002 + TO-003 + More');
    assert.equal(c.buildReceivingDiscrepancyEmailSubject({
        orderGroups: [{unassigned: true, rows: [row('E1', 0, 1, 'Extra Item')]}]
    }), 'Extra Items');
});

test('one table preserves quantities, sign colors and distinct rows for repeat codes across orders', () => {
    const {c} = harness(), report = fixture(), before = JSON.stringify(report);
    const html = c.buildFinalizedDiscrepancyEmailHTML(report);
    const {document} = parseHTML(html);
    assert.equal(document.querySelectorAll('th[scope=col]')[6].closest('table'), details(document));
    const table = details(document);
    assert.equal(table.querySelectorAll('table').length, 0);
    assert.equal(table.getAttribute('width'), '100%');
    for (const group of table.querySelectorAll('tbody')) {
        assert.equal(group.children[0].children[0].getAttribute('colspan'), '6');
        assert.deepEqual(values(group.children[1].children), ['Code', 'Item Name', 'Ordered', 'Received', 'Diff', 'Status']);
        assert.equal(group.children[2].children[0].tagName, 'TD');
        for (const heading of group.children[1].children) {
            assert.match(heading.getAttribute('style'), /border:1px solid/);
        }
    }
    assert.deepEqual(values(table.querySelectorAll('td[colspan="6"]')), ['TO-001 | 1 Nov 2026', 'TO-002 | 2 Nov 2026']);
    const itemRows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.children.length === 6 && tr.children[0].tagName === 'TD');
    assert.deepEqual(itemRows.map(tr => values(tr.children).slice(2)), [
        ['100', '31', '-69', 'ناقص'], ['10', '0', '-10', 'ناقص'],
        ['7', '8', '+1', 'زيادة'], ['34', '31', '-3', 'ناقص']
    ]);
    for (const tr of itemRows) {
        const isShort = tr.children[4].textContent.startsWith('-');
        assert.equal(tr.children[4].getAttribute('bgcolor'), isShort ? '#f7c3c3' : '#bde8d7');
        for (const cell of [tr.children[4], tr.children[5]]) {
            assert.equal(cell.querySelector('font').getAttribute('color'), isShort ? '#a72f2f' : '#16634b');
        }
    }
    assert.doesNotMatch(html, /FLAT-MUST-NOT-COUNT|ملخص الطلبيات|Partial Shortage|<script|<style|display:flex|display:grid/);
    assert.match(html, /&lt;test&gt; &amp;/);
    assert.equal(JSON.stringify(report), before);
});

test('Arabic intro and closing use centered 14px Arial without punctuation', () => {
    const {c} = harness();
    const {document} = parseHTML(c.buildFinalizedDiscrepancyEmailHTML(fixture()));
    const messages = [...document.querySelectorAll('td[dir="rtl"]')];
    assert.equal(messages.length, 2);
    assert.equal(messages[0].querySelector('b').innerHTML, 'السلام عليكم<br>يوجد فرق توريد موضح أدناه');
    assert.equal(messages[1].textContent, 'الرجاء المراجعة والإفادة');
    for (const font of document.querySelectorAll('font')) assert.match(font.getAttribute('style'), /font-size:14px/);
    for (const message of messages) {
        assert.equal(message.getAttribute('align'), 'center');
        assert.equal(message.querySelector('font').getAttribute('face'), 'Arial, Helvetica, sans-serif');
    }
});

test('manual Work Orders group the items in preview, rich clipboard and plain fallback', async () => {
    const {c, document, Event, writes} = harness();
    const report = fixture(), before = JSON.stringify(report);
    c.openFinalizedDiscrepancyEmailPreview(report, {liveReport: true});
    const frame = document.querySelector('iframe');
    assert.equal(frame.getAttribute('sandbox'), '');
    const defaultInput = document.querySelector('[data-work-order-default]');
    assert.equal(document.querySelector('h2').textContent, 'TO-001 + TO-002');
    assert.equal(defaultInput.getAttribute('inputmode'), 'numeric');
    assert.equal(defaultInput.previousElementSibling.textContent, 'WO-');
    defaultInput.value = 'WO-0001';
    defaultInput.dispatchEvent(new Event('input', {bubbles: true}));
    assert.equal(defaultInput.value, '0001');
    assert.match(frame.srcdoc, /TO-001 \| WO-0001/);
    const toggle = document.querySelector('[data-wo-toggle]');
    const overrides = document.getElementById(toggle.getAttribute('aria-controls'));
    assert.equal(overrides.hidden, true);
    toggle.click();
    assert.equal(overrides.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const itemInput = overrides.querySelectorAll('[data-work-order-row]')[2];
    itemInput.value = '0002';
    itemInput.dispatchEvent(new Event('input', {bubbles: true}));
    const html = frame.srcdoc;
    const groups = details(parseHTML(html).document).querySelectorAll('tbody');
    assert.deepEqual([...groups].map(tbody => [tbody.querySelector('[colspan]').textContent, tbody.children.length - 1]), [
        ['TO-001 | WO-0001 | 1 Nov 2026', 3],
        ['TO-001 | WO-0002 | 1 Nov 2026', 2],
        ['TO-002 | 2 Nov 2026', 2]
    ]);
    document.querySelector('#btnCopyFinalizedEmail').click();
    const data = writes[0][0].data;
    assert.equal(await data['text/html'].text(), html);
    let openedUrl;
    c.window.open = url => { openedUrl = url; };
    document.querySelector('#btnOpenFinalizedOutlook').click();
    assert.equal(new URL(openedUrl).searchParams.get('subject'), 'TO-001 + TO-002');
    const text = await data['text/plain'].text();
    assert.match(text, /TO-001 \| WO-0002 \| 1 Nov 2026\r\nCode \| Item Name/);
    assert.match(text, /\+1 \| زيادة/);
    assert.match(text, /-69 \| ناقص/);
    assert.equal(JSON.stringify(report), before);
    c.openFinalizedDiscrepancyEmailPreview(report);
    assert.equal(document.querySelector('[data-work-order-default]').value, '');
});

test('a legacy flat report and dated orderless extras retain their correct grouping', () => {
    const {c} = harness();
    const report = {
        orderGroups: [
            group('TO-001', [row('001', 2, 1)]),
            {unassigned: true, rows: [
                {...row('E2', 0, 3, 'Extra Item'), 'Received Date': '2026-11-11'},
                {...row('E1', 0, 1, 'Extra Item'), 'Received Date': '2026-11-10'},
                {...row('E3', 0, 2, 'Extra Item'), 'Received Date': '2026-11-10'}
            ]}
        ]
    };
    const {document} = parseHTML(c.buildFinalizedDiscrepancyEmailHTML(report));
    assert.deepEqual(values(details(document).querySelectorAll('td[colspan="6"]')), [
        'TO-001 | 1 Nov 2026', 'Extra Items | 10 Nov 2026', 'Extra Items | 11 Nov 2026'
    ]);
    assert.equal(details(document).querySelectorAll('tbody')[1].children.length, 4);
    assert.match(c.buildFinalizedDiscrepancyEmailText(report), /E2 .*\| 0 \| 3 \| \+3 \| زيادة/);
    assert.match(c.buildFinalizedDiscrepancyEmailHTML({orderId: 'LEGACY', rows: [row('A', 2, 1)]}), /LEGACY/);
    assert.doesNotMatch(c.buildFinalizedDiscrepancyEmailHTML({}), /<th scope=/);
});

test('unsupported rich clipboard writes provide the same plain email and explicit fallback', async () => {
    for (const options of [{textOnly: true}, {reject: true}]) {
        const {c, plain} = harness(options);
        const report = fixture(), workOrders = vm.runInContext('new Map([["0:0","001"]])', c);
        assert.equal(await c.copyFormattedReceivingEmail(report, workOrders), false);
        assert.equal(plain[0], c.buildFinalizedDiscrepancyEmailText(report, workOrders));
        assert.match(plain[0], /WO-001/);
        assert.doesNotMatch(plain[0], /<table/);
    }
});
