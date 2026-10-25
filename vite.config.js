import { defineConfig } from 'vite';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function copyLegacyRuntime(){
  return {
    name: 'pharmflow-copy-legacy-runtime',
    closeBundle(){
      const out=resolve('dist');
      mkdirSync(out,{recursive:true});
      if(existsSync('js')) cpSync('js',resolve(out,'js'),{recursive:true});
      // The PDF-only embedded font is loaded lazily by the classic report runtime.
      if(existsSync('assets/fonts')) cpSync('assets/fonts',resolve(out,'assets/fonts'),{recursive:true});
      for(const file of ['ui.js','cloud-workspace.js']){
        if(existsSync(file)) copyFileSync(file,resolve(out,file));
      }
    }
  };
}

// This temporary raw-input diagnostic is never referenced by the source HTML.
// Only the approved Staging Preview build emits and loads its activated copy.
const stagingScanDiagnostic = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'fix/staging-preview-splash-css-path';
function copyStagingScanDiagnostic(){
  return {
    name:'pharmflow-staging-failed-scan-diagnostic',
    transformIndexHtml(){
      return stagingScanDiagnostic ? [{tag:'script',attrs:{src:'/js/expiry-failed-scan-diagnostic.js'},injectTo:'body'}] : [];
    },
    closeBundle(){
      if(stagingScanDiagnostic){
        const source=readFileSync('staging/expiry-failed-scan-diagnostic.js','utf8');
        writeFileSync(resolve('dist/js/expiry-failed-scan-diagnostic.js'),source.replace('__PHARMFLOW_STAGING_DIAGNOSTIC_BUILD__','staging-preview'));
      }
    }
  };
}

const isVercelBuild = process.env.VERCEL === '1'
  || process.env.VERCEL === 'true'
  || ['preview', 'production'].includes(process.env.VERCEL_ENV);

function productionAuthorizationRelease(){
  return {
    name:'production-authorization-release',
    configResolved(config){
      if(config.command==='build' && process.env.VERCEL &&
          (process.env.VERCEL_ENV!=='production' ||
           process.env.VERCEL_GIT_COMMIT_REF!=='main')){
        throw new Error('Production release requires main and Production configuration');
      }
    },
    transformIndexHtml(html){
      return html.replace('__PHARMFLOW_BUILD_SHA__',process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'local-production-authorization');
    },
    closeBundle(){
      writeFileSync(resolve('dist/version.json'),JSON.stringify({
        sha:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'local-production-authorization',
        environment:'production',supabaseRef:'zznoshzcyxmtwfbznjyr'
      }));
    }
  };
}

export default defineConfig({
  // Production GitHub Pages keeps the repository path. Vercel Test uses root.
  base: isVercelBuild ? '/' : '/pharmacy-receiving-system/',
  plugins:[productionAuthorizationRelease(),copyLegacyRuntime(),copyStagingScanDiagnostic()]
});
