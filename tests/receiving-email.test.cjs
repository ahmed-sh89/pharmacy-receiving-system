const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function harness(options={}){
 const writes=[],plain=[];
 const c={window:{},setTimeout(){},Blob,URLSearchParams,navigator:{clipboard:{write:async items=>{if(options.reject)throw Error('Unsupported');writes.push(items)},writeText:async t=>plain.push(t)}},ClipboardItem:class{constructor(data){this.data=data;}}};
 if(options.textOnly)delete c.ClipboardItem;
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/orders.js','utf8'),c);
 return {c,writes,plain};
}
const row=(code,o,r,issue)=>({'Item Number':code,'Item Name':'Very long pharmaceutical product name with natural word boundaries <test> & عناية','Ordered Qty':o,'Received Qty':r,'Difference':r-o,'Issue Type':issue});
const group=(n,rows,date='2026-11-01')=>({orderNumber:n,orderDate:date,rows,summary:{discrepancyItems:999}});
const fixture=()=>({orderGroups:[group('TO-000535106',[row('001',100,31,'SHORTAGE'),row('002',10,0,'NOT RECEIVED'),row('003',7,8,'Over Received'),row('004',0,4,'Extra Item'),row('005',5,5,'COMPLETED')]),group('TO-000532448',[row('001',34,31,'Partial Shortage')])],orders:[{orderNumber:'UNRELATED'}],rows:[row('FLAT-MUST-NOT-COUNT',1,0,'SHORTAGE')]});
const json=x=>JSON.parse(JSON.stringify(x));
test('canonical grouped discrepancies only: sum units, distinct orders, exclusive categories, no mutation',()=>{
 const {c}=harness(),r=fixture(),before=JSON.stringify(r),m=c.getReceivingEmailModel(r);
 assert.deepEqual(json(m.counts),{orders:2,partial:72,notReceived:10,over:1,extra:4});
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
 assert.equal(c.getReceivingEmailModel(r).counts.notReceived,4);
 const extra={orderGroups:[{orderNumber:'UNASSIGNED',rows:[row('01',0,8,'UNORDERED')]}]};
 assert.equal(c.getReceivingEmailModel(extra).counts.orders,0);assert.equal(c.getReceivingEmailModel(extra).counts.extra,8);
 assert.equal(c.buildReceivingDiscrepancyEmailSubject(extra),'فرق توريد | Extra Items');
 assert.equal(c.getReceivingEmailModel({}).groups.length,0);
});
test('HTML is inert, escaped, inline styled and contains each item once with separate code/name cells',()=>{
 const {c}=harness(),html=c.buildFinalizedDiscrepancyEmailHTML(fixture()),{document}=parseHTML(html);
 assert.doesNotMatch(html,/<script|<style|on\w+=|https?:|overflow-wrap:anywhere|word-break:break-all|display:flex|display:grid/i);
 assert.match(html,/&lt;test&gt; &amp;/);assert.equal(document.querySelectorAll('th').length,12);
 for(const th of document.querySelectorAll('th'))assert.match(th.getAttribute('style'),/white-space:normal/);
 const codes=[...document.querySelectorAll('td')].filter(t=>t.textContent==='001');assert.equal(codes.length,2);
 assert.equal(codes[0].nextElementSibling.querySelector('[dir=auto]').getAttribute('dir'),'auto');assert.match(codes[0].getAttribute('style'),/white-space:nowrap/);
 assert.match(html,/<b>\+1<\/b>/);assert.match(html,/<b>-69<\/b>/);
 assert.doesNotMatch(html,/min-width:640px|overflow-x:|overflow-wrap:break-word/);
 assert.equal((html.match(/TO-000535106/g)||[]).length,1);
});
test('actual clipboard payload includes complete HTML and meaningful plain text',async()=>{
 const {c,writes}=harness(),r=fixture();assert.equal(await c.copyFormattedReceivingEmail(r),true);
 const data=writes[0][0].data;assert.deepEqual(Object.keys(data),['text/html','text/plain']);
 assert.equal(await data['text/html'].text(),c.buildReceivingEmailClipboardHTML(r));
 assert.equal(await data['text/plain'].text(),c.buildFinalizedDiscrepancyEmailText(r));
 assert.match(await data['text/plain'].text(),/Orders: 2.*Partial Shortage: -72/);
 assert.doesNotMatch(await data['text/plain'].text(),/<table/);
});
test('unsupported rich copy falls back to text, including write rejection',async()=>{
 for(const options of [{textOnly:true},{reject:true}]){const {c,plain}=harness(options);assert.equal(await c.copyFormattedReceivingEmail(fixture()),false);assert.match(plain[0],/Code \| Item Name/);}
});

test('all content cells explicitly centered; KPI backgrounds/fonts survive dropping inline CSS',()=>{
 const {c}=harness(),html=c.buildFinalizedDiscrepancyEmailHTML(fixture()),{document}=parseHTML(html);
 for(const cell of document.querySelectorAll('td,th'))assert.equal(cell.getAttribute('align'),'center');
 const values=[...document.querySelectorAll('font[style*="font-size:22px"]')].map(n=>n.textContent);
 for(const node of document.querySelectorAll('[style]'))node.removeAttribute('style');
 assert(document.querySelectorAll('[bgcolor]').length>20);assert(document.querySelectorAll('font[color][face]').length>20);
 assert(document.querySelectorAll('b').length>20);assert(document.querySelectorAll('[bordercolor]').length>=8);
 assert.deepEqual(values,['2','-72','-10','+1','+4']);
});
test('sum per-order quantities even for repeated codes; explicit extra never enters Over',()=>{
 const {c}=harness(),r={orderGroups:[group('A',[row('001',10,3),row('E',0,1,'Extra Item')]),group('B',[row('001',20,9),row('E',0,5,'UNORDERED'),row('001',2,4)])]};
 assert.deepEqual(json(c.getReceivingEmailModel(r).counts),{orders:2,partial:18,notReceived:0,over:2,extra:6});
 assert.equal(c.getReceivingEmailModel(r).groups.flatMap(g=>g.rows).length,5);
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

test('six separate columns per order, dates, compact KPI cards and distinct Diff backgrounds',()=>{
 const {c}=harness(),r=fixture();r.orderGroups[0].orderDate='2026-10-30';
 const {document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(r));
 for(const head of document.querySelectorAll('thead'))assert.deepEqual([...head.querySelectorAll('th')].map(x=>x.textContent),['Code','Item Name','Ordered','Received','Diff','Status']);
 assert.equal(document.querySelectorAll('thead').length,2);assert.match(document.textContent||document.toString(),/30 Oct 2026/);
 const values=[...document.querySelectorAll('font[style*="font-size:22px"]')];assert.equal(values.length,5);
 const cards=values.map(v=>v.closest('table'));assert.equal(new Set(cards.map(x=>x.parentElement.parentElement)).size,5);
 for(const [diff,bg] of [['-69','#ffdf9e'],['-10','#f7c3c3'],['+1','#bde8d7'],['+4','#d9ccef']]){
  const value=[...document.querySelectorAll('font[style*="font-size:14px"] b')].find(x=>x.textContent===diff);assert(value,diff);assert.equal(value.closest('td').getAttribute('bgcolor'),bg);
 }
 assert(!document.querySelector('font[style*="font-size:28px"]'));
 assert.doesNotMatch(c.buildFinalizedDiscrepancyEmailHTML(r),/display:flex|display:grid/);
});
test('clipboard pipeline has no hidden content, native selection or legacy copy side effects',async()=>{
 const {c,writes}=harness();c.document=new Proxy({}, {get(){throw Error('Copy must not touch DOM')}});
 assert.equal(await c.copyFormattedReceivingEmail(fixture()),true);assert.equal(writes.length,1);
});
test('Outlook compose URL is business HTTPS with encoded recipient/subject and no rich body or account',()=>{
 const {c}=harness();const u=new URL(c.buildOutlookWebComposeUrl({to:'warehouse@example.invalid',subject:'فرق توريد | TO-1 + TO-2',body:'<script>bad</script>'}));
 assert.equal(u.origin,'https://outlook.office.com');assert.equal(u.pathname,'/mail/deeplink/compose');
 assert.equal(u.searchParams.get('to'),'warehouse@example.invalid');assert.equal(u.searchParams.get('subject'),'فرق توريد | TO-1 + TO-2');assert.equal(u.searchParams.size,2);
});
test('actual preview uses exact clipboard document and replaces Gmail with safe Outlook link',()=>{
 const {c}=harness(),{document}=parseHTML('<html><body></body></html>');c.document=document;
 c.openFinalizedDiscrepancyEmailPreview(fixture());
 assert.equal(document.querySelector('iframe').getAttribute('srcdoc'),c.buildReceivingEmailClipboardHTML(fixture()));
 const link=document.querySelector('#btnOpenFinalizedOutlook');assert.equal(link.textContent,'Open Outlook Web');assert.equal(link.tagName,'BUTTON');
 assert.equal(document.querySelectorAll('#btnCopyFinalizedEmail').length,1);assert.doesNotMatch(document.body.innerHTML,/Gmail|mailto:/);
});
test('Outlook action preserves clipboard and uses the entered recipient without sending',()=>{
 const {c,writes,plain}=harness(),{document}=parseHTML('<html><body></body></html>');c.document=document;c.showToast=()=>{};const opened=[];c.window.open=(...args)=>opened.push(args);
 c.openFinalizedDiscrepancyEmailPreview(fixture());document.querySelector('#finalizedEmailTo').value='warehouse@example.invalid';
 const link=document.querySelector('#btnOpenFinalizedOutlook');link.click();assert.equal(opened[0][1],'_blank');assert.equal(opened[0][2],'noopener,noreferrer');const u=new URL(opened[0][0]);
 assert.equal(u.searchParams.get('to'),'warehouse@example.invalid');assert.equal(u.searchParams.get('subject'),'فرق توريد | TO-000535106 + TO-000532448');
 assert.equal(writes.length,0);assert.equal(plain.length,0);assert.equal(u.searchParams.has('body'),false);
});

function acceptanceReport(c,scenario){
 const source=fs.readFileSync('tests/fixtures/receiving-email.fixture.js','utf8');
 vm.runInContext(source,c);return c.buildReceivingEmailAcceptanceReport(scenario);
}
test('approved realistic two-order fixture: 2 Orders, -2 Partial, +2 Over; correct dates and six fields',()=>{
 const {c}=harness(),r=acceptanceReport(c,'realistic'),before=JSON.stringify(r),m=c.getReceivingEmailModel(r);
 assert.deepEqual(json(m.counts),{orders:2,partial:2,notReceived:0,over:2,extra:0});
 assert.equal(r.orderGroups[0].orderNumber,'TO-000532501');assert.equal(r.orderGroups[0].orderDate,'2026-10-29');
 assert.equal(r.orderGroups[0].rows[0]['Item Name'],'Johnson Anti Bacterial B.Wash Sea Salt 250 Ml 31233-5876');
 assert.equal(r.orderGroups[1].orderDate,'2026-10-30');
 const {document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(r));
 assert.deepEqual([...document.querySelectorAll('font[style*="font-size:22px"]')].map(n=>n.textContent),['2','-2','+2']);
 assert.equal(document.querySelectorAll('thead th').length,12);assert.match(document.toString(),/29 Oct 2026/);assert.match(document.toString(),/30 Oct 2026/);
 assert.equal(JSON.stringify(r),before);assert.match(c.buildFinalizedDiscrepancyEmailText(r),/Orders: 2 \| Partial Shortage: -2 \| Over Received: \+2/);
});
test('conditional 1/2/3/4/5 indicators use independent cool gray blue cards without badges',()=>{
 const {c}=harness();
 for(const [scenario,count] of [['singleKpi',1],['twoIndicators',2],['realistic',3],['four',4],['five',5]]){
  const {document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(acceptanceReport(c,scenario)));
  const numbers=[...document.querySelectorAll('font[style*="font-size:22px"]')];assert.equal(numbers.length,count);
  const cards=numbers.map(n=>n.closest('table'));
  for(const [i,card] of cards.entries()){
   assert.equal(card.getAttribute('width'),'100%');assert.equal(card.getAttribute('height'),'84');
   assert.equal(card.getAttribute('bgcolor'),'#E1EAF2');assert.equal(card.getAttribute('bordercolor'),'#CBD9E6');
   assert.equal(numbers[i].closest('td').getAttribute('dir'),'ltr');assert.equal(numbers[i].closest('td').getAttribute('bgcolor'),'#E1EAF2');
   assert.equal(card.querySelectorAll('table').length,0);
  }
  const cardRows=[...new Set(cards.map(n=>n.parentElement.parentElement))];
  assert.equal(cardRows.length,count);
  for(const card of cards){
   const column=card.parentElement.closest("table");
   assert.equal(column.getAttribute("width"),`${100/count}%`);
   assert.match(column.getAttribute("style"),/display:inline-table/);
  }
 }
});
test('larger quantities and extra/not-received totals are signed units, never row counts',()=>{
 const {c}=harness(),r=acceptanceReport(c,'large'),m=c.getReceivingEmailModel(r);
 assert.deepEqual(json(m.counts),{orders:2,partial:240,notReceived:412,over:2500,extra:75});
 const {document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(r));assert.deepEqual([...document.querySelectorAll('font[style*="font-size:22px"]')].map(n=>n.textContent),['2','-240','-412','+2500','+75']);
});
test('original intro/closing type remains unchanged; realistic names normal and status matches classification',()=>{
 const {c}=harness(),{document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(acceptanceReport(c,'realistic')));
 const intro=document.querySelector('font[style*="font-size:20px"]');assert.equal(intro.textContent,'الإخوة الكرام بالمستودعتحية طيبة وبعديوجد فرق توريد موضح أدناهنأمل التكرم بالمراجعة والتشييك');assert(intro.querySelector('b'));assert.match(intro.getAttribute('style'),/line-height:41px/);
 const closing=document.querySelector('font[style*="font-size:18px"]');assert.equal(closing.textContent,'خالص الشكر والتقدير');assert(closing.querySelector('b'));assert.match(closing.getAttribute('style'),/line-height:32px/);
 for(const row of document.querySelectorAll('tbody>tr')){
  if(row.children.length!==6)continue;
  assert.equal(row.children[1].querySelector('b'),null);assert.equal(row.children[5].querySelector('b'),null);
  assert.equal(row.children[5].querySelector('font').getAttribute('color'),row.children[4].querySelector('font').getAttribute('color'));
 }
});
test('prominent category-colored numbers and consistent dark-slate semi-bold labels',()=>{
 const {c}=harness(),{document}=parseHTML(c.buildFinalizedDiscrepancyEmailHTML(acceptanceReport(c,'five')));
 const numbers=[...document.querySelectorAll('font[style*="font-size:22px"]')];
 const inks=['#173d63','#865600','#a72f2f','#16634b','#62468e'];
 numbers.forEach((n,i)=>{
  const card=n.closest('table'),label=card.querySelector('font[style*="font-size:14px"]');
  assert.equal(n.getAttribute('color'),inks[i]);assert(n.querySelector('b'));
  assert.equal(n.closest('td').getAttribute('bgcolor'),'#E1EAF2');
  assert.equal(label.getAttribute('color'),'#334155');assert.match(label.getAttribute('style'),/font-weight:600/);
  assert.match(label.querySelector('span').getAttribute('style'),/font-weight:600/);
 });
});
test('polish: every blue bar explicitly sets white on its cell, font, bold and nested text in both payloads',()=>{
 const {c}=harness(),r=acceptanceReport(c,'realistic');
 for(const html of [c.buildFinalizedDiscrepancyEmailHTML(r),c.buildReceivingEmailClipboardHTML(r)]){
  const {document}=parseHTML(html),bars=[...document.querySelectorAll('td')].filter(n=>['#0b6faf','#0b5f9f'].includes(n.getAttribute('bgcolor')));
  assert.equal(bars.length,3);
  for(const bar of bars){
   for(const node of [bar,...bar.querySelectorAll('font,b,span')]){
    assert.match(node.getAttribute('style'),/color:#FFFFFF(?:;|$)/i);
    if(node.tagName!=='FONT')assert.match(node.getAttribute('style'),/font-weight:700/);
   }
   assert.equal(bar.querySelector('font,b'),null);
   assert.match(bar.querySelector('span').getAttribute('style'),/font-size:(15|16)px;line-height:22px;color:#FFFFFF;font-weight:700/);
  }
 }
});

test('status allocation and direct semi-bold category text survive actual clipboard payload',async()=>{
 const {c,writes}=harness(),report=acceptanceReport(c,'five');
 await c.copyFormattedReceivingEmail(report);
 const payload=writes[0][0].data;
 assert.equal(payload['text/html'].type,'text/html');assert.equal(payload['text/plain'].type,'text/plain');
 const html=await payload['text/html'].text();assert.equal(html,c.buildReceivingEmailClipboardHTML(report));
 const {document}=parseHTML(html);
 for(const head of document.querySelectorAll('thead')){
  assert.equal(head.querySelectorAll('th').length,6);
  assert.equal(head.querySelector('th:last-child').getAttribute('width'),'22%');
 }
 const expected={'Partial Shortage':'#865600','Not Received':'#a72f2f','Over Received':'#16634b','Extra':'#62468e'};
 for(const tr of document.querySelectorAll('tbody>tr')){
  if(tr.children.length!==6)continue;
  const cell=tr.children[5],font=cell.querySelector('font'),span=font.querySelector('span');
  assert.match(cell.getAttribute('style'),/white-space:normal;overflow-wrap:normal/);
  assert.equal(font.getAttribute('color'),expected[cell.textContent]);
  assert.match(font.getAttribute('style'),/font-size:13px.*font-weight:600/);
  assert.equal(span.getAttribute('style'),`color:${expected[cell.textContent]};font-weight:600`);
  assert.equal(cell.getAttribute('bgcolor'),tr.children[1].getAttribute('bgcolor'));
 }
 const bars=[...document.querySelectorAll('td')].filter(n=>['#0b6faf','#0b5f9f'].includes(n.getAttribute('bgcolor')));
 assert.equal(bars.length,3);
 for(const bar of bars){assert.equal(bar.querySelector('font,b'),null);assert.match(bar.querySelector('span').getAttribute('style'),/color:#FFFFFF;font-weight:700/);}
});
test('ice-blue interior reaches empty padding/spacers but preserves exterior and colored panels',async()=>{
 const {c,writes}=harness(),report=acceptanceReport(c,'realistic');
 await c.copyFormattedReceivingEmail(report);
 for(const html of [c.buildFinalizedDiscrepancyEmailHTML(report),await writes[0][0].data['text/html'].text()]){
  const {document}=parseHTML(html),tables=[...document.querySelectorAll('table')];
  const outer=tables.find(n=>n.getAttribute('bordercolor')==='#b8d5e9');
  assert.equal(outer.getAttribute('bgcolor'),'#F0F6FB');
  assert.equal(outer.querySelector('td').getAttribute('bgcolor'),'#F0F6FB');
  assert.equal(tables[0].getAttribute('bgcolor'),'#f2f7fb');
  for(const node of document.querySelectorAll('td[height="22"],td[height="26"]'))assert.equal(node.getAttribute('bgcolor'),'#F0F6FB');
  for(const node of document.querySelectorAll('td[style*="padding:8px 0"],td[style*="padding:12px;"]'))assert.equal(node.getAttribute('bgcolor'),'#F0F6FB');
  for(const card of document.querySelectorAll('table[height="84"]'))assert.equal(card.getAttribute('bgcolor'),'#E1EAF2');
  assert.equal(document.querySelectorAll('table[bgcolor="#d5eaf8"]').length,2);
  assert.equal(document.querySelectorAll('td[bgcolor="#0b6faf"]').length,1);
  assert.equal(document.querySelectorAll('td[bgcolor="#0b5f9f"]').length,2);
  for(const tr of document.querySelectorAll('tbody>tr'))if(tr.children.length===6)assert(['#f6fbff','#eaf4fb'].includes(tr.children[1].getAttribute('bgcolor')));
 }
});
test('summary matches order typography and detail width respects intrinsic code/status content',async()=>{
 const {c,writes}=harness(),report=acceptanceReport(c,'realistic');
 report.orderGroups[0].rows.push(row('123456789012345',2,1,'Partial Shortage'));
 await c.copyFormattedReceivingEmail(report);
 for(const html of [c.buildFinalizedDiscrepancyEmailHTML(report),await writes[0][0].data['text/html'].text()]){
  const {document}=parseHTML(html),bars=[...document.querySelectorAll('td')].filter(n=>['#0b6faf','#0b5f9f'].includes(n.getAttribute('bgcolor')));
  for(const bar of bars)assert.match(bar.querySelector('span').getAttribute('style'),/font-size:16px;line-height:22px;color:#FFFFFF;font-weight:700/);
  for(const head of document.querySelectorAll('thead')){
   const table=head.closest('table'),host=table.parentElement;
   assert.equal(table.getAttribute('align'),null);assert.equal(table.getAttribute('width'),'100%');
   assert.match(table.getAttribute('style'),/width:100%;.*table-layout:auto/);assert.doesNotMatch(table.getAttribute('style'),/min-width/);
   assert.equal(host.getAttribute('dir'),'ltr');
   assert.equal(head.querySelectorAll('th').length,6);
   for(const tr of table.querySelectorAll('tbody>tr')){
    if(tr.children.length!==6)continue;
    assert.match(tr.children[0].getAttribute('style'),/white-space:nowrap/);
    assert.match(tr.children[5].getAttribute('style'),/white-space:normal;overflow-wrap:normal/);
    for(const cell of tr.children)assert.equal(cell.getAttribute('align'),'center');
   }
  }
  assert.match(html,/123456789012345/);
 }
});

test('very large signed KPI values stay intact in the clipboard with no data or text changes',async()=>{
 const {c,writes}=harness(),report=acceptanceReport(c,'five');
 report.orderGroups[0].rows[0]['Received Qty']=123456789;
 report.orderGroups[1].rows[0]['Ordered Qty']=123456789;
 const before=JSON.stringify(report),text=c.buildFinalizedDiscrepancyEmailText(report);
 await c.copyFormattedReceivingEmail(report);
 assert.equal(JSON.stringify(report),before);assert.equal(await writes[0][0].data['text/plain'].text(),text);
 const {document}=parseHTML(await writes[0][0].data['text/html'].text());
 const large=[...document.querySelectorAll('td[dir="ltr"]')].filter(n=>/^[+-]\d{8,}$/.test(n.textContent));
 assert.equal(large.length,2);
 for(const value of large){assert.match(value.getAttribute('style'),/white-space:nowrap/);assert(value.querySelector('b'));}
});
