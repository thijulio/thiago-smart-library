import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: { outDir: '../../dist/apps/web', emptyOutDir: true },
  resolve: {
    alias: {
      '@smart-library/domain': resolve(__dirname, '../../libs/domain/src'),
      '@smart-library/data-access': resolve(__dirname, '../../libs/data-access/src'),
      '@smart-library/ui': resolve(__dirname, '../../libs/ui/src'),
    },
  },
});
