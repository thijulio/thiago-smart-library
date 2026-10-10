import { describe, expect, it } from 'vitest';
import { withReferenceDatabase } from '../../../tools/database/schema-reference/provision';
import { inspectReference } from '../../../tools/database/schema-reference/catalog';
import { localPool } from '../src/connection';
import { syntheticAdminUrl } from './harness';

const commit = 'a'.repeat(40);
describe('schema reference on real disposable PostgreSQL', () => {
  it('includes final ALTER structure, bootstrap metadata and every project relation', async () => {
    await withReferenceDatabase(async (client, dump) => {
      const model = await inspectReference(client, commit);
      expect(
        model.objects.find((o) => o.schema === 'db_meta' && o.name === 'schema_migrations'),
      ).toBeDefined();
      const run = model.objects.find(
        (o) => o.kind === 'table' && o.schema === 'import_audit' && o.name === 'import_runs',
      )!;
      expect(run.columns?.map((c) => c.name)).toContain('result');
      const relations = await client.query(
        "SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('library','auth','import_audit','api_public','db_meta') AND c.relkind IN ('r','v','S','i','p','m','I') ORDER BY 1,2",
      );
      expect(
        model.objects
          .filter((o) =>
            [
              'table',
              'view',
              'sequence',
              'index',
              'materialized view',
              'partitioned table',
              'partitioned index',
            ].includes(o.kind),
          )
          .map((o) => [o.schema, o.name])
          .sort(),
      ).toEqual(relations.rows.map((r) => [r.schema, r.name]).sort());
      expect(
        model.relationships.some(
          (r) => r.from.includes('library_books') && r.to.includes('user_libraries'),
        ),
      ).toBe(true);
      expect(model.migrations.map((m) => m.name)).toContain('0006_user_libraries.sql');
      expect(await dump()).toContain('CREATE TABLE auth.');
    });
  });
  it('preserves FK column order and overloaded signatures without reading records', async () => {
    await withReferenceDatabase(async (client, dump) => {
      await client.query(`CREATE TABLE library.ref_parent(a integer,b integer,PRIMARY KEY(a,b));
        CREATE TABLE library.ref_child(x integer,y integer,FOREIGN KEY(y,x) REFERENCES library.ref_parent(a,b));
        CREATE FUNCTION library.ref_lookup(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
        CREATE FUNCTION library.ref_lookup(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1';
        INSERT INTO library.ref_parent VALUES(9274,9385);
        INSERT INTO auth."user"(id,name,email) VALUES('private_fixture_marker','private_fixture_marker','private_fixture_marker@example.test')`);
      const model = await inspectReference(client, commit);
      const edge = model.relationships.find((r) => r.from.includes('ref_child'))!;
      expect(edge.fromColumns).toEqual(['y', 'x']);
      expect(edge.toColumns).toEqual(['a', 'b']);
      const ids = model.objects.filter((o) => o.name === 'ref_lookup').map((o) => o.id);
      expect(new Set(ids).size).toBe(2);
      expect(JSON.stringify(model)).not.toContain('private_fixture_marker');
      expect(await dump()).not.toContain('private_fixture_marker');
    });
  });
  it('rejects unsupported new catalog families', async () => {
    await withReferenceDatabase(async (client) => {
      await client.query(
        'CREATE TEXT SEARCH DICTIONARY library.ref_dictionary(TEMPLATE=pg_catalog.simple)',
      );
      await expect(inspectReference(client, commit)).rejects.toThrow('UNSUPPORTED_SCHEMA_OBJECT');
    });
  });
  it('represents ordered standalone composite attributes', async () => {
    await withReferenceDatabase(async (client) => {
      await client.query('CREATE TYPE library.ref_pair AS (a integer,b text)');
      const model = await inspectReference(client, commit);
      const pair = model.objects.find((o) => o.kind === 'type' && o.name === 'ref_pair');
      expect(pair?.columns?.map((c) => [c.name, c.type])).toEqual([
        ['a', 'integer'],
        ['b', 'text'],
      ]);
    });
  });
  it('rejects unrepresented table rules while allowing view return rules', async () => {
    await withReferenceDatabase(async (client) => {
      await client.query(
        'CREATE TABLE library.ref_table(a integer); CREATE VIEW library.ref_view AS SELECT a FROM library.ref_table',
      );
      await expect(inspectReference(client, commit)).resolves.toBeDefined();
      await client.query(
        'CREATE RULE ref_rule AS ON INSERT TO library.ref_table DO INSTEAD NOTHING',
      );
      await expect(inspectReference(client, commit)).rejects.toThrow('UNSUPPORTED_SCHEMA_OBJECT');
    });
  });
  it('rejects unsupported table-attached statistics', async () => {
    await withReferenceDatabase(async (client) => {
      await client.query(
        'CREATE TABLE library.ref_stats(a integer,b integer); CREATE STATISTICS library.ref_statistics ON a,b FROM library.ref_stats',
      );
      await expect(inspectReference(client, commit)).rejects.toThrow('UNSUPPORTED_SCHEMA_OBJECT');
    });
  });
  it('cleans a fresh database even when generation fails', async () => {
    let allocated = '';
    await expect(
      withReferenceDatabase(async (client) => {
        allocated = (await client.query('SELECT current_database() AS name')).rows[0].name;
        throw new Error('SYNTHETIC_GENERATION_FAILURE');
      }),
    ).rejects.toThrow('SYNTHETIC_GENERATION_FAILURE');
    const admin = localPool(syntheticAdminUrl);
    try {
      expect(
        (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [allocated])).rows,
      ).toHaveLength(0);
    } finally {
      await admin.end();
    }
  });
});
