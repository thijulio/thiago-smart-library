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
async function patch(stableId: string, version: string, payload: object, request = randomUUID()) {
  return db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4) AS result', [
    stableId,
    version,
    JSON.stringify(payload),
    request,
  ]);
}
it('two concurrent differing patches allow exactly one expected version', async () => {
  const b = await insertBookFixture(db.owner);
  const results = await Promise.allSettled([
    patch(b.stableId, b.version, { title: 'One' }),
    patch(b.stableId, b.version, { title: 'Two' }),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((x) => x.status === 'rejected')).toMatchObject({
    reason: { message: 'VERSION_CONFLICT' },
  });
});
it('same value is a no-op and attribution matches the SQL hash', async () => {
  const b = await insertBookFixture(db.owner, { title: 'Same' });
  await patch(b.stableId, b.version, { title: 'Same' });
  expect(
    (await db.owner.query('SELECT row_version FROM library.books WHERE id=$1', [b.id])).rows[0]
      .row_version,
  ).toBe('1');
  await patch(b.stableId, b.version, { title: 'Changed' });
  const r = await db.owner.query(
    "SELECT p.value_sha256=library.value_hash('books.title','text',to_jsonb(b.title)) AS valid,p.actor=b.updated_by AS actor FROM library.books b JOIN library.book_field_provenance p ON p.book_id=b.id WHERE b.id=$1 AND p.field_name='books.title'",
    [b.id],
  );
  expect(r.rows[0]).toEqual({ valid: true, actor: true });
});
it('retry uses original result and conflicting request is rejected', async () => {
  const b = await insertBookFixture(db.owner),
    request = randomUUID();
  const r = await patch(b.stableId, b.version, { title: 'Changed' }, request);
  expect((await patch(b.stableId, b.version, { title: 'Changed' }, request)).rows).toEqual(r.rows);
  await expect(patch(b.stableId, b.version, { title: 'Other' }, request)).rejects.toThrow(
    'REQUEST_CONFLICT',
  );
});
it.each([
  { updated_by: 'claim' },
  { row_version: 5 },
  { 'title); DROP TABLE library.books; --': 'attack' },
  { cover_url: 'javascript:alert(1)' },
  { cover_url: 'data:text/plain,test' },
  { cover_url: 'https://' },
])('rejects forbidden key/url %j', async (payload) => {
  const b = await insertBookFixture(db.owner);
  await expect(patch(b.stableId, b.version, payload)).rejects.toThrow();
});
it('child expected version cannot bypass conflicts', async () => {
  const b = await insertBookFixture(db.owner);
  await expect(
    db.editor.query('SELECT library.patch_feedback($1,1,$2::jsonb,$3)', [
      b.stableId,
      '{}',
      randomUUID(),
    ]),
  ).rejects.toThrow('VERSION_CONFLICT');
  await db.editor.query('SELECT library.patch_feedback($1,NULL,$2::jsonb,$3)', [
    b.stableId,
    '{"notes":"Example"}',
    randomUUID(),
  ]);
  await expect(
    db.editor.query('SELECT library.patch_feedback($1,NULL,$2::jsonb,$3)', [
      b.stableId,
      '{}',
      randomUUID(),
    ]),
  ).rejects.toThrow('VERSION_CONFLICT');
});
it('create retry yields one native UUID identity, archive retains it', async () => {
  const a = (
    await db.owner.query(
      "INSERT INTO library.authors(name,name_key,updated_by) VALUES('Native Author','native-author',session_user) RETURNING id",
    )
  ).rows[0];
  const request = randomUUID(),
    payload = JSON.stringify({
      title: 'Native Book',
      platform: 'Physical',
      status: 'unread',
      author_ids: [a.id],
    });
  const query = () =>
    db.editor.query('SELECT library.create_book($1::jsonb,$2) AS result', [payload, request]);
  const r = await Promise.all([query(), query()]);
  expect(r[0].rows).toEqual(r[1].rows);
  const b = r[0].rows[0].result;
  expect(b.stable_id).toMatch(/^[0-9a-f-]{36}$/);
  await db.editor.query('SELECT library.archive_book($1,$2,$3)', [
    b.stable_id,
    b.row_version,
    randomUUID(),
  ]);
  expect(
    (
      await db.privateReader.query(
        'SELECT archived_at IS NOT NULL AS archived FROM library.books WHERE stable_id=$1',
        [b.stable_id],
      )
    ).rows[0].archived,
  ).toBe(true);
});
it('normal writer waits behind the exclusive import gate', async () => {
  const b = await insertBookFixture(db.owner);
  const gate = await db.owner.connect();
  try {
    await gate.query('BEGIN');
    await gate.query('SELECT pg_advisory_xact_lock(73421,2)');
    let settled = false;
    const operation = patch(b.stableId, b.version, { title: 'After gate' }).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    await gate.query('COMMIT');
    await operation;
    expect(settled).toBe(true);
  } finally {
    await gate.query('ROLLBACK');
    gate.release();
  }
});
it('genre set order and numeric spelling do not change request semantics', async () => {
  const b = await insertBookFixture(db.owner);
  const genres = (
    await db.owner.query(
      "INSERT INTO library.genres(name,name_key,updated_by) VALUES('One genre','one-genre',session_user),('Two genre','two-genre',session_user) RETURNING id",
    )
  ).rows.map((r) => r.id);
  const request = randomUUID();
  const first = await patch(
    b.stableId,
    b.version,
    { genre_ids: genres, community_rating: '4.50' },
    request,
  );
  expect(
    (
      await patch(
        b.stableId,
        b.version,
        { genre_ids: [...genres].reverse(), community_rating: 4.5 },
        request,
      )
    ).rows,
  ).toEqual(first.rows);
});
