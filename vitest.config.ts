import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'client/src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@duel': path.resolve(__dirname, 'src/duel'),
    },
  },
});

