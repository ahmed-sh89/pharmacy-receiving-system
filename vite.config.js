import { defineConfig } from 'vite';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function classicScriptPreloads(){
  return [
    {
      name:'remove-source-classic-preloads',
      transformIndexHtml:{order:'pre',handler:html=>html.replace(/<link rel="preload" as="script"[^>]*>\s*/g,'')}
    },
    {
      name:'restore-emitted-classic-preloads',
      transformIndexHtml:{order:'post',handler(html){
        // Vite must not turn a classic preload into a different hashed asset:
        // preload the exact URL that the unchanged ordered script executes.
        const tags=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
          .filter(([tag,src])=>!tag.includes('type="module"') && !/^https?:/.test(src) && !src.endsWith('/startup-timing.js'));
        const links=tags.map(([tag,src])=>`<link rel="preload" as="script" href="${src}"${tag.match(/ integrity="[^"]+"/)?.[0]||''}>`).join('\n');
        return html.replace('</head>',links+'\n</head>');
      }}
    }
  ];
}

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

// This task's isolated Preview only. Default/local/Pages builds retain the
// reviewed Production configuration; arbitrary Preview branches still fail.
const startupStagingPreview = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'fix/startup-handheld-staging-20261108';
const dutyStagingPreview = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'fix/duty-exchange-staging-20261109-v2';
const receivingAdminStagingPreview = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'feature/missing-gtin-bulk-staging-20261109';
const receivingEmailStagingPreview = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'feature/receiving-email-item-wo';
const stagingPreview = startupStagingPreview || dutyStagingPreview || receivingAdminStagingPreview || receivingEmailStagingPreview;
const stagingRef = 'tovkcakucyagvbzvlnks';
function startupStagingConfiguration(){
  return {
    name:'startup-staging-configuration',
    transformIndexHtml(html){
      if(!stagingPreview)return html;
      html=html.replaceAll('zznoshzcyxmtwfbznjyr',stagingRef);
      return startupStagingPreview?html.replace('</head>','<script src="/js/startup-timing.js"></script></head>'):html;
    },
    closeBundle(){
      if(!stagingPreview) return;
      if(startupStagingPreview)copyFileSync('staging/startup-timing.js',resolve('dist/js/startup-timing.js'));
      const file=resolve('dist/js/supabase.js');
      const source=readFileSync(file,'utf8')
        .replace('https://zznoshzcyxmtwfbznjyr.supabase.co',`https://${stagingRef}.supabase.co`)
        .replace('sb_publishable_dulQyE_y0NZK2XyJyW_0TA_xhvwIxCS','sb_publishable_wck-im5qsFKt6-xCOlPZQw_lxBy3C7U');
      if(source.includes('zznoshzcyxmtwfbznjyr')) throw new Error('Production backend in Staging artifact');
      writeFileSync(file,source);
      const config=resolve('dist/js/config.js');
      writeFileSync(config,readFileSync(config,'utf8').replace('"production"','"staging"'));
      writeFileSync(resolve('dist/version.json'),JSON.stringify({
        sha:process.env.VERCEL_GIT_COMMIT_SHA||'local-startup-staging',
        environment:'staging',supabaseRef:stagingRef
      }));
    }
  };
}

function productionAuthorizationRelease(){
  return {
    name:'production-authorization-release',
    configResolved(config){
      if(config.command==='build' && process.env.VERCEL &&
          !stagingPreview && (process.env.VERCEL_ENV!=='production' ||
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
  plugins:[...classicScriptPreloads(),productionAuthorizationRelease(),copyLegacyRuntime(),copyStagingScanDiagnostic(),startupStagingConfiguration()]
});
