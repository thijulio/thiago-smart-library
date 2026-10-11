import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localPool, type SqlClient } from '../../../libs/database/src/connection';
import {
  validateLocalTarget,
  validateDisposableContainer,
} from '../../../libs/database/src/target';
import { assertMarker, migrate } from '../../../libs/database/src/migrate';
import { PROJECT_SCHEMAS } from './model';
const adminUrl =
  'postgresql://sl_test_admin:sl_test_local_only@127.0.0.1:55433/smart_library_test_admin';
function docker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
  }).trim();
}
export function referenceContainer(): string {
  const ci = process.env.GITHUB_ACTIONS === 'true';
  const id = ci
    ? process.env.SCHEMA_REFERENCE_POSTGRES_CONTAINER
    : docker([
        'compose',
        '-f',
        'tools/database/compose.yaml',
        '-p',
        'smart-library-db-test',
        'ps',
        '-q',
        'postgres',
      ]);
  if (!id || !/^[a-f0-9]{12,64}$/.test(id)) throw new Error('UNSAFE_DUMP_CONTAINER');
  const info = JSON.parse(docker(['inspect', id]))[0];
  if (!info.State.Running || !['postgres:16.15', 'postgres:18.6'].includes(info.Config.Image))
    throw new Error('UNSAFE_DUMP_CONTAINER');
  if (!ci) validateDisposableContainer(info);
  return id;
}
export async function withReferenceDatabase<T>(
  work: (client: SqlClient, dump: () => Promise<string>) => Promise<T>,
): Promise<T> {
  const target = validateLocalTarget(process.env.DB_TEST_ADMIN_URL ?? adminUrl, process.env);
  const parsed = new URL(target.url);
  if (
    target.database !== 'smart_library_test_admin' ||
    parsed.port !== '55433' ||
    parsed.username !== 'sl_test_admin' ||
    parsed.password !== 'sl_test_local_only'
  )
    throw new Error('UNSAFE_DATABASE_TARGET');
  const container = referenceContainer();
  const admin = localPool(target.url);
  const name = 'smart_library_test_' + randomBytes(8).toString('hex');
  let allocated = false,
    instance: string | undefined;
  let pool: ReturnType<typeof localPool> | undefined;
  try {
    await assertMarker(admin);
    await admin.query('CREATE DATABASE "' + name + '"');
    allocated = true;
    parsed.pathname = '/' + name;
    pool = localPool(parsed.toString());
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('smart_library.purpose','synthetic-test',false)");
      await migrate(client, 'libs/database/migrations');
      instance = (await assertMarker(client)).instance_id;
      const dump = async () => {
        await assertMarker(client, instance);
        const observed = docker([
          'exec',
          container,
          'psql',
          '-U',
          'sl_test_admin',
          '-d',
          name,
          '-Atq',
          '-c',
          "SELECT instance_id::text||':'||purpose FROM db_meta.environment WHERE singleton",
        ]);
        if (observed !== instance + ':synthetic-test') throw new Error('UNSAFE_DUMP_INSTANCE');
        return (
          docker([
            'exec',
            container,
            'pg_dump',
            '-U',
            'sl_test_admin',
            '-d',
            name,
            '--schema-only',
            '--no-owner',
            ...PROJECT_SCHEMAS.map((s) => '--schema=' + s),
          ]) + '\n'
        );
      };
      return await work(client, dump);
    } finally {
      client.release();
    }
  } finally {
    await pool?.end();
    try {
      if (allocated) {
        // Never force-disconnect or remove an unverified database.
        const check = localPool(parsed.toString());
        try {
          await assertCleanupTarget(check, instance);
        } finally {
          await check.end();
        }
        await admin.query('DROP DATABASE "' + name + '"');
      }
    } finally {
      await admin.end();
    }
  }
}

async function assertCleanupTarget(check: ReturnType<typeof localPool>, instance?: string) {
  if (instance) await assertMarker(check, instance);
  else {
    const r = await check.query(
      "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')",
    );
    if (r.rows[0].n) throw new Error('UNSAFE_INCOMPLETE_DATABASE_CLEANUP');
  }
}
