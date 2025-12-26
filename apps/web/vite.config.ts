import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@dbs/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
