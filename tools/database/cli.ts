import { localPool, hostedPool } from '../../libs/database/src/connection';
import { initializeHostedEnvironment } from '../../libs/database/src/environment';
import { assertMarker, migrate, status } from '../../libs/database/src/migrate';
import {
  validateHostedTarget,
  validateInstanceId,
  validateLocalTarget,
} from '../../libs/database/src/target';
import { parseDatabaseArgs } from '../../libs/database/src/target-args';
const USAGE =
  'Usage: db:{migrate|status|doctor} --target local-test | db:{bootstrap|migrate|status|doctor} --target staging|production --confirm-host HOST [--confirm-production]; DB_MIGRATION_URL required; hosted commands except bootstrap need DB_TARGET_INSTANCE_ID';
async function main() {
  const args = process.argv.slice(2);
  // The package scripts prepend the command, so `pnpm db:migrate --help` arrives as [migrate, --help].
  if (args.includes('--help')) return console.log(USAGE);
  const { command, target } = parseDatabaseArgs(args);
  const hosted = target.kind === 'hosted';
  const url = hosted
    ? validateHostedTarget(process.env.DB_MIGRATION_URL, process.env, target.confirmHost).url
    : validateLocalTarget(process.env.DB_MIGRATION_URL, process.env).url;
  const purpose = hosted ? target.purpose : 'synthetic-test';
  const pool = hosted ? hostedPool(url) : localPool(url),
    client = await pool.connect();
  try {
    if (command === 'bootstrap' && hosted) {
      const marker = await initializeHostedEnvironment(client, target.purpose);
      return console.log(
        JSON.stringify({ purpose: marker.purpose, instanceId: marker.instance_id }),
      );
    }
    const instanceId = hosted ? validateInstanceId(process.env.DB_TARGET_INSTANCE_ID) : undefined;
    await assertMarker(client, instanceId, purpose);
    if (command === 'migrate') {
      await client.query("SELECT set_config('smart_library.purpose',$1,false)", [purpose]);
      console.log(JSON.stringify(await migrate(client, 'libs/database/migrations', purpose)));
    } else if (command === 'status') console.log(JSON.stringify(await status(client)));
    else
      console.log(
        JSON.stringify({
          marker: purpose,
          ...(
            await client.query(
              "SELECT current_user AS role,current_setting('server_version') AS version",
            )
          ).rows[0],
        }),
      );
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error('DATABASE_OPERATION_FAILED');
  process.exitCode = 1;
});
