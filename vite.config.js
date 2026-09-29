import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → dist/ (normal multi-file site)
// `npm run build:single` → dist-single/index.html (one self-contained file: JS and CSS inlined)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
}));
