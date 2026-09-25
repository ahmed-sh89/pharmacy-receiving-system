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
      for(const file of ['ui.js','cloud-workspace.js']){
        if(existsSync(file)) copyFileSync(file,resolve(out,file));
      }
    }
  };
}

export default defineConfig({
  // Production GitHub Pages keeps the repository path. Vercel Test uses root.
  base: process.env.VERCEL ? '/' : '/pharmacy-receiving-system/',
  plugins:[copyLegacyRuntime()]
});
