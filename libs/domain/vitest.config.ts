import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['libs/domain/src/**/*.spec.ts'] } });
