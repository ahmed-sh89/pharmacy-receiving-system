const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function controls(){const {document}=parseHTML('<section id="page-duty"></section>'),window={innerWidth:1000,innerHeight:700};const c=vm.createContext({window,document});vm.runInContext(fs.readFileSync('js/duty-controls.js','utf8'),c);return{document,C:window.DutyControls,host:document.querySelector('section')};}
test('one calendar component keeps date boundaries, Receiving-style month navigation and keyboard selection',()=>{
 const f=controls();f.host.innerHTML=f.C.dateField({id:'calendar-test',name:'from',label:'From',value:'2026-11-05',min:'2026-11-01',max:'2026-11-30'});f.C.bindCalendars(f.host);
 const input=f.document.querySelector('input');let changes=0;input.onchange=()=>changes++;
 f.host.querySelector('[data-calendar-for]').onclick();let pop=f.host.querySelector('.duty-calendar-popover');assert.equal(pop.querySelectorAll('[data-duty-date]').length,30);assert.equal(pop.querySelector('[aria-pressed=true]').dataset.dutyDate,'2026-11-05');
 pop.querySelector('[data-calendar-nav="1"]').onclick();assert.equal(pop.querySelectorAll('[data-duty-date]').length,31);assert([...pop.querySelectorAll('[data-duty-date]')].every(b=>b.disabled));assert.equal(input.value,'2026-11-05');
 pop.querySelector('[data-duty-date="2026-12-01"]').onclick();assert.equal(changes,0);assert.equal(input.value,'2026-11-05');
 pop.querySelector('[data-calendar-nav="-1"]').onclick();let focused;for(const b of pop.querySelectorAll('[data-duty-date]'))b.focus=()=>focused=b.dataset.dutyDate;
 pop.onkeydown({key:'ArrowDown',target:pop.querySelector('[data-duty-date="2026-11-05"]'),preventDefault(){}});assert.equal(focused,'2026-11-12');
 pop.querySelector('[data-duty-date="2026-11-12"]').onclick();assert.equal(changes,1);assert.equal(input.value,'2026-11-12');assert.equal(f.host.querySelector('.duty-calendar-popover'),null);assert.match(f.host.querySelector('button').textContent,/12 Nov 2026/);
});
test('time popover uses exact trigger width before positioning, bounds overflow and leaves trigger untouched',()=>{
 const {C}=controls(),style={},trigger={getBoundingClientRect:()=>({left:80,top:100,bottom:134,width:104}),offsetWidth:104},popup={style,offsetWidth:68,getBoundingClientRect:()=>({width:style.width?parseFloat(style.width):68.375,height:200}),showPopover:()=>{}};
 // No layout geometry is changed on the trigger; only the detached/top-layer popup is sized.
 C.openPopover(popup,trigger,true);assert.equal(style.width,'104px');assert.equal(style.minWidth,'0');assert.equal(trigger.offsetWidth,104);assert.equal(style.maxHeight,'255px');assert.equal(style.left,'80px');assert.equal(style.top,'138px');
});
