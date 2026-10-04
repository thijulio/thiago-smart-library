import type { SqlClient } from './connection';

/** Inspect namespace dependencies, not just relations: routines/types also make a target nonempty. */
export async function assertEmptyBootstrapTarget(client: SqlClient, allowMarker = false) {
  const namespaces = await client.query(
    "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema') AND NOT ($1::boolean AND nspname='db_meta')",
    [allowMarker],
  );
  // PostgreSQL records namespace dependencies for explicit schema objects across catalogs.
  // Marker indexes, constraints and composite/array types depend on the marker relation;
  // they have no independent namespace dependency. Allow only that one relation.
  const objects = await client.query(
    `SELECT count(*)::int AS n FROM pg_depend d
     JOIN pg_namespace n ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
     WHERE n.nspname IN ('public','db_meta')
       AND NOT ($1::boolean AND n.nspname='db_meta' AND d.classid='pg_class'::regclass
                AND d.objid=coalesce(to_regclass('db_meta.environment')::oid,0))`,
    [allowMarker],
  );
  if (namespaces.rows[0].n || objects.rows[0].n) throw new Error('UNAPPROVED_DATABASE_BOOTSTRAP');
}
