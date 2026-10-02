import type { SqlClient } from './connection';
import { assertMarker } from './migrate';
/** Only used after local target and container/service identity validation. */
export async function initializeTestAdmin(client: SqlClient) {
  const exists = await client.query("SELECT to_regclass('db_meta.environment') AS name");
  if (exists.rows[0].name) {
    await assertMarker(client);
    return;
  }
  const namespaces = await client.query(
    "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')",
  );
  const publicTables = await client.query(
    "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'",
  );
  if (namespaces.rows[0].n || publicTables.rows[0].n)
    throw new Error('UNAPPROVED_DATABASE_BOOTSTRAP');
  await client.query(
    "CREATE SCHEMA db_meta; CREATE TABLE db_meta.environment(singleton boolean PRIMARY KEY CHECK(singleton),instance_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),purpose text NOT NULL CHECK(purpose IN ('synthetic-test','staging','production'))); INSERT INTO db_meta.environment(singleton,purpose) VALUES(true,'synthetic-test')",
  );
}
