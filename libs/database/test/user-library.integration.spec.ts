import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
import { bindImportedLibrary } from '../src/ownership';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});

it('does not expose unassigned imported books and binds them only to a verified app user', async () => {
  const book = await insertBookFixture(db.owner, { stableId: 'synthetic-owner-book' });
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES('owner-user','Owner','owner@example.test',false,now(),now()),('other-user','Other','other@example.test',true,now(),now())`,
  );
  expect(
    (await db.appRuntime.query('SELECT library.catalog_for_user($1) AS books', ['owner-user']))
      .rows[0].books,
  ).toEqual([]);
  await expect(bindImportedLibrary(db.owner, 'owner-user')).rejects.toThrow(
    'VERIFIED_USER_REQUIRED',
  );
  await db.owner.query(`UPDATE auth."user" SET "emailVerified"=true WHERE id='owner-user'`);
  expect(await bindImportedLibrary(db.owner, 'owner-user')).toEqual({ assigned: 1 });
  expect(await bindImportedLibrary(db.owner, 'owner-user')).toEqual({ assigned: 0 });
  await expect(bindImportedLibrary(db.owner, 'other-user')).rejects.toThrow(
    'LIBRARY_ALREADY_BOUND',
  );
  const rows = (
    await db.appRuntime.query('SELECT library.catalog_for_user($1) AS books', ['owner-user'])
  ).rows[0].books;
  expect(rows).toMatchObject([
    { stableId: book.stableId, title: 'Example Book', authors: ['Example Author'] },
  ]);
  expect(
    (await db.appRuntime.query('SELECT library.catalog_for_user($1) AS books', ['other-user']))
      .rows[0].books,
  ).toEqual([]);
  expect(
    (
      await db.appRuntime.query('SELECT library.book_for_user($1,$2) AS book', [
        'other-user',
        book.stableId,
      ])
    ).rows[0].book,
  ).toBeNull();
  expect(
    (
      await db.appRuntime.query('SELECT library.book_for_user($1,$2) AS book', [
        'owner-user',
        book.stableId,
      ])
    ).rows[0].book,
  ).toMatchObject({ stableId: book.stableId });
});

it('runtime can persist sessions but cannot read base books, import records, or change ownership', async () => {
  await db.appRuntime.query(
    `INSERT INTO auth.verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES('synthetic-verification','synthetic','synthetic',now()+interval '1 hour',now(),now())`,
  );
  for (const sql of [
    'SELECT * FROM library.books',
    'SELECT * FROM import_audit.import_runs',
    'SELECT * FROM library.user_libraries',
    'UPDATE library.library_books SET library_id=gen_random_uuid()',
    'CREATE TABLE auth.runtime_probe(id int)',
    'SET ROLE library_owner',
  ]) {
    await expect(db.appRuntime.query(sql)).rejects.toThrow();
  }
  expect(
    (
      await db.appRuntime.query(
        `SELECT has_function_privilege(current_user,'library.patch_book(text,bigint,jsonb,uuid)','EXECUTE') AS allowed`,
      )
    ).rows[0].allowed,
  ).toBe(false);
});
