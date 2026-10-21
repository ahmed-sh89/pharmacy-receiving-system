const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function adapter(source){return vm.runInNewContext(source+'\nExpiryOperation;');}
const current=adapter(fs.readFileSync('js/expiry-operation.js','utf8'));
const gtin='00123456789012',GS='\x1d';
const cases=[
 [']d2011234','FIELD','FIXED_LENGTH','01'],
 [']d201'+gtin+'99SYNTHETIC','AI','UNSUPPORTED_AI',null],
 ['(01)'+gtin+'(10)A(10)B','FIELD','DUPLICATE_AI','10'],
 ['(01)1234567890123A','FIELD','FIXED_NON_DIGIT','01'],
 ['01'+gtin+'10'+'X'.repeat(21),'FIELD','VARIABLE_LENGTH','10'],
 ['01'+gtin+'17301331','DATE','INVALID_EXPIRY','17'],
 ['(10)SYNTHETIC','REQUIRED','GTIN_MISSING',null],
 ['(01)'+gtin+'(99)SYNTHETIC','AI','UNSUPPORTED_AI_OR_FRAME',null]
];
for(const [scan,stage,reason,ai] of cases)test('Opt-in reports '+reason+' without changing rejection',()=>{
 const prior=stage==='AI'?'Unsupported GS1 scan':stage==='DATE'?'Invalid GS1 expiry':stage==='REQUIRED'?'GS1 GTIN required':'Invalid GS1 scan';assert.throws(()=>current.scanFacts(scan,true),error=>{
  assert.equal(error.message,prior);assert.equal(error.expiryScanDiagnostic.stage,stage);assert.equal(error.expiryScanDiagnostic.reason,reason);assert.equal(error.expiryScanDiagnostic.ai,ai);
  const serialized=JSON.stringify(error.expiryScanDiagnostic);assert.ok(!serialized.includes(gtin));assert.ok(!serialized.includes('SYNTHETIC'));return true;
 });
 assert.throws(()=>current.scanFacts(scan),error=>error.message===prior && error.expiryScanDiagnostic===undefined);
});
test('Physical envelope alone admits different rejection reasons; examples are synthetic, not Dompy raw input',()=>{
 const prefix='01'+gtin+'17290131'+GS;
 const examples=[prefix+'99'+'X'.repeat(29),prefix+'10'+'X'.repeat(29)];
 const reasons=[];for(const scan of examples){assert.equal(scan.length,56);assert.equal(scan.indexOf(GS),24);assert.equal(scan.split(GS).length-1,1);try{current.scanFacts(scan,true);}catch(e){reasons.push(e.expiryScanDiagnostic.reason);}}
 assert.deepEqual(reasons,['UNSUPPORTED_AI','VARIABLE_LENGTH']);
});
test('Diagnostics preserve exact accepted facts and valid boundaries/order',()=>{
 const scans=['01'+gtin+'1729013110SYNTHETIC'+GS+'21SERIAL',']d21729013121SERIAL'+GS+'01'+gtin+'10BATCH','(21)SERIAL(10)BATCH(17)290131(01)'+gtin,'0000123'];
 for(const scan of scans)assert.equal(JSON.stringify(current.scanFacts(scan,true)),JSON.stringify(current.scanFacts(scan)));
 const facts=current.scanFacts(scans[0],true);assert.equal(facts.identifier,gtin);assert.equal(facts['10'],'SYNTHETIC');assert.equal(facts['21'],'SERIAL');assert.equal(facts['17'],'290131');
});
