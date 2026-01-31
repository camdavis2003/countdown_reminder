import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        widget: resolve(__dirname, 'src/renderer/widget.html')
      }
    }
  }
});
