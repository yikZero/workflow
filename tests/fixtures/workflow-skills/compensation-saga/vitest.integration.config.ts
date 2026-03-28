import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { workflow } from '@workflow/vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [workflow()],
  test: {
    include: ['**/*.integration.test.ts'],
    testTimeout: 60_000,
  },
});
