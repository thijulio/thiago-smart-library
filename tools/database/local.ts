import { validateDisposableContainer } from '../../libs/database/src/target';
import { spawnSync } from 'node:child_process';
import { localPool } from '../../libs/database/src/connection';
import { initializeTestAdmin } from '../../libs/database/src/environment';
import { assertMarker } from '../../libs/database/src/migrate';
import { syntheticAdminUrl } from '../../libs/database/test/harness';
const args = process.argv.slice(2);
const compose = ['compose', '-f', 'tools/database/compose.yaml', '-p', 'smart-library-db-test'];
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('DOCKER_OPERATION_FAILED');
  return r.stdout.trim();
}
async function main() {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm db:up | pnpm db:down (synthetic disposable data only)');
    return;
  }
  if (args.length !== 1 || !['up', 'down'].includes(args[0])) throw new Error('INVALID_ARGUMENTS');
  const existing = docker([...compose, 'ps', '-a', '-q', 'postgres']);
  if (existing) validateDisposableContainer(JSON.parse(docker(['inspect', existing]))[0]);
  if (args[0] === 'up') docker([...compose, 'up', '-d', '--wait']);
  const id = docker([...compose, 'ps', '-q', 'postgres']);
  if (!id) throw new Error('MISSING_TEST_CONTAINER');
  const info = JSON.parse(docker(['inspect', id]))[0];
  validateDisposableContainer(info);
  const pool = localPool(syntheticAdminUrl);
  try {
    if (args[0] === 'up') await initializeTestAdmin(pool);
    await assertMarker(pool);
  } finally {
    await pool.end();
  }
  if (args[0] === 'down') docker([...compose, 'down']);
  console.log(args[0] === 'up' ? 'SYNTHETIC_DATABASE_READY' : 'SYNTHETIC_DATABASE_DESTROYED');
}
main().catch(() => {
  console.error('LOCAL_DATABASE_OPERATION_FAILED');
  process.exitCode = 1;
});
