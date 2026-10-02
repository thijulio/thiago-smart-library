import { randomBytes } from 'node:crypto';
import { localPool } from '../src/connection';
import { validateLocalTarget } from '../src/target';
import { migrate, assertMarker } from '../src/migrate';
export const syntheticAdminUrl =
  'postgresql://sl_test_admin:sl_test_local_only@127.0.0.1:55433/smart_library_test_admin';
async function dropRecordedDatabase(admin: import('pg').Pool, name: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await admin.query(`DROP DATABASE "${name}"`);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== '55006') throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('DATABASE_CLEANUP_CONNECTIONS_ACTIVE');
}
export async function createTestDatabase() {
  const target = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  );
  const admin = localPool(target.url),
    suffix = randomBytes(8).toString('hex'),
    name = `smart_library_test_${suffix}`;
  const roles = [
    'owner',
    'importer',
    'editor',
    'private_reader',
    'public_reader',
    'ranking_worker',
  ] as const;
  const logins = roles.map((role) => `sl_${role}_${suffix}`);
  const pools = roles.map(() => localPool(target.url)); // replaced after provisioning
  const client = await admin.connect();
  let created = false,
    instanceId: string | undefined;
  try {
    await assertMarker(client);
    await client.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(target.url);
    url.pathname = '/' + name;
    const bootstrap = localPool(url.toString());
    const migration = await bootstrap.connect();
    try {
      await migration.query("SELECT set_config('smart_library.purpose','synthetic-test',false)");
      await migrate(migration, 'libs/database/migrations');
      instanceId = (await assertMarker(migration)).instance_id;
    } finally {
      migration.release();
      await bootstrap.end();
    }
    for (const [i, role] of roles.entries()) {
      await pools[i].end();
      await client.query(
        `CREATE ROLE "${logins[i]}" LOGIN PASSWORD 'sl_test_local_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      await client.query(`GRANT library_${role} TO "${logins[i]}"`);
      url.username = logins[i];
      url.password = 'sl_test_local_only';
      pools[i] = localPool(url.toString());
    }
  } catch (error) {
    if (created) await dropRecordedDatabase(admin, name);
    for (const login of logins) await client.query(`DROP ROLE IF EXISTS "${login}"`);
    await Promise.all(pools.map((p) => p.end()));
    throw error;
  } finally {
    client.release();
    if (!instanceId) await admin.end();
  }
  return {
    owner: pools[0],
    importer: pools[1],
    editor: pools[2],
    privateReader: pools[3],
    publicReader: pools[4],
    rankingWorker: pools[5],
    name,
    instanceId,
    async dispose() {
      const url = new URL(target.url);
      url.pathname = '/' + name;
      const check = localPool(url.toString());
      try {
        if (!/^smart_library_test_[a-f0-9]+$/.test(name) || !instanceId)
          throw new Error('UNSAFE_CLEANUP');
        await assertMarker(check, instanceId);
      } finally {
        await check.end();
      }
      await Promise.all(pools.map((p) => p.end()));
      try {
        await dropRecordedDatabase(admin, name);
        for (const login of logins) await admin.query(`DROP ROLE "${login}"`);
      } finally {
        await admin.end();
      }
    },
  };
}
