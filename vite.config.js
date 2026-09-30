import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → dist/ (normal multi-file site)
// `npm run build:single` → dist-single/index.html (one self-contained file: JS and CSS inlined)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  // three.js alone is ~510 kB minified (135 kB gzipped); the default 500 kB warning is just it
  build: { chunkSizeWarningLimit: 600, ...(mode === 'single' ? { outDir: 'dist-single' } : {}) },
}));
