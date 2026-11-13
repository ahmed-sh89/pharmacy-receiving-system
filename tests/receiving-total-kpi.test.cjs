const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('ui.js','utf8'),i=s.indexOf('function getKpiPanelItems('),fn=s.slice(i,s.indexOf('\n}',i)+2);
test('Total detail keeps separate order rows while counting the same unique ordered items as card; Extra excluded',()=>{const c={getScopedOrderItems:()=>[],getSelectedReceivingOrderNumbers:()=>['A','B'],getPerOrderReceivingRows:o=>[{'Item Number':'X','Item Name':'Synthetic','Ordered Qty':o==='A'?10:20,'Received Qty':0},{'Item Number':'EXTRA','Ordered Qty':0,'Received Qty':4,issueKey:'manual'}],AppState:{workspace:{orderData:[]}},buildReceivedQuantityByOrder:()=>new Map(),normalizeItemCode:String,toNumber:(v,d=0)=>Number(v)||d,toSafeString:v=>String(v||''),getItemByCode:()=>({})};vm.createContext(c);vm.runInContext(fn,c);const rows=c.getKpiPanelItems('total');assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.itemCode)).size,1);assert.equal(rows.reduce((n,r)=>n+r.orderedQty,0),30);assert.deepEqual(Array.from(rows,r=>r.orderNumber),['A','B']);});

test('KPI details render the matching order and signed quantity in each panel',()=>{
    const {parseHTML}=require('linkedom');
    const {document}=parseHTML('<div class="quickKpiPanel"><div data-body></div></div>');
    const body=document.querySelector('[data-body]');
    const start=s.indexOf('function renderDashboardKpiPanel(');
    const render=s.slice(start,s.indexOf('\n}',start)+2);
    const cases={
        completed:[1,'0','matched'],
        remainingItems:[0,'-1','shortage'],
        remaining:[0,'-1','shortage'],
        over:[2,'+1','surplus']
    };
    const context=vm.createContext({
        toSafeString:value=>String(value??''),
        getKpiPanelItems:key=>[{
            itemCode:'500001',itemName:'Synthetic <item>',orderNumber:'TO-000333333',
            orderedQty:1,receivedQty:cases[key][0],status:'Example'
        }]
    });
    vm.runInContext(render,context);
    for(const [key,[,value,tone]] of Object.entries(cases)){
        context.renderDashboardKpiPanel(key,body);
        const headings=Array.from(body.querySelectorAll('th'),heading=>heading.textContent);
        assert.deepEqual(headings,['Item Code','Item Name','Ordered','Received','Remaining','Status','Order No.']);
        assert.equal(body.querySelector('.pfnItemName').textContent,'Synthetic <item>');
        assert.equal(body.querySelector('.pfnOrderNo').textContent,'TO-000333333');
        const difference=body.querySelector('.pfrKpiDifference');
        assert.equal(difference.textContent,value);
        assert.equal(difference.dataset.tone,tone);
    }
});
