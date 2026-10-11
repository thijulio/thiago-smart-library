import { expect, it } from 'vitest';
import { renderReference } from './render';
import { validateReference } from './validate';
import type { SchemaReference } from './model';
const fixture: SchemaReference = {
  sourceCommit: 'a'.repeat(40),
  postgresVersion: '16.15',
  migrations: [{ name: '0001_example.sql', checksum: 'b'.repeat(64) }],
  schemas: ['auth', 'library', 'import_audit', 'db_meta', 'api_public'],
  objects: [
    {
      id: 'table:auth:user:',
      kind: 'table',
      schema: 'auth',
      name: 'user',
      definition: '',
      privileges: ['library_app_runtime:SELECT'],
      columns: [
        {
          name: 'id',
          type: 'text',
          nullable: false,
          default: null,
          identity: '',
          generated: '',
          comment: null,
          privileges: [],
        },
      ],
      details: {},
    },
    {
      id: 'table:library:books:',
      kind: 'table',
      schema: 'library',
      name: 'books',
      definition: '<script>private_fixture_marker</script>',
      columns: [],
      privileges: [],
      details: {},
    },
  ],
  relationships: [
    {
      id: 'constraint:library:owner_fk:',
      from: 'table:library:books:',
      to: 'table:auth:user:',
      fromColumns: ['owner_id'],
      toColumns: ['id'],
    },
  ],
};
it('renders full navigation, relationships, escaped DDL and download', async () => {
  const files = await renderReference(fixture, 'CREATE TABLE auth."user"(id text);', 'Future work');
  const html = String(files['index.html']);
  expect(html).toContain('repository schema at commit');
  expect(html).toContain('a'.repeat(40));
  expect(html).toContain('data-object-id="table:auth:user:"');
  expect(html).toContain('data-relationship-id="constraint:library:owner_fk:"');
  expect(html).toContain('&lt;script&gt;private_fixture_marker&lt;/script&gt;');
  expect(html).not.toContain('<script>private_fixture_marker</script>');
  expect(html).toContain('href="./schema.sql"');
  expect(html).toContain('library_app_runtime:SELECT');
  expect(files['assets/biome.css']).toBeDefined();
});
it('rejects incomplete output and prohibited artifact paths', async () => {
  const clean = { ...fixture, objects: fixture.objects.map((o) => ({ ...o, definition: '' })) };
  const sql = 'CREATE TABLE auth."user"(id text);';
  const files = await renderReference(clean, sql, 'Future work');
  expect(() => validateReference(clean, sql, files)).not.toThrow();
  expect(() => validateReference(clean, sql, { ...files, '../secret.txt': 'blocked' })).toThrow(
    'UNSAFE_SCHEMA_ARTIFACT',
  );
  expect(() =>
    validateReference(clean, sql, {
      ...files,
      'index.html': String(files['index.html']).replace('data-object-id="table:auth:user:"', ''),
    }),
  ).toThrow('INCOMPLETE_SCHEMA_REFERENCE');
  expect(() =>
    validateReference(clean, sql, {
      ...files,
      'schema.sql': sql + '\npostgresql://synthetic:secret@example.test/db',
    }),
  ).toThrow('UNSAFE_SCHEMA_CONTENT');
  expect(() =>
    validateReference(clean, sql, { ...files, 'schema.sql': sql + '\nprivate_fixture_marker' }),
  ).toThrow('UNSAFE_SCHEMA_CONTENT');
  expect(() =>
    validateReference({ ...clean, objects: [...clean.objects, clean.objects[0]] }, sql, files),
  ).toThrow('INVALID_SCHEMA_MODEL');
});
