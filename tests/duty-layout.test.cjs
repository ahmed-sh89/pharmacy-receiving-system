const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const prefix=fs.readFileSync('tests/duty-polish.test.cjs','utf8').split("for(const label of")[0];
const {editorFixture}=new Function('require',prefix+';return {editorFixture};')(require);
function fixture(){const f=editorFixture();for(let i=0;i<6;i++)f.data.employees.push({code:'P'+i,name:'Synthetic Pharmacist '+i,position_key:'pharmacist',active:true,sort_order:i+3});f.window.DutySchedule.mount(f.host,f.data,{month:'2026-11',demo:false,save(){throw Error('Unexpected layout write');}});return f;}
test('compact KPI labels keep all five correct model values for every visible employee without changing data',()=>{
 const f=fixture(),before=JSON.stringify(f.data),staff=Array.from(f.M.ordered(f.data.employees)).slice(0,6),totals=f.M.totals(f.data.entries,f.data.holidays,f.data.employees,f.data.hour_rules,true),labels=['Basic','Normal OT','Friday OT','Holiday OT','Total'];
 const cards=[...f.host.querySelectorAll('.duty-mini-kpis')];assert.equal(cards.length,6);
 cards.forEach((card,index)=>{assert.deepEqual([...card.querySelectorAll('.duty-kpi-label')].map(e=>e.textContent),labels);for(const [key] of Object.entries({...f.M.categories,total:'Total'}))assert.equal(card.querySelector('.duty-category-'+key+' b').textContent,f.M.hours(totals[staff[index].code]?.[key]||0));});assert.equal(JSON.stringify(f.data),before);
});
test('compact staff pagination still moves six at a time and returns saved order without writes',async()=>{
 const f=fixture(),before=JSON.stringify(f.data),initial=[...f.host.querySelectorAll('.duty-staff-title')].map(e=>e.title);assert.match(f.host.querySelector('.duty-period').textContent,/1\/2/);
 await f.host.onclick({target:f.host.querySelector('[data-s-action=staff-next]')});assert.match(f.host.querySelector('.duty-period').textContent,/2\/2/);assert.equal(f.host.querySelectorAll('.duty-staff-card').length,2);assert(f.host.querySelector('[data-s-action=staff-next]').disabled);
 await f.host.onclick({target:f.host.querySelector('[data-s-action=staff-back]')});assert.deepEqual([...f.host.querySelectorAll('.duty-staff-title')].map(e=>e.title),initial);assert.equal(JSON.stringify(f.data),before);
});
