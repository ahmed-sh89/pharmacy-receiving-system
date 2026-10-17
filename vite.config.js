import { defineConfig } from 'vite';
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

const isVercelBuild = process.env.VERCEL === '1'
  || process.env.VERCEL === 'true'
  || ['preview', 'production'].includes(process.env.VERCEL_ENV);

export default defineConfig({
  // Production GitHub Pages keeps the repository path. Vercel Test uses root.
  base: isVercelBuild ? '/' : '/pharmacy-receiving-system/',
  plugins:[copyLegacyRuntime()]
});
