import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['libs/database/test/**/*.integration.spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
