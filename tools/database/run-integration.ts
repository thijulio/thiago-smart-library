import { spawnSync } from 'node:child_process';
import { validateLocalTarget } from '../../libs/database/src/target';
import { localPool } from '../../libs/database/src/connection';
import { assertMarker } from '../../libs/database/src/migrate';
import { syntheticAdminUrl } from '../../libs/database/test/harness';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm test:db (requires marked loopback PostgreSQL)');
    return;
  }
  if (args.length) throw new Error('INVALID_ARGUMENTS');
  const target = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  );
  const pool = localPool(target.url);
  try {
    await assertMarker(pool);
  } finally {
    await pool.end();
  }
  const result = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'libs/database/vitest.integration.config.ts'],
    { stdio: 'inherit', env: { ...process.env, DB_TEST_ADMIN_URL: target.url } },
  );
  process.exitCode = result.status ?? 1;
}
main().catch(() => {
  console.error('DATABASE_TEST_PREREQUISITE_FAILED');
  process.exitCode = 1;
});
