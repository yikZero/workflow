import { resolve } from 'node:path';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { workflow } from 'workflow/vite';

export default defineConfig({
  plugins: [nitro(), workflow()],
  resolve: {
    alias: {
      '@repo': resolve(__dirname, '../..'),
    },
  },
  nitro: {
    serverDir: './',
    plugins: ['plugins/start-pg-world.ts'],
  },
});
