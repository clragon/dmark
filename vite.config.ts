import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/preview',
  server: {
    port: 6783,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@dmark': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/preview'),
    emptyOutDir: true,
  },
});
