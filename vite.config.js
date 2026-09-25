import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages Production is hosted below the repository path.
  // Vercel Test serves the same app at the domain root.
  base: process.env.VERCEL ? '/' : '/pharmacy-receiving-system/',
});
