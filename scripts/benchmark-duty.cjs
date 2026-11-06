// Repeatable offline render comparison. Usage: node scripts/benchmark-duty.cjs <baseline-ref>
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),{performance}=require('node:perf_hooks'),{parseHTML}=require('linkedom');
const baseline=process.argv[2];if(!baseline)throw Error('Supply a verified baseline Git ref.');
function measure(ref){
 const read=path=>ref?cp.execFileSync('git',['show',ref+':'+path],{encoding:'utf8'}):fs.readFileSync(path,'utf8');
 const {document}=parseHTML('<div id="host"></div>'),window={innerWidth:1400,innerHeight:900};
 const c=vm.createContext({window,document,CSS:{escape:s=>s},Intl,Date,Set,Map,structuredClone});
 vm.runInContext(read('js/duty-model.js'),c);vm.runInContext(read('js/duty-schedule.js'),c);
 const times=[];for(let i=0;i<10;i++){const start=performance.now();window.DutySchedule.mount(document.querySelector('#host'),window.DutyModel.demoMonth('2026-11'),{month:'2026-11',demo:true});times.push(performance.now()-start);}
 const sorted=times.slice().sort((a,b)=>a-b);return {samples_ms:times,mean_ms:times.reduce((a,b)=>a+b,0)/times.length,median_ms:(sorted[4]+sorted[5])/2};
}
console.log(JSON.stringify({scenario:'6 visible staff, 30 days; demo construction plus DOM render; no network',baseline_ref:baseline,before:measure(baseline),after:measure(null)},null,2));
