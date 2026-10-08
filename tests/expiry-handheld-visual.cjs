// Offline presentation evidence: real Expiry DOM/styles, synthetic text only.
// No app bootstrap, authentication, RPCs, Storage or save simulation.
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readdirSync('dist-staging/assets').find(x=>x.endsWith('.css'));
const styles='<link rel="stylesheet" href="/assets/'+css+'">';
const start=html.indexOf('<section\n                id="zebraExpiryShell"');
const end=html.indexOf('<section class="expiryCurrentWorkspace"',start);
if(start<0||end<0)throw Error('Canonical Expiry markup not found');
const capture=html.slice(start,end)+'</section>';
const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const scenes=['recognized','unrecognized','photos'];
const fixture=scenes.map(state=>{
 let content=capture.replace('READY TO SCAN',state==='recognized'?'✓ ITEM FOUND · SELECT EXPIRY':'ITEM NOT RECOGNIZED')
 .replace('expiryScanStatus ready','expiryScanStatus '+(state==='recognized'?'success':'error'))
 .replace('id="expiryItemName">—','id="expiryItemName">'+(state==='recognized'?'Synthetic Vitamin C 1000 mg':'Item not recognized'))
 .replace('id="expiryItemCode">—','id="expiryItemCode">'+(state==='recognized'?'SYNTH-100':'Needs Review'))
 .replace('id="expiryItemGTIN">—','id="expiryItemGTIN">'+(state==='recognized'?'001234':'U0030'))
 .replace('<span class="pfSelectValue">Desktop</span>','<span class="pfSelectValue">Synthetic worker A</span>')
 .replace('<span class="pfSelectValue">Month</span>','<span class="pfSelectValue">August</span>')
 .replace('<span class="pfSelectValue">Year</span>','<span class="pfSelectValue">2027</span>')
 .replace('id="expiryQuantity"','value="1" id="expiryQuantity"')
 .replace('disabled>SAVE &amp; NEXT','>SAVE &amp; NEXT');
 if(state!=='recognized')content=content.replace('class="expiryEvidence" hidden','class="expiryEvidence"');
 if(state==='photos'){
 const photo=role=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="160" height="48" fill="#eef4ff"/><text x="80" y="28" font-size="12" text-anchor="middle" fill="#243b55">Synthetic ${role} photo</text></svg>`);
 content=content.replace('<div id="expiryEvidencePreviews"></div>',`<div id="expiryEvidencePreviews"><img alt="Product photo" src="${photo('product')}"><img alt="Expiry photo" src="${photo('expiry')}"></div>`)
 .replace('id="btnExpiryPhoto" type="button"','id="btnExpiryPhoto" type="button" hidden')
 .replaceAll('type="button" hidden>Retake','type="button">Retake');
 }
 const doc=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body class="pfNextMode zebraDevice zebraExpiryActive"><main class="mainApplication"><div class="mainContent">${content}</div></main></body></html>`;
 return `<article><h2>${state} · 360 × 640</h2><iframe title="${state}" width="360" height="640" sandbox srcdoc="${escape(doc)}"></iframe></article>`;
}).join('');
fs.writeFileSync('dist-staging/expiry-visual-check.html',`<!doctype html><meta charset="utf-8"><title>Offline Expiry visual evidence</title><style>body{font:14px system-ui;background:#e8edf4;margin:12px;color:#243b55}main{display:flex;gap:16px}iframe{border:0;display:block}h2{font-size:14px}</style><h1>Offline visual fixture — synthetic data, no backend or save execution</h1><main>${fixture}</main>`);
console.log('Prepared three isolated 360×640 presentation fixtures. No backend loaded.');
