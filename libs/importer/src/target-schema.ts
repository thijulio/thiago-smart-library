import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { validateLocalTarget, assertMarker } from '@smart-library/database';
import { sha256Bytes } from './canonical-json';
export type ImportTarget = { kind: 'local-test' };
export async function assertImportTarget(
  db: Pool,
  target: ImportTarget = { kind: 'local-test' },
): Promise<{ name: string; checksum: string }[]> {
  if (target.kind !== 'local-test') throw new Error('INVALID_TARGET');
  validateLocalTarget(db.options.connectionString, process.env);
  await assertMarker(db);
  if (
    (await db.query("SELECT pg_has_role(current_user,'library_owner','USAGE') AS owner")).rows[0]
      .owner
  )
    throw new Error('PRIVILEGED_IMPORT_LOGIN');
  const directory = 'libs/database/migrations';
  const names = (await readdir(directory)).filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  const expected = await Promise.all(
    names.map(async (name) => ({
      name,
      checksum: sha256Bytes(await readFile(join(directory, name))),
    })),
  );
  const actual = (
    await db.query('SELECT name,checksum FROM db_meta.schema_migrations ORDER BY name')
  ).rows;
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('IMPORT_SCHEMA_MISMATCH');
  return expected;
}
