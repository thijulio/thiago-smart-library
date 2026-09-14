import { build } from 'esbuild';
await build({
  entryPoints: ['apps/api/src/functions/health.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outfile: 'dist/apps/api/functions/health.mjs',
});
