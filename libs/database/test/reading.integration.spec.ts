import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES('reading-a','A','reading-a@example.test',true,now(),now()),('reading-b','B','reading-b@example.test',true,now(),now())`,
  );
  await db.owner.query(
    `INSERT INTO library.user_libraries(owner_user_id) VALUES('reading-a'),('reading-b')`,
  );
  for (const [id, status, rank, actor, archived] of [
    ['now', 'reading', null, 'reading-a', false],
    ['again', 'reread', null, 'reading-a', false],
    ['next', 'unread', 2, 'reading-a', false],
    ['wish', 'wishlist', 1, 'reading-a', false],
    ['no-rank', 'wishlist', null, 'reading-a', false],
    ['finished', 'read', 1, 'reading-a', false],
    ['archived', 'reading', null, 'reading-a', true],
    ['foreign', 'reading', null, 'reading-b', false],
  ] as const) {
    const b = await insertBookFixture(db.owner, { stableId: id, status });
    await db.owner.query(
      `UPDATE library.books SET next_rank=$2,why_next='Synthetic reason',archived_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1`,
      [b.id, rank, archived],
    );
    await db.owner.query(
      `INSERT INTO library.library_books(book_id,library_id) SELECT $1,id FROM library.user_libraries WHERE owner_user_id=$2`,
      [b.id, actor],
    );
  }
});
afterAll(async () => {
  await db?.dispose();
});
it('returns only owned unarchived current/explicit next books with nullable queue fields', async () => {
  const rows = (
    await db.appRuntime.query(`SELECT library.reading_for_user($1) AS books`, ['reading-a'])
  ).rows[0].books;
  expect(rows.map((b: { stableId: string }) => b.stableId).sort()).toEqual([
    'again',
    'next',
    'now',
    'wish',
  ]);
  expect(rows.find((b: { stableId: string }) => b.stableId === 'next')).toMatchObject({
    nextRank: 2,
    nextSlot: null,
    whyNext: 'Synthetic reason',
  });
  expect(
    (await db.appRuntime.query(`SELECT library.reading_for_user($1) AS books`, ['reading-b']))
      .rows[0].books,
  ).toMatchObject([{ stableId: 'foreign' }]);
  expect(
    (await db.appRuntime.query(`SELECT library.reading_for_user($1) AS books`, ['missing'])).rows[0]
      .books,
  ).toEqual([]);
});
it('does not grant the scoped reading routine to public readers or expose base tables', async () => {
  await expect(
    db.publicReader.query(`SELECT library.reading_for_user('reading-a')`),
  ).rejects.toThrow();
  await expect(db.appRuntime.query('SELECT next_rank FROM library.books')).rejects.toThrow();
});
