import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export const dutyBranch='feature/duty-staging-20261104';
export const dutyPreview=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF===dutyBranch;
const stagingRef='tovkcakucyagvbzvlnks';
const stagingKey='sb_publishable_wck-im5qsFKt6-xCOlPZQw_lxBy3C7U';
export function dutyPreviewBuild(){return {
 name:'duty-staging-preview',
 transformIndexHtml:{order:'pre',handler(html){
  if(!dutyPreview)return html;
  html=html.replaceAll('zznoshzcyxmtwfbznjyr',stagingRef);
  const expiry=html.match(/<button class="sidebarItem"[^>]*data-page="expiry"[\s\S]*?<\/button>/)?.[0];
  if(!expiry)throw Error('Duty navigation anchor missing');
  html=html.replace(expiry,expiry+'\n<button class="sidebarItem" type="button" data-page="duty" aria-label="Duty" title="Duty"><span class="sidebarIcon"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6"/></svg></span><span>Duty</span></button>');
  html=html.replace('</head>','<link rel="stylesheet" href="css/duty.css">\n</head>');
  html=html.replace('<div class="mainContent">','<div class="mainContent"><section id="page-duty" class="appPage" aria-label="Duty"></section>');
  return html.replace('</body>','<script src="js/duty-model.js"></script><script src="js/duty.js"></script>\n</body>');
 }},
 closeBundle(){
  if(!dutyPreview)return;
  const out=resolve('dist');
  const configPath=resolve(out,'js/config.js');
  let config=readFileSync(configPath,'utf8').replace('"production"','"staging"');
  config=config.replace('routes:{','routes:{\n duty:{id:"duty",elementId:"page-duty",title:"Duty",subtitle:"Monthly employee planning"},');
  writeFileSync(configPath,config);
  const cloudPath=resolve(out,'js/supabase.js');
  let cloud=readFileSync(cloudPath,'utf8').replaceAll('zznoshzcyxmtwfbznjyr',stagingRef).replace(/publishableKey:"[^"]+"/,`publishableKey:"${stagingKey}"`);
  if(cloud.includes('zznoshzcyxmtwfbznjyr')||!cloud.includes(stagingKey))throw Error('Duty Staging isolation failed');
  writeFileSync(cloudPath,cloud);
  writeFileSync(resolve(out,'version.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA||'local-duty-stage-a',environment:'staging',supabaseRef:stagingRef,branch:dutyBranch,stage:'A'}));
  const builtHtml=readFileSync(resolve(out,'index.html'),'utf8');
  const cssLinks=(builtHtml.match(/<link[^>]*rel="stylesheet"[^>]*>/g)||[]).join('\n');
  writeFileSync(resolve(out,'duty-demo.html'),readFileSync('staging/duty-visual.html','utf8').replace('<!--DUTY_CSS-->',cssLinks));
 }
};}
