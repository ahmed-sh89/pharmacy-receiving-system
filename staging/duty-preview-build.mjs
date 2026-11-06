import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export const dutyBranch='feature/duty-workflow-staging-20261107';
export const dutyPreview=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF===dutyBranch;
const stagingRef='tovkcakucyagvbzvlnks';
const stagingKey='sb_publishable_wck-im5qsFKt6-xCOlPZQw_lxBy3C7U';
export function dutyPreviewBuild(){return {
 name:'duty-staging-preview',
 transformIndexHtml:{order:'pre',handler(html){
  if(!dutyPreview)return html;
  html=html.replaceAll('zznoshzcyxmtwfbznjyr',stagingRef);
  return html;
 }},
 closeBundle(){
  if(!dutyPreview)return;
  const out=resolve('dist');
  const configPath=resolve(out,'js/config.js');
  let config=readFileSync(configPath,'utf8').replace('"production"','"staging"');

  writeFileSync(configPath,config);
  const cloudPath=resolve(out,'js/supabase.js');
  let cloud=readFileSync(cloudPath,'utf8').replaceAll('zznoshzcyxmtwfbznjyr',stagingRef).replace(/publishableKey:"[^"]+"/,`publishableKey:"${stagingKey}"`);
  if(cloud.includes('zznoshzcyxmtwfbznjyr')||!cloud.includes(stagingKey))throw Error('Duty Staging isolation failed');
  writeFileSync(cloudPath,cloud);
  writeFileSync(resolve(out,'version.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA||'local-duty-stage-a',environment:'staging',supabaseRef:stagingRef,branch:dutyBranch,stage:'B'}));
  const builtHtml=readFileSync(resolve(out,'index.html'),'utf8');
  const cssLinks=(builtHtml.match(/<link[^>]*rel="stylesheet"[^>]*>/g)||[]).join('\n');
  writeFileSync(resolve(out,'duty-demo.html'),readFileSync('staging/duty-visual.html','utf8').replace('<!--DUTY_CSS-->',cssLinks));
 }
};}
