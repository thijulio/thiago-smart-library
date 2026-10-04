import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SqlClient } from './connection';
import { assertEmptyBootstrapTarget } from './bootstrap';
export function migrationFiles(files: string[]): string[] {
  const sorted = [...files].sort();
  if (
    !sorted.length ||
    sorted.some(
      (name, index) =>
        !/^\d{4}_[a-z0-9_]+\.sql$/.test(name) || Number(name.slice(0, 4)) !== index + 1,
    )
  )
    throw new Error('INVALID_MIGRATION_DIRECTORY');
  return sorted;
}
export async function status(client: SqlClient): Promise<{ name: string; checksum: string }[]> {
  const exists = await client.query("SELECT to_regclass('db_meta.schema_migrations') AS name");
  return exists.rows[0].name
    ? (await client.query('SELECT name,checksum FROM db_meta.schema_migrations ORDER BY name')).rows
    : [];
}
export async function assertMarker(
  client: SqlClient,
  instanceId?: string,
  purpose: 'synthetic-test' | 'staging' = 'synthetic-test',
) {
  const exists = await client.query("SELECT to_regclass('db_meta.environment') AS name");
  if (!exists.rows[0].name) throw new Error('MISSING_DATABASE_MARKER');
  const marker = (
    await client.query('SELECT instance_id,purpose FROM db_meta.environment WHERE singleton')
  ).rows[0];
  if (marker?.purpose !== purpose || (instanceId && marker.instance_id !== instanceId))
    throw new Error('UNSAFE_DATABASE_MARKER');
  return marker as { instance_id: string; purpose: string };
}
/** Caller checks out one direct client and validates its target before this call. */
export async function migrate(
  client: SqlClient,
  directory: string,
  expectedPurpose: 'synthetic-test' | 'staging' = 'synthetic-test',
): Promise<{ applied: string[]; unchanged: string[] }> {
  const files = migrationFiles(await readdir(directory));
  const entries = await Promise.all(
    files.map(async (name) => {
      const bytes = await readFile(join(directory, name));
      return {
        name,
        sql: bytes.toString('utf8'),
        checksum: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
  await client.query('SELECT pg_advisory_lock(73421,1)');
  const applied: string[] = [],
    unchanged: string[] = [];
  try {
    const history = await status(client);
    if (history.some((row, i) => row.name !== entries[i]?.name))
      throw new Error('MIGRATION_HISTORY_DIVERGED');
    for (const [i, row] of history.entries())
      if (row.checksum !== entries[i].checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
    if (history.length) await assertMarker(client, undefined, expectedPurpose);
    else {
      // Empty targets alone may bootstrap. Purpose must be explicitly set by validated local adapter.
      const purpose = (
        await client.query("SELECT current_setting('smart_library.purpose',true) AS purpose")
      ).rows[0].purpose;
      const markerExists = (await client.query("SELECT to_regclass('db_meta.environment') AS name"))
        .rows[0].name;
      if (markerExists) await assertMarker(client, undefined, expectedPurpose);
      if (purpose !== expectedPurpose) throw new Error('UNAPPROVED_DATABASE_BOOTSTRAP');
      await assertEmptyBootstrapTarget(client, true);
    }
    for (const [i, entry] of entries.entries()) {
      if (i < history.length) {
        unchanged.push(entry.name);
        continue;
      }
      await client.query('BEGIN');
      try {
        if (i === 0)
          await client.query(
            'CREATE SCHEMA IF NOT EXISTS db_meta; CREATE TABLE db_meta.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
          );
        else await client.query('SET LOCAL ROLE library_owner');
        await client.query(entry.sql);
        await client.query('INSERT INTO db_meta.schema_migrations(name,checksum) VALUES ($1,$2)', [
          entry.name,
          entry.checksum,
        ]);
        await client.query('COMMIT');
        applied.push(entry.name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return { applied, unchanged };
  } finally {
    await client.query('SELECT pg_advisory_unlock(73421,1)');
  }
}
