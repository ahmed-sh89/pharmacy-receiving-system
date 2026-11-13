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
const detailTables = document => [...document.querySelectorAll('th[scope=col]:first-child')].map(th => th.closest('table'));
const values = nodes => [...nodes].map(node => node.textContent);
function assertTypography(container, size, bold) {
    const font = container.querySelector('font');
    assert.match(font.getAttribute('style'), new RegExp(`font-size:${size}pt;mso-bidi-font-size:${size}pt;`));
    assert.match(font.getAttribute('style'), new RegExp(`font-weight:${bold ? 700 : 400};`));
    assert.equal(Boolean(font.querySelector('b')), bold);
}

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

test('one table per TO preserves quantities, sign colors and distinct rows across orders', () => {
    const {c} = harness(), report = fixture(), before = JSON.stringify(report);
    const html = c.buildFinalizedDiscrepancyEmailHTML(report);
    const {document} = parseHTML(html);
    const tables = detailTables(document);
    assert.equal(tables.length, 2);
    for (const table of tables) {
        assert.equal(table.querySelectorAll('table').length, 0);
        assert.equal(table.getAttribute('width'), '100%');
        const group = table.querySelector('tbody');
        const header = group.children[0].children[0];
        assert.equal(header.getAttribute('colspan'), '6');
        assert.equal(header.getAttribute('dir'), 'ltr');
        assertTypography(header, 12, true);
        const date = header.querySelectorAll('font')[1];
        assert.match(date.getAttribute('style'), /font-size:12pt;.*font-weight:400/);
        assert.equal(date.querySelector('b'), null);
        assert.deepEqual(values(group.children[1].children), ['Code', 'Item Name', 'Ordered', 'Received', 'Diff', 'Status']);
        assert.equal(group.children[2].children[0].tagName, 'TD');
        for (const heading of group.children[1].children) {
            assert.match(heading.getAttribute('style'), /border:1px solid/);
            assertTypography(heading, 10, true);
        }
    }
    assert.deepEqual(values(document.querySelectorAll('td[colspan="6"]')).map(value => value.replace(/\s+/g, ' ')), [
        'TO-001 | 1 Nov 2026', 'TO-002 | 2 Nov 2026'
    ]);
    const itemRows = tables.flatMap(table => [...table.querySelectorAll('tbody > tr')].slice(2));
    assert.deepEqual(itemRows.map(tr => values(tr.children).slice(2)), [
        ['100', '31', '-69', 'ناقص 69'], ['10', '0', '-10', 'ناقص 10'],
        ['7', '8', '+1', 'زيادة 1'], ['34', '31', '-3', 'ناقص 3']
    ]);
    for (const tr of itemRows) {
        [...tr.children].forEach((cell, index) => assertTypography(cell, index >= 4 ? 11 : 10, index >= 4));
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

test('Arabic intro and closing use centered 15pt Arial without punctuation', () => {
    const {c} = harness();
    const {document} = parseHTML(c.buildFinalizedDiscrepancyEmailHTML(fixture()));
    const messages = [...document.querySelectorAll('td[dir="rtl"]:not([colspan])')];
    assert.equal(messages.length, 2);
    assert.equal(messages[0].querySelector('b').innerHTML, 'السلام عليكم<br>يوجد فرق توريد موضح أدناه');
    assert.equal(messages[1].textContent, 'الرجاء المراجعة والإفادة');
    for (const message of messages) {
        assertTypography(message, 15, true);
        assert.equal(message.getAttribute('align'), 'center');
        assert.equal(message.querySelector('font').getAttribute('face'), 'Arial, Helvetica, sans-serif');
    }
});

test('manual WO entries stay with one TO in preview and both clipboard formats', async () => {
    const {c, document, Event, writes} = harness();
    const report = fixture();
    report.orderGroups[0].orderDate = '';
    report.orderGroups.splice(1, 0, group('TO-001', [row('005', 3, 1)], ''));
    const before = JSON.stringify(report);
    c.openFinalizedDiscrepancyEmailPreview(report, {liveReport: true});
    const frame = document.querySelector('iframe');
    assert.equal(frame.getAttribute('sandbox'), '');
    const editors = document.querySelectorAll('[data-wo-group]');
    assert.equal(editors.length, 2);
    const editor = editors[0];
    const initial = editor.querySelector('[data-wo-number]');
    assert.equal(document.querySelector('h2').textContent, 'TO-001 + TO-002');
    assert.equal(initial.getAttribute('inputmode'), 'numeric');
    assert.equal(initial.previousElementSibling.textContent, 'WO-');
    const enter = (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
    };
    const click = button => button.dispatchEvent(new Event('click', {bubbles: true}));
    enter(initial, 'WO-0001');
    assert.equal(initial.value, '0001');
    assert.match(frame.srcdoc, /WO-0001/);
    const add = editor.querySelector('[data-wo-add]');
    click(add);
    enter(editor.querySelectorAll('[data-wo-number]')[1], '0002');
    click(add);
    enter(editor.querySelectorAll('[data-wo-number]')[2], '0002');
    click(add);
    assert.equal(editor.querySelectorAll('[data-wo-number]').length, 4);

    const html = frame.srcdoc;
    const tables = detailTables(parseHTML(html).document);
    assert.equal(tables.length, 2);
    assert.deepEqual(tables.map(table => table.querySelectorAll('tr').length - 2), [4, 1]);
    const heading = tables[0].querySelector('[colspan]');
    assert.equal(heading.querySelectorAll('br').length, 1);
    assert.deepEqual(values(heading.querySelectorAll('font')), ['TO-001', 'WO-0001 | WO-0002']);
    const woFont = heading.querySelectorAll('font')[1];
    assert.match(woFont.getAttribute('style'), /font-size:10pt;.*font-weight:400/);
    assert.equal(woFont.querySelector('b'), null);
    assert.doesNotMatch(heading.textContent, /—/);
    assert.doesNotMatch(tables[1].textContent, /WO-/);
    assert.equal((html.match(/WO-0002/g) || []).length, 1);
    document.querySelector('#btnCopyFinalizedEmail').click();
    const data = writes[0][0].data;
    assert.equal(await data['text/html'].text(), html);
    let openedUrl;
    c.window.open = url => { openedUrl = url; };
    document.querySelector('#btnOpenFinalizedOutlook').click();
    assert.equal(new URL(openedUrl).searchParams.get('subject'), 'TO-001 + TO-002');
    const text = await data['text/plain'].text();
    assert.match(text, /TO-001\r\nWO-0001 \| WO-0002\r\nCode \| Item Name/);
    assert.match(text, /\+1 \| زيادة 1/);
    assert.match(text, /-69 \| ناقص 69/);
    for (const remove of editor.querySelectorAll('[data-wo-remove]')) click(remove);
    assert.doesNotMatch(frame.srcdoc, /WO-0002/);
    enter(initial, '');
    assert.doesNotMatch(frame.srcdoc, /WO-0001|WO-0002/);
    assert.equal(JSON.stringify(report), before);
    c.openFinalizedDiscrepancyEmailPreview(report);
    assert.equal(document.querySelector('[data-wo-number]').value, '');
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
    assert.deepEqual(values(document.querySelectorAll('td[colspan="6"]')).map(value => value.replace(/\s+/g, ' ')), [
        'TO-001 | 1 Nov 2026', 'Extra Items | 10 Nov 2026', 'Extra Items | 11 Nov 2026'
    ]);
    assert.equal(detailTables(document)[1].querySelector('tbody').children.length, 4);
    assert.match(c.buildFinalizedDiscrepancyEmailText(report), /E2 .*\| 0 \| 3 \| \+3 \| زيادة/);
    assert.match(c.buildFinalizedDiscrepancyEmailHTML({orderId: 'LEGACY', rows: [row('A', 2, 1)]}), /LEGACY/);
    assert.doesNotMatch(c.buildFinalizedDiscrepancyEmailHTML({}), /<th scope=/);
});

test('unsupported rich clipboard writes provide the same plain email and explicit fallback', async () => {
    for (const options of [{textOnly: true}, {reject: true}]) {
        const {c, plain} = harness(options);
        const report = fixture(), workOrders = vm.runInContext('new Map([["TO-001",["001"]]])', c);
        assert.equal(await c.copyFormattedReceivingEmail(report, workOrders), false);
        assert.equal(plain[0], c.buildFinalizedDiscrepancyEmailText(report, workOrders));
        assert.match(plain[0], /WO-001/);
        assert.doesNotMatch(plain[0], /<table/);
    }
});
