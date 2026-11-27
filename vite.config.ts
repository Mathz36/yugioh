import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';

// Preload root .env so local and CI builds capture all Supabase configurations
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  envDir: path.resolve(__dirname, '.'),
  envPrefix: ['VITE_', 'SUPABASE_', 'NEXT_PUBLIC_'],
  define: {
    '__SUPABASE_URL__': JSON.stringify(supabaseUrl.trim()),
    '__SUPABASE_KEY__': JSON.stringify(supabaseKey.trim()),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
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
    proxy: {
      '/api/card-image': {
        target: 'https://images.ygoprodeck.com/images/cards',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/card-image/, ''),
      },
    },
  },
});
