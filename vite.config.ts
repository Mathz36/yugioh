import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  resolve: {
    alias: {
      '@duel': path.resolve(__dirname, 'src/duel'),
    },
  },
  server: {
    port: 3000,
    fs: {
      allow: ['..'],
    },
  },
});
