import { validateLocalTarget } from '../../libs/database/src/target';
import { localPool } from '../../libs/database/src/connection';
import { assertMarker, migrate, status } from '../../libs/database/src/migrate';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: db:{migrate|status|doctor} --target local-test; explicit DB_MIGRATION_URL required',
    );
    return;
  }
  if (
    args.length !== 3 ||
    !['migrate', 'status', 'doctor'].includes(args[0]) ||
    args[1] !== '--target' ||
    args[2] !== 'local-test'
  )
    throw new Error('INVALID_ARGUMENTS');
  const target = validateLocalTarget(process.env.DB_MIGRATION_URL, process.env);
  const pool = localPool(target.url),
    client = await pool.connect();
  try {
    await assertMarker(client);
    if (args[0] === 'migrate')
      await client.query("SELECT set_config('smart_library.purpose','synthetic-test',false)");
    if (args[0] === 'migrate')
      console.log(JSON.stringify(await migrate(client, 'libs/database/migrations')));
    else if (args[0] === 'status') console.log(JSON.stringify(await status(client)));
    else
      console.log(
        JSON.stringify({
          marker: (await assertMarker(client)).purpose,
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
