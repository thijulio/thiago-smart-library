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
it('preserves slug identity and independent child versions', async () => {
  const b = await insertBookFixture(db.owner, { stableId: 'legacy-book', title: 'Before' });
  await db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4)', [
    b.stableId,
    b.version,
    JSON.stringify({ title: 'After' }),
    randomUUID(),
  ]);
  expect(
    (await db.owner.query('SELECT stable_id,title FROM library.books WHERE id=$1', [b.id])).rows[0],
  ).toEqual({ stable_id: 'legacy-book', title: 'After' });
  await db.editor.query('SELECT library.patch_feedback($1,NULL,$2::jsonb,$3)', [
    b.stableId,
    JSON.stringify({ notes: 'Example note', rating: '4.5' }),
    randomUUID(),
  ]);
  await db.editor.query('SELECT library.patch_assessment($1,NULL,$2::jsonb,$3)', [
    b.stableId,
    JSON.stringify({ pros: 'Example benefit' }),
    randomUUID(),
  ]);
  await db.editor.query('SELECT library.patch_feedback($1,1,$2::jsonb,$3)', [
    b.stableId,
    JSON.stringify({ notes: 'Changed note' }),
    randomUUID(),
  ]);
  expect(
    (
      await db.owner.query('SELECT row_version FROM library.book_assessments WHERE book_id=$1', [
        b.id,
      ])
    ).rows[0].row_version,
  ).toBe('1');
});
it('fails deferred authors at commit without disabling constraints', async () => {
  const c = await db.owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      "INSERT INTO library.books(stable_id,title,platform,status,updated_by) VALUES('no-author','Example','Unknown','unread',session_user)",
    );
    await expect(c.query('COMMIT')).rejects.toThrow('BOOK_REQUIRES_AUTHOR');
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});
it.each(['', '\t\n', 'bad::identity'])('rejects invalid stable id %s', async (stableId) => {
  await expect(insertBookFixture(db.owner, { stableId })).rejects.toThrow();
});
it('rejects duplicate identity, author positions and missing foreign keys', async () => {
  const b = await insertBookFixture(db.owner);
  await expect(insertBookFixture(db.owner, { stableId: b.stableId })).rejects.toThrow();
  const a = (
    await db.owner.query(
      "INSERT INTO library.authors(name,name_key,updated_by) VALUES('Second','second',session_user) RETURNING id",
    )
  ).rows[0];
  await expect(
    db.owner.query('INSERT INTO library.book_authors VALUES($1,$2,1)', [b.id, a.id]),
  ).rejects.toThrow();
  await expect(
    db.owner.query('INSERT INTO library.book_genres VALUES($1,999999)', [b.id]),
  ).rejects.toThrow();
  await expect(
    db.owner.query("UPDATE library.books SET stable_id='changed' WHERE id=$1", [b.id]),
  ).rejects.toThrow('IMMUTABLE_IDENTITY');
});
it.each([
  { community_rating: 'NaN' },
  { community_rating: 'Infinity' },
  { community_rating: '4.555' },
  { community_rating: '6' },
  { series_volume: '2.5' },
  { word_count: 2147483648 },
  { next_rank: 32768 },
  { ratings_count: '-1' },
])('rejects invalid numeric payload %j', async (patch) => {
  const b = await insertBookFixture(db.owner);
  await expect(
    db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4)', [
      b.stableId,
      b.version,
      JSON.stringify(patch),
      randomUUID(),
    ]),
  ).rejects.toThrow();
});
it('rejects extra precision in feedback and assessment without rounding', async () => {
  const b = await insertBookFixture(db.owner);
  await expect(
    db.editor.query('SELECT library.patch_feedback($1,NULL,$2::jsonb,$3)', [
      b.stableId,
      JSON.stringify({ rating: '4.55' }),
      randomUUID(),
    ]),
  ).rejects.toThrow();
  await expect(
    db.editor.query('SELECT library.patch_assessment($1,NULL,$2::jsonb,$3)', [
      b.stableId,
      JSON.stringify({ personal_relevance: '4.555' }),
      randomUUID(),
    ]),
  ).rejects.toThrow();
});
it('hashes null, empty, unicode and exact numeric strings distinctly', async () => {
  const values = [null, '', 'é', '4.50'];
  const hashes = [];
  for (const v of values)
    hashes.push(
      (
        await db.owner.query("SELECT library.value_hash('books.title','text',$1::jsonb) AS h", [
          JSON.stringify(v),
        ])
      ).rows[0].h,
    );
  expect(new Set(hashes).size).toBe(4);
});
it('deleting final author link rolls back at commit; zero genres remain valid', async () => {
  const b = await insertBookFixture(db.owner);
  const c = await db.owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM library.book_authors WHERE book_id=$1', [b.id]);
    await expect(c.query('COMMIT')).rejects.toThrow('BOOK_REQUIRES_AUTHOR');
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
  expect(
    (await db.owner.query('SELECT count(*) FROM library.book_genres WHERE book_id=$1', [b.id]))
      .rows[0].count,
  ).toBe('0');
});
it('review state requires actor/time and content replacement clears acceptance', async () => {
  const b = await insertBookFixture(db.owner);
  await db.editor.query('SELECT library.patch_assessment($1,NULL,$2::jsonb,$3)', [
    b.stableId,
    '{"pros":"Example"}',
    randomUUID(),
  ]);
  await expect(
    db.owner.query("UPDATE library.book_assessments SET review_state='accepted' WHERE book_id=$1", [
      b.id,
    ]),
  ).rejects.toThrow();
  await db.owner.query(
    "UPDATE library.book_assessments SET review_state='accepted',reviewed_by=session_user,reviewed_at=now() WHERE book_id=$1",
    [b.id],
  );
  await db.editor.query('SELECT library.patch_assessment($1,1,$2::jsonb,$3)', [
    b.stableId,
    '{"pros":"Replacement"}',
    randomUUID(),
  ]);
  expect(
    (
      await db.owner.query(
        'SELECT review_state,reviewed_by,reviewed_at FROM library.book_assessments WHERE book_id=$1',
        [b.id],
      )
    ).rows[0],
  ).toEqual({ review_state: 'unreviewed', reviewed_by: null, reviewed_at: null });
});

it('rejects a title containing only whitespace', async () => {
  await expect(insertBookFixture(db.owner, { title: '\t\n' })).rejects.toThrow();
});
