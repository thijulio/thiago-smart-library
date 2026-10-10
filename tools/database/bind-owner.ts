import { bindImportedLibrary } from '../../libs/database/src/ownership';
import { hostedPool, localPool } from '../../libs/database/src/connection';
import { assertMarker } from '../../libs/database/src/migrate';
import { parseDatabaseArgs } from '../../libs/database/src/target-args';
import {
  validateHostedTarget,
  validateInstanceId,
  validateLocalTarget,
} from '../../libs/database/src/target';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: db:bind-owner --target local-test | --target staging|production --confirm-host HOST [--confirm-production]; DB_OWNER_URL, LIBRARY_OWNER_USER_ID and hosted DB_TARGET_INSTANCE_ID required',
    );
    return;
  }
  const { target } = parseDatabaseArgs(['doctor', ...args]);
  const userId = process.env.LIBRARY_OWNER_USER_ID;
  if (!userId) throw new Error('VERIFIED_USER_REQUIRED');
  const hosted = target.kind === 'hosted';
  const url = hosted
    ? validateHostedTarget(process.env.DB_OWNER_URL, process.env, target.confirmHost).url
    : validateLocalTarget(process.env.DB_OWNER_URL, process.env).url;
  const pool = hosted ? hostedPool(url) : localPool(url);
  try {
    await assertMarker(
      pool,
      hosted ? validateInstanceId(process.env.DB_TARGET_INSTANCE_ID) : undefined,
      hosted ? target.purpose : 'synthetic-test',
    );
    console.log(JSON.stringify(await bindImportedLibrary(pool, userId)));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error('LIBRARY_OWNER_BINDING_FAILED');
  process.exitCode = 1;
});
