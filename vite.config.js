import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  base: '/',
  build: {
    outDir: 'dist', // 部署目录将改为 dist
    emptyOutDir: true
  }
});
