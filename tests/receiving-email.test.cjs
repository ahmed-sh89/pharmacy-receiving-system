const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function harness(options={}){
 const writes=[],plain=[];
 const c={window:{},setTimeout(){},Blob,navigator:{clipboard:{write:async items=>{if(options.reject)throw Error('Unsupported');writes.push(items)},writeText:async t=>plain.push(t)}},ClipboardItem:class{constructor(data){this.data=data;}}};
 if(options.textOnly)delete c.ClipboardItem;
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/orders.js','utf8'),c);
 return {c,writes,plain};
}
const row=(code,o,r,issue)=>({'Item Number':code,'Item Name':'Very long pharmaceutical product name with natural word boundaries <test> & عناية','Ordered Qty':o,'Received Qty':r,'Difference':r-o,'Issue Type':issue});
const group=(n,rows,date='2026-11-01')=>({orderNumber:n,orderDate:date,rows,summary:{discrepancyItems:999}});
const fixture=()=>({orderGroups:[group('TO-000535106',[row('001',100,31,'SHORTAGE'),row('002',10,0,'NOT RECEIVED'),row('003',7,8,'Over Received'),row('004',0,4,'Extra Item'),row('005',5,5,'COMPLETED')]),group('TO-000532448',[row('001',34,31,'Partial Shortage')])],orders:[{orderNumber:'UNRELATED'}],rows:[row('FLAT-MUST-NOT-COUNT',1,0,'SHORTAGE')]});
const json=x=>JSON.parse(JSON.stringify(x));
test('canonical grouped discrepancies only: count items, distinct orders, exclusive categories, no mutation',()=>{
 const {c}=harness(),r=fixture(),before=JSON.stringify(r),m=c.getReceivingEmailModel(r);
 assert.deepEqual(json(m.counts),{orders:2,partial:1,notReceived:1,over:1,extra:1});
 assert.equal(JSON.stringify(r),before);assert.equal(m.groups[0].rows.length,4);
 assert.equal(m.groups[0].rows[3].label,'Extra');
});
test('zero KPIs and equal quantities suppressed; same item on separate orders retained',()=>{
 const {c}=harness(),r={orderGroups:[group('A',[row('001',20,3,'SHORTAGE')]),group('A',[row('002',4,0,'NOT RECEIVED')]),group('B',[row('001',2,2,'COMPLETED')])]};
 const html=c.buildFinalizedDiscrepancyEmailHTML(r),text=c.buildFinalizedDiscrepancyEmailText(r);
 assert.match(html,/Orders/);assert.doesNotMatch(html,/Over Received|Extra Items|>Received<.*>2</s);
 assert.doesNotMatch(text,/Over Received:|Extra Items:/);assert.equal(c.getReceivingEmailModel(r).counts.orders,1);
});
test('subject uses affected orders only, singular/two/3+ and latest affected date',()=>{
 const {c}=harness();const r={orderGroups:[group('TO-000535106',[row('1',1,0)])]};
 assert.equal(c.buildReceivingDiscrepancyEmailSubject(r),'فرق توريد | TO-000535106');
 r.orderGroups.push(group('TO-000532448',[row('2',1,0)]));assert.equal(c.buildReceivingDiscrepancyEmailSubject(r),'فرق توريد | TO-000535106 + TO-000532448');
 for(let i=0;i<3;i++)r.orderGroups.push(group('TO-'+i,[row('2',1,0)],'2026-10-30'));
 assert.equal(c.buildReceivingDiscrepancyEmailSubject(r),'فرق توريد | TO-000535106 + 4 أخرى | 01-11');
});
test('fallback reports, extras/unassigned do not count as orders, empty report',()=>{
 const {c}=harness();const r={orders:[{orderNumber:'A',orderDate:'2026-11-01'}],rows:[row('01',4,0)]};
 assert.equal(c.getReceivingEmailModel(r).counts.notReceived,1);
 const extra={orderGroups:[{orderNumber:'UNASSIGNED',rows:[row('01',0,8,'UNORDERED')]}]};
 assert.equal(c.getReceivingEmailModel(extra).counts.orders,0);assert.equal(c.getReceivingEmailModel(extra).counts.extra,1);
 assert.equal(c.buildReceivingDiscrepancyEmailSubject(extra),'فرق توريد | Extra Items');
 assert.equal(c.getReceivingEmailModel({}).groups.length,0);
});
test('HTML is inert, escaped, inline styled and contains each item once with separate code/name cells',()=>{
 const {c}=harness(),html=c.buildFinalizedDiscrepancyEmailHTML(fixture()),{document}=parseHTML(html);
 assert.doesNotMatch(html,/<script|<style|on\w+=|https?:|overflow-wrap:anywhere|word-break:break-all|display:flex|display:grid/i);
 assert.match(html,/&lt;test&gt; &amp;/);assert.equal(document.querySelectorAll('th').length,25);
 for(const th of document.querySelectorAll('th'))assert.match(th.getAttribute('style'),/white-space:nowrap/);
 const codes=[...document.querySelectorAll('td')].filter(t=>t.textContent==='001');assert.equal(codes.length,2);
 assert.equal(codes[0].nextElementSibling.querySelector('[dir=auto]').getAttribute('dir'),'auto');assert.match(codes[0].getAttribute('style'),/overflow-wrap:break-word/);
 assert.match(html,/<b>\+1<\/b>/);assert.match(html,/<b>-69<\/b>/);
 assert.match(html,/min-width:280px/);assert.match(html,/min-width:240px/);
 assert.equal((html.match(/TO-000535106/g)||[]).length,1);
});
test('actual clipboard payload includes complete HTML and meaningful plain text',async()=>{
 const {c,writes}=harness(),r=fixture();assert.equal(await c.copyFormattedReceivingEmail(r),true);
 const data=writes[0][0].data;assert.deepEqual(Object.keys(data),['text/html','text/plain']);
 assert.equal(await data['text/html'].text(),c.buildReceivingEmailClipboardHTML(r));
 assert.equal(await data['text/plain'].text(),c.buildFinalizedDiscrepancyEmailText(r));
 assert.match(await data['text/plain'].text(),/Orders: 2.*Partial Shortage: 1/);
 assert.doesNotMatch(await data['text/plain'].text(),/<table/);
});
test('unsupported rich copy falls back to text, including write rejection',async()=>{
 for(const options of [{textOnly:true},{reject:true}]){const {c,plain}=harness(options);assert.equal(await c.copyFormattedReceivingEmail(fixture()),false);assert.match(plain[0],/Code \| Item Name/);}
});

test('all content cells explicitly centered; KPI backgrounds/fonts survive dropping inline CSS',()=>{
 const {c}=harness(),html=c.buildFinalizedDiscrepancyEmailHTML(fixture()),{document}=parseHTML(html);
 for(const cell of document.querySelectorAll('td,th'))assert.equal(cell.getAttribute('align'),'center');
 for(const node of document.querySelectorAll('[style]'))node.removeAttribute('style');
 assert(document.querySelectorAll('[bgcolor]').length>20);assert(document.querySelectorAll('font[color][face]').length>20);
 assert(document.querySelectorAll('b').length>20);assert(document.querySelectorAll('[bordercolor]').length>=8);
 const values=[...document.querySelectorAll('font[size="5"]')].map(n=>n.textContent);assert.deepEqual(values,['2','1','1','1','1']);
});
test('distinct codes within each KPI across orders; explicit extra never enters Over',()=>{
 const {c}=harness(),r={orderGroups:[group('A',[row('001',10,3),row('E',0,1,'Extra Item')]),group('B',[row('001',20,9),row('E',0,5,'UNORDERED'),row('001',2,4)])]};
 assert.deepEqual(json(c.getReceivingEmailModel(r).counts),{orders:2,partial:1,notReceived:0,over:1,extra:1});
 assert.equal(c.getReceivingEmailModel(r).groups.flatMap(g=>g.rows).length,5);
});
test('native copy writes both MIME types, requires successful event, removes host and restores focus/selection',async()=>{
 for(const succeeds of [true,false]){
  const {c,writes,plain}=harness();const handlers={},data={},events=[];let removed=false,focused=false;
  const selection={rangeCount:0,removeAllRanges(){events.push('clear')},addRange(){events.push('range')}};
  c.window.getSelection=()=>selection;
  c.document={activeElement:{focus(){focused=true}},body:{appendChild(){events.push('append')}},createElement(){return {setAttribute(){},style:{},remove(){removed=true}}},createRange(){return {selectNodeContents(){}}},addEventListener(k,f){handlers[k]=f},removeEventListener(k){delete handlers[k]},execCommand(command){assert.equal(command,'copy');handlers.copy({clipboardData:{setData(k,v){data[k]=v}},preventDefault(){events.push('prevent')},stopImmediatePropagation(){}});return succeeds}};
  assert.equal(await c.copyFormattedReceivingEmail(fixture()),true);assert(data['text/html'].includes('<!--StartFragment-->'));assert(data['text/plain'].includes('Partial Shortage'));
  assert(removed&&focused);assert.equal(handlers.copy,undefined);assert.equal(plain.length,0);assert.equal(writes.length,succeeds?0:1);
 }
});
test('ClipboardItem construction failure still provides explicitly flagged plain fallback',async()=>{
 const {c,plain}=harness();c.ClipboardItem=class{constructor(){throw Error('unsupported type')}};
 assert.equal(await c.copyFormattedReceivingEmail(fixture()),false);assert.equal(plain.length,1);
});
test('actual PharmFlow preview embeds the same centered email markup with safe srcdoc escaping',()=>{
 const {c}=harness();const {document}=parseHTML('<html><body></body></html>');c.document=document;
 const r=fixture();r.orderGroups[0].rows[0]['Item Name']='Mixed عربي "quote" <img src=x onerror=alert(1)>';
 c.openFinalizedDiscrepancyEmailPreview(r,{liveReport:true});
 const frame=document.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'');
 const doc=frame.getAttribute('srcdoc');assert(doc.includes(c.buildFinalizedDiscrepancyEmailHTML(r)));assert(doc.includes('&lt;img'));
 assert.equal(document.querySelectorAll('#btnCopyFinalizedEmail').length,1);
});
