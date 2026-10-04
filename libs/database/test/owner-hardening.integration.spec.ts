import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
async function provenanceFields(bookId: string) {
  return (
    await db.owner.query(
      'SELECT field_name FROM library.book_field_provenance WHERE book_id=$1 ORDER BY field_name',
      [bookId],
    )
  ).rows.map((r) => r.field_name);
}
it('create records provenance only for fields the owner supplied', async () => {
  const author = (
    await db.owner.query(
      "INSERT INTO library.authors(name,name_key,updated_by) VALUES('Supplied Author',$1,session_user) RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  const created = (
    await db.editor.query('SELECT library.create_book($1::jsonb,$2) AS result', [
      JSON.stringify({
        title: 'Only Supplied',
        platform: 'Kindle',
        status: 'unread',
        author_ids: [author],
      }),
      randomUUID(),
    ])
  ).rows[0].result;
  expect(await provenanceFields(created.id)).toEqual([
    'books.authors',
    'books.platform',
    'books.status',
    'books.title',
  ]);
});
it('an empty child patch creates no placeholder row or provenance', async () => {
  const b = await insertBookFixture(db.owner);
  for (const [routine, table] of [
    ['patch_feedback', 'book_feedback'],
    ['patch_assessment', 'book_assessments'],
  ]) {
    for (const payload of ['{}', '{"notes":null}'].filter(
      (p) => routine === 'patch_feedback' || p === '{}',
    )) {
      const result = (
        await db.editor.query(`SELECT library.${routine}($1,NULL,$2::jsonb,$3) AS result`, [
          b.stableId,
          payload,
          randomUUID(),
        ])
      ).rows[0].result;
      expect(result.row_version).toBeNull();
      expect(
        (
          await db.owner.query(`SELECT count(*)::int AS n FROM library.${table} WHERE book_id=$1`, [
            b.id,
          ])
        ).rows[0].n,
      ).toBe(0);
    }
  }
  expect(await provenanceFields(b.id)).toEqual([]);
});
it('owner writes refuse isolation levels where request replay is unsafe', async () => {
  const b = await insertBookFixture(db.owner);
  const client = await db.editor.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await expect(
      client.query('SELECT library.patch_book($1,$2,$3::jsonb,$4)', [
        b.stableId,
        b.version,
        '{"title":"Repeatable"}',
        randomUUID(),
      ]),
    ).rejects.toThrow('READ_COMMITTED_REQUIRED');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
it.each([
  [{ community_rating: 'four' }, 'INVALID_NUMBER'],
  [{ word_count: '99999999999999999999' }, 'INVALID_INTEGER'],
  [{ finished_from: '2026-02-30' }, 'INVALID_DATE'],
])('invalid input %j raises %s', async (payload, code) => {
  const b = await insertBookFixture(db.owner);
  await expect(
    db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4)', [
      b.stableId,
      b.version,
      JSON.stringify(payload),
      randomUUID(),
    ]),
  ).rejects.toThrow(code);
});
it.each(['read', 'reading', 'reread', 'unread', 'wishlist', 'paused', 'abandoned'])(
  'accepts the prototype reading status %s',
  async (status) => {
    const b = await insertBookFixture(db.owner);
    const result = (
      await db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4) AS result', [
        b.stableId,
        b.version,
        JSON.stringify({ status }),
        randomUUID(),
      ])
    ).rows[0].result;
    expect(result.stable_id).toBe(b.stableId);
  },
);
