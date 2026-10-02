import { beforeAll, afterAll, it, expect } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
it.each([
  'SELECT * FROM library.books',
  'SELECT * FROM library.book_feedback',
  'SELECT * FROM library.book_field_provenance',
  'SELECT * FROM import_audit.import_rows',
  'CREATE TABLE api_public.leak(id int)',
  'CREATE TABLE public.leak(id int)',
  'SET ROLE library_owner',
  "SELECT library.create_book('{}',gen_random_uuid())",
])('public reader denied: %s', async (sql) => {
  await expect(db.publicReader.query(sql)).rejects.toThrow();
});
it.each([
  'UPDATE library.books SET title=title',
  'DELETE FROM library.books',
  'TRUNCATE library.books',
  'CREATE TABLE library.leak(id int)',
  'SET ROLE library_owner',
  'SELECT * FROM import_audit.import_rows',
])('editor denied: %s', async (sql) => {
  await expect(db.editor.query(sql)).rejects.toThrow();
});
it('actual owner defaults deny new routine execution to PUBLIC', async () => {
  await db.owner.query(
    "SET ROLE library_owner; CREATE FUNCTION library.default_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'; RESET ROLE",
  );
  await expect(db.publicReader.query('SELECT library.default_probe()')).rejects.toThrow();
  await expect(db.editor.query('SELECT library.default_probe()')).rejects.toThrow();
});
it('private reader has explicit reads and no write', async () => {
  await insertBookFixture(db.owner);
  expect((await db.privateReader.query('SELECT count(*) FROM library.books')).rows[0].count).toBe(
    '1',
  );
  await expect(db.privateReader.query('DELETE FROM library.books')).rejects.toThrow();
});
it.each([
  'TRUNCATE library.books',
  'DELETE FROM library.books',
  'CREATE TABLE library.leak(id int)',
  'SET ROLE library_owner',
])('importer denied: %s', async (sql) => {
  await expect(db.importer.query(sql)).rejects.toThrow();
});
it('runtime public reader cannot create temporary database objects', async () => {
  await expect(db.publicReader.query('CREATE TEMP TABLE runtime_leak(id int)')).rejects.toThrow();
});
