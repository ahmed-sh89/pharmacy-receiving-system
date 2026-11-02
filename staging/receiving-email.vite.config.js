// Preview-only overlay. Production source/configuration remains unchanged.
import { defineConfig } from 'vite';
import production from '../vite.config.js';
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const branch='fix/receiving-email-visual-staging-20261103';
const productionRef='zznoshzcyxmtwfbznjyr',stagingRef='tovkcakucyagvbzvlnks';
export default defineConfig({
  ...production,
  base:'/',
  plugins:[...production.plugins.filter(plugin=>plugin.name!=='production-authorization-release'),{
    name:'receiving-email-staging-only',
    configResolved(){
      if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!==branch){
        throw Error('Email acceptance build requires the exact Staging Preview branch');
      }
    },
    transformIndexHtml(html){
      return html.replaceAll(productionRef,stagingRef).replace('__PHARMFLOW_BUILD_SHA__',process.env.VERCEL_GIT_COMMIT_SHA);
    },
    closeBundle(){
      const file=resolve('dist/js/supabase.js');
      const source=readFileSync(file,'utf8');
      if(!source.includes(`https://${productionRef}.supabase.co`))throw Error('Unexpected source configuration');
      writeFileSync(file,source.replaceAll(productionRef,stagingRef).replace(/publishableKey:"[^"]+"/,'publishableKey:"sb_publishable_wck-im5qsFKt6-xCOlPZQw_lxBy3C7U"'));
      const config=resolve('dist/js/config.js');
      writeFileSync(config,readFileSync(config,'utf8').replace('"production"','"staging"'));
      writeFileSync(resolve('dist/version.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA,environment:'staging',supabaseRef:stagingRef}));
      copyFileSync('staging/receiving-email-preview.html','dist/receiving-email-preview.html');
      copyFileSync('tests/fixtures/receiving-email.fixture.js','dist/receiving-email.fixture.js');
      // Fail closed if any emitted runtime file can still target Production.
      function check(directory){
        for(const entry of readdirSync(directory,{withFileTypes:true})){
          const path=resolve(directory,entry.name);
          if(entry.isDirectory())check(path);
          else if(/\.(html|js|json)$/.test(entry.name)&&readFileSync(path,'utf8').includes(productionRef))throw Error(`Production reference in ${path}`);
        }
      }
      check(resolve('dist'));
    }
  }]
});
