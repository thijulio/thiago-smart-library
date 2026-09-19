import { build } from 'esbuild';
await build({
  entryPoints: ['apps/api/src/functions/health.ts', 'apps/api/src/functions/database-health.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outdir: 'dist/apps/api/functions',
  entryNames: '[name]',
  outExtension: { '.js': '.mjs' },
});
