import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SqlClient } from '../../../libs/database/src/connection';
import { migrationFiles, status } from '../../../libs/database/src/migrate';
import { PROJECT_SCHEMAS, type SchemaReference, type SchemaObject, type Column } from './model';

export function objectId(kind: string, schema: string, name: string, args = '') {
  return [kind, schema, name, args].map(encodeURIComponent).join(':');
}
export function assertSupportedCatalogKinds(objects: { catalog: string; name: string }[]) {
  const supported = [
    'pg_class',
    'pg_type',
    'pg_proc',
    'pg_constraint',
    'pg_default_acl',
    'pg_rewrite',
    'pg_trigger',
    'pg_attrdef',
    'pg_policy',
  ];
  if (objects.some((o) => !supported.includes(o.catalog)))
    throw new Error('UNSUPPORTED_SCHEMA_OBJECT');
}
const schemas = [...PROJECT_SCHEMAS];
function groupAcl(value: string | null): string[] {
  // aclitem text has no passwords; exclude disposable/login role grantees.
  return value
    ? value
        .split('\n')
        .filter((line) => /^(PUBLIC|library_[a-z_]+):/.test(line))
        .sort()
    : [];
}
const aclSql =
  "SELECT string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END || ':' || a.privilege_type || CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END,E'\\n' ORDER BY a.grantee,a.privilege_type) FROM aclexplode(ACL_EXPR) a LEFT JOIN pg_roles r ON r.oid=a.grantee";
function acl(expression: string) {
  return '(' + aclSql.replace('ACL_EXPR', expression) + ')';
}

async function readColumns(client: SqlClient, relationOid: number): Promise<Column[]> {
  return (
    await client.query(
      'SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,pg_get_expr(d.adbin,d.adrelid) AS default,a.attidentity AS identity,a.attgenerated AS generated,col_description(a.attrelid,a.attnum) AS comment,' +
        acl('a.attacl') +
        ' AS acl FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum',
      [relationOid],
    )
  ).rows.map((c) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable,
    default: c.default,
    identity: c.identity,
    generated: c.generated,
    comment: c.comment,
    privileges: groupAcl(c.acl),
  }));
}

export async function inspectReference(
  client: SqlClient,
  sourceCommit: string,
): Promise<SchemaReference> {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('INVALID_SOURCE_COMMIT');
  const dependencies = await client.query(
    "WITH RECURSIVE owned(classid,objid,objsubid) AS (SELECT 'pg_namespace'::regclass::oid,n.oid,0 FROM pg_namespace n WHERE n.nspname=ANY($1) UNION SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN owned o ON d.refclassid=o.classid AND d.refobjid=o.objid) SELECT DISTINCT classid::regclass::text AS catalog,pg_describe_object(classid,objid,objsubid) AS name FROM owned WHERE classid<>'pg_namespace'::regclass",
    [schemas],
  );
  assertSupportedCatalogKinds(dependencies.rows);
  const rules = await client.query(
    "SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND NOT (r.rulename='_RETURN' AND c.relkind IN ('v','m'))",
    [schemas],
  );
  if (rules.rowCount) throw new Error('UNSUPPORTED_SCHEMA_OBJECT');
  const unsupported = await client.query(
    "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind NOT IN ('r','p','v','m','S','i','I','c') UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='a' UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=ANY($1) AND t.typtype NOT IN ('c','e','d') AND t.typelem=0",
    [schemas],
  );
  if (unsupported.rowCount) throw new Error('UNSUPPORTED_SCHEMA_OBJECT');
  const objects: SchemaObject[] = [];
  const schemaRows = await client.query(
    'SELECT n.oid,n.nspname,' +
      acl("coalesce(n.nspacl,acldefault('n',n.nspowner))") +
      " AS acl,obj_description(n.oid,'pg_namespace') AS comment FROM pg_namespace n WHERE n.nspname=ANY($1) ORDER BY n.nspname",
    [schemas],
  );
  for (const n of schemaRows.rows)
    objects.push({
      id: objectId('schema', n.nspname, n.nspname),
      kind: 'schema',
      schema: n.nspname,
      name: n.nspname,
      definition: 'CREATE SCHEMA ' + n.nspname + ';',
      privileges: groupAcl(n.acl),
      details: { comment: n.comment },
    });
  const relations = await client.query(
    "SELECT c.oid,n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,pg_get_userbyid(c.relowner) AS owner,obj_description(c.oid,'pg_class') AS comment," +
      acl(
        "coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner))",
      ) +
      " AS acl,CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) WHEN c.relkind IN ('i','I') THEN pg_get_indexdef(c.oid) ELSE NULL END AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind<>'c' ORDER BY n.nspname,c.relname",
    [schemas],
  );
  const kinds: Record<string, string> = {
    r: 'table',
    p: 'partitioned table',
    v: 'view',
    m: 'materialized view',
    S: 'sequence',
    i: 'index',
    I: 'partitioned index',
  };
  for (const r of relations.rows) {
    const columns = await readColumns(client, r.oid);
    const sequence =
      r.relkind === 'S'
        ? (
            await client.query(
              'SELECT format_type(seqtypid,NULL) AS type,seqstart,seqincrement,seqmax,seqmin,seqcache,seqcycle FROM pg_sequence WHERE seqrelid=$1',
              [r.oid],
            )
          ).rows[0]
        : undefined;
    objects.push({
      id: objectId(kinds[r.relkind], r.schema, r.name),
      kind: kinds[r.relkind],
      schema: r.schema,
      name: r.name,
      definition: r.definition ?? '',
      columns: ['r', 'p', 'v', 'm'].includes(r.relkind) ? columns : undefined,
      privileges: groupAcl(r.acl),
      details: {
        owner: r.owner,
        comment: r.comment,
        rowSecurity: r.relrowsecurity,
        forceRowSecurity: r.relforcerowsecurity,
        options: r.reloptions,
        sequence,
      },
    });
  }
  const constraints = await client.query(
    'SELECT c.oid,c.conname,c.contype,n.nspname AS schema,cl.relname AS table_name,pg_get_constraintdef(c.oid,true) AS definition,c.condeferrable,c.condeferred,c.convalidated,cl.relkind,fn.nspname AS foreign_schema,fc.relname AS foreign_table,fc.relkind AS foreign_kind,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS from_columns,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS to_columns FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace LEFT JOIN pg_class cl ON cl.oid=c.conrelid LEFT JOIN pg_class fc ON fc.oid=c.confrelid LEFT JOIN pg_namespace fn ON fn.oid=fc.relnamespace WHERE n.nspname=ANY($1) ORDER BY n.nspname,c.conname',
    [schemas],
  );
  const relationships: SchemaReference['relationships'] = [];
  for (const c of constraints.rows) {
    const id = objectId('constraint', c.schema, (c.table_name ?? 'type') + '.' + c.conname);
    objects.push({
      id,
      kind: 'constraint',
      schema: c.schema,
      name: (c.table_name ?? 'type') + '.' + c.conname,
      definition: c.definition,
      privileges: [],
      details: {
        table: c.table_name,
        type: c.contype,
        deferrable: c.condeferrable,
        deferred: c.condeferred,
        validated: c.convalidated,
      },
    });
    if (c.contype === 'f') {
      if (!schemas.includes(c.foreign_schema)) throw new Error('RELATIONSHIP_OUTSIDE_PROJECT');
      relationships.push({
        id,
        from: objectId(kinds[c.relkind], c.schema, c.table_name),
        to: objectId(kinds[c.foreign_kind], c.foreign_schema, c.foreign_table),
        fromColumns: c.from_columns,
        toColumns: c.to_columns,
      });
    }
  }
  const routines = await client.query(
    "SELECT p.oid,n.nspname AS schema,p.proname AS name,p.prokind,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,obj_description(p.oid,'pg_proc') AS comment," +
      acl("coalesce(p.proacl,acldefault('f',p.proowner))") +
      ' AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) ORDER BY n.nspname,p.proname,p.oid',
    [schemas],
  );
  for (const r of routines.rows)
    objects.push({
      id: objectId(r.prokind === 'p' ? 'procedure' : 'function', r.schema, r.name, r.args),
      kind: r.prokind === 'p' ? 'procedure' : 'function',
      schema: r.schema,
      name: r.name,
      definition: r.definition,
      privileges: groupAcl(r.acl),
      details: {
        identityArguments: r.args,
        owner: r.owner,
        securityDefiner: r.prosecdef,
        settings: r.proconfig,
        comment: r.comment,
      },
    });
  const triggers = await client.query(
    'SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND NOT t.tgisinternal ORDER BY n.nspname,c.relname,t.tgname',
    [schemas],
  );
  for (const t of triggers.rows)
    objects.push({
      id: objectId('trigger', t.schema, t.table_name + '.' + t.name),
      kind: 'trigger',
      schema: t.schema,
      name: t.table_name + '.' + t.name,
      definition: t.definition,
      privileges: [],
      details: { enabled: t.tgenabled },
    });
  const types = await client.query(
    'SELECT t.oid,t.typrelid,n.nspname AS schema,t.typname AS name,t.typtype,format_type(t.typbasetype,t.typtypmod) AS base,t.typnotnull,t.typdefault,' +
      acl("coalesce(t.typacl,acldefault('T',t.typowner))") +
      " AS acl,ARRAY(SELECT e.enumlabel::text FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid WHERE n.nspname=ANY($1) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND c.relkind='c')) ORDER BY n.nspname,t.typname",
    [schemas],
  );
  for (const t of types.rows) {
    const columns = t.typtype === 'c' ? await readColumns(client, t.typrelid) : undefined;
    objects.push({
      id: objectId('type', t.schema, t.name),
      kind: 'type',
      schema: t.schema,
      name: t.name,
      columns,
      definition: '',
      privileges: groupAcl(t.acl),
      details: {
        category: t.typtype,
        base: t.base,
        notNull: t.typnotnull,
        default: t.typdefault,
        labels: t.labels,
      },
    });
  }
  const defaults = await client.query(
    'SELECT n.nspname AS schema,pg_get_userbyid(d.defaclrole) AS owner,d.defaclobjtype,' +
      acl('d.defaclacl') +
      " AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclrole IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'library_%') AND (n.nspname=ANY($1) OR d.defaclnamespace=0)",
    [schemas],
  );
  for (const d of defaults.rows)
    objects.push({
      id: objectId('default privileges', d.schema ?? 'db_meta', d.owner + ':' + d.defaclobjtype),
      kind: 'default privileges',
      schema: d.schema ?? 'db_meta',
      name: d.owner + ':' + d.defaclobjtype,
      definition: '',
      privileges: groupAcl(d.acl),
      details: { scope: d.schema ?? 'all schemas', owner: d.owner },
    });
  const policies = await client.query(
    'SELECT n.nspname AS schema,c.relname AS table_name,p.polname AS name,p.polcmd,p.polpermissive,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS with_check FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)',
    [schemas],
  );
  for (const p of policies.rows)
    objects.push({
      id: objectId('policy', p.schema, p.table_name + '.' + p.name),
      kind: 'policy',
      schema: p.schema,
      name: p.table_name + '.' + p.name,
      definition: '',
      privileges: [],
      details: {
        command: p.polcmd,
        permissive: p.polpermissive,
        using: p.using,
        withCheck: p.with_check,
      },
    });
  const files = migrationFiles(await readdir('libs/database/migrations'));
  const migrations = await Promise.all(
    files.map(async (name) => ({
      name,
      checksum: createHash('sha256')
        .update(await readFile(join('libs/database/migrations', name)))
        .digest('hex'),
    })),
  );
  if (JSON.stringify(migrations) !== JSON.stringify(await status(client)))
    throw new Error('MIGRATION_CHECKSUM_MISMATCH');
  const postgresVersion = (await client.query('SHOW server_version')).rows[0]
    .server_version as string;
  return {
    sourceCommit,
    postgresVersion,
    migrations,
    schemas: schemaRows.rows.map((n) => n.nspname),
    objects: objects.sort((a, b) => a.id.localeCompare(b.id)),
    relationships,
  };
}
