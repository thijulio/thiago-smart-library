import type { SqlClient } from './connection';
import { assertMarker } from './migrate';
import { assertEmptyBootstrapTarget } from './bootstrap';
import type { HostedPurpose } from './target';
/** Only used after local target and container/service identity validation. */
export async function initializeTestAdmin(client: SqlClient) {
  const exists = await client.query("SELECT to_regclass('db_meta.environment') AS name");
  if (exists.rows[0].name) {
    await assertMarker(client);
    return;
  }
  await assertEmptyBootstrapTarget(client);
  await client.query(
    "CREATE SCHEMA db_meta; CREATE TABLE db_meta.environment(singleton boolean PRIMARY KEY CHECK(singleton),instance_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),purpose text NOT NULL CHECK(purpose IN ('synthetic-test','staging','production'))); INSERT INTO db_meta.environment(singleton,purpose) VALUES(true,'synthetic-test')",
  );
}
/** Only used after validateHostedTarget and explicit owner confirmation. */
export async function initializeHostedEnvironment(client: SqlClient, purpose: HostedPurpose) {
  const exists = await client.query("SELECT to_regclass('db_meta.environment') AS name");
  if (exists.rows[0].name) return assertMarker(client, undefined, purpose);
  await assertEmptyBootstrapTarget(client);
  await client.query(
    "CREATE SCHEMA db_meta; CREATE TABLE db_meta.environment(singleton boolean PRIMARY KEY CHECK(singleton),instance_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),purpose text NOT NULL CHECK(purpose IN ('synthetic-test','staging','production')))",
  );
  await client.query('INSERT INTO db_meta.environment(singleton,purpose) VALUES(true,$1)', [
    purpose,
  ]);
  return assertMarker(client, undefined, purpose);
}
