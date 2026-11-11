import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let libraryA: string;
let libraryB: string;
let bookA: string;
let bookB: string;

beforeAll(async () => {
  db = await createTestDatabase();
  for (const actor of ['storage-a', 'storage-b']) {
    await db.owner.query(
      `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt")
       VALUES($1,'Synthetic reader',$1||'@example.test',true,now(),now())`,
      [actor],
    );
  }
  libraryA = (
    await db.owner.query(
      `INSERT INTO library.user_libraries(owner_user_id) VALUES('storage-a') RETURNING id`,
    )
  ).rows[0].id;
  libraryB = (
    await db.owner.query(
      `INSERT INTO library.user_libraries(owner_user_id) VALUES('storage-b') RETURNING id`,
    )
  ).rows[0].id;
  bookA = String((await insertBookFixture(db.owner, { stableId: 'storage-book-a' })).id);
  bookB = String((await insertBookFixture(db.owner, { stableId: 'storage-book-b' })).id);
  await db.owner.query(
    'INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2),($3,$4)',
    [bookA, libraryA, bookB, libraryB],
  );
});
afterAll(async () => {
  await db?.dispose();
});

it('adds isolated app-owned stores without granting runtime or public table access', async () => {
  for (const table of [
    'ai_result_streams',
    'ai_result_revisions',
    'reading_plan_streams',
    'reading_plan_revisions',
    'reading_plan_entries',
    'reading_plan_entry_judgments',
    'preference_evidence',
    'plan_deferrals',
    'app_operation_receipts',
  ]) {
    expect(
      (await db.owner.query('SELECT to_regclass($1) AS name', [`library.${table}`])).rows[0].name,
    ).not.toBeNull();
    // Names are a literal allowlist, never supplied by a client.
    await expect(db.appRuntime.query(`SELECT * FROM library.${table}`)).rejects.toThrow();
    await expect(db.publicReader.query(`SELECT * FROM library.${table}`)).rejects.toThrow();
    await expect(db.aiProducer.query(`SELECT * FROM library.${table}`)).rejects.toThrow();
  }
});

it('rejects a result stream referencing another library book', async () => {
  await expect(
    db.owner.query(
      `INSERT INTO library.ai_result_streams(library_id,book_id,kind) VALUES($1,$2,'enrichment')`,
      [libraryA, bookB],
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

it('cannot attach a result head from another stream, including within the same library', async () => {
  const first = (
    await db.owner.query(
      `INSERT INTO library.ai_result_streams(library_id,book_id,kind) VALUES($1,$2,'enrichment') RETURNING id`,
      [libraryA, bookA],
    )
  ).rows[0].id;
  const second = (
    await db.owner.query(
      `INSERT INTO library.ai_result_streams(library_id,book_id,kind) VALUES($1,$2,'taste') RETURNING id`,
      [libraryA, bookA],
    )
  ).rows[0].id;
  const revision = (
    await db.owner.query(
      `INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,1,'{}','{}',repeat('a',64),'synthetic-v1','{"kind":"application","id":"synthetic","version":"v1"}',now()) RETURNING id`,
      [first, libraryA],
    )
  ).rows[0].id;
  await expect(
    db.owner.query('UPDATE library.ai_result_streams SET head_revision_id=$1 WHERE id=$2', [
      revision,
      second,
    ]),
  ).rejects.toMatchObject({ code: '23503' });
  await db.owner.query('UPDATE library.ai_result_streams SET head_revision_id=$1 WHERE id=$2', [
    revision,
    first,
  ]);
});

it('keeps archived book revisions and rejects cross-library plan entries and heads', async () => {
  const stream = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_streams(library_id,platform) VALUES($1,'Kindle') RETURNING id`,
      [libraryA],
    )
  ).rows[0].id;
  const revision = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_revisions(stream_id,library_id,platform,revision,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,'Kindle',1,'{}',repeat('a',64),'synthetic-v1','{"kind":"application","id":"synthetic","version":"v1"}',now()) RETURNING id`,
      [stream, libraryA],
    )
  ).rows[0].id;
  await expect(
    db.owner.query(
      `INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    VALUES($1,$2,1,$3,'Synthetic reason','[]')`,
      [revision, libraryA, bookB],
    ),
  ).rejects.toMatchObject({ code: '23503' });
  await db.owner.query(
    `INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    VALUES($1,$2,1,$3,'Synthetic reason','[]')`,
    [revision, libraryA, bookA],
  );
  await expect(
    db.owner.query(
      `INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    VALUES($1,$2,2,$3,'Repeated book','[]')`,
      [revision, libraryA, bookA],
    ),
  ).rejects.toMatchObject({ code: '23505' });
  const foreign = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_streams(library_id,platform) VALUES($1,'Kindle') RETURNING id`,
      [libraryB],
    )
  ).rows[0].id;
  await expect(
    db.owner.query('UPDATE library.reading_plan_streams SET head_revision_id=$1 WHERE id=$2', [
      revision,
      foreign,
    ]),
  ).rejects.toMatchObject({ code: '23503' });
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE id=$1', [bookA]);
  expect(
    (
      await db.owner.query(
        'SELECT count(*)::int AS count FROM library.reading_plan_entries WHERE revision_id=$1',
        [revision],
      )
    ).rows[0].count,
  ).toBe(1);
});

it('rejects receipts attributed to another library owner', async () => {
  await expect(
    db.owner.query(
      `INSERT INTO library.app_operation_receipts(actor_user_id,library_id,operation,request_id,request_sha256,result)
    VALUES('storage-b',$1,'synthetic',gen_random_uuid(),repeat('b',64),'{}')`,
      [libraryA],
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

it('requires producer evidence for inferred preferences and preserves explicit authorship', async () => {
  const insert = `INSERT INTO library.preference_evidence(library_id,preference_id,revision,authorship,decision,statement,sources,producer,actor_user_id)
    VALUES($1,gen_random_uuid(),1,$2,'accepted','Synthetic preference',$3,$4,'storage-a')`;
  await expect(db.owner.query(insert, [libraryA, 'inferred', '[]', null])).rejects.toMatchObject({
    code: '23514',
  });
  await expect(
    db.owner.query(insert, [libraryA, 'explicit', '[]', '{"kind":"application"}']),
  ).rejects.toMatchObject({ code: '23514' });
  await db.owner.query(insert, [libraryA, 'explicit', '[]', null]);
  await db.owner.query(insert, [
    libraryA,
    'inferred',
    '[{"reference":"synthetic","revision":null}]',
    '{"kind":"model","id":"synthetic"}',
  ]);
});

it('rejects plan judgment references from another library', async () => {
  const resultStream = (
    await db.owner.query(
      `INSERT INTO library.ai_result_streams(library_id,book_id,kind) VALUES($1,$2,'taste') RETURNING id`,
      [libraryB, bookB],
    )
  ).rows[0].id;
  const foreignResult = (
    await db.owner.query(
      `INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,1,'{}','{}',repeat('a',64),'synthetic-v1','{}',now()) RETURNING id`,
      [resultStream, libraryB],
    )
  ).rows[0].id;
  const planStream = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_streams(library_id,platform) VALUES($1,'Audible') RETURNING id`,
      [libraryA],
    )
  ).rows[0].id;
  const revision = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_revisions(stream_id,library_id,platform,revision,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,'Audible',1,'{}',repeat('a',64),'synthetic-v1','{}',now()) RETURNING id`,
      [planStream, libraryA],
    )
  ).rows[0].id;
  await db.owner.query(
    `INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    VALUES($1,$2,1,$3,'Synthetic reason','[]')`,
    [revision, libraryA, bookA],
  );
  await expect(
    db.owner.query(
      `INSERT INTO library.reading_plan_entry_judgments(revision_id,position,library_id,result_revision_id)
    VALUES($1,1,$2,$3)`,
      [revision, libraryA, foreignResult],
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

it('keeps producer permissions at NOLOGIN without broad imported editor capability', async () => {
  const role = (
    await db.owner.query(
      `SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='library_ai_producer'`,
    )
  ).rows[0];
  expect(Object.values(role)).toEqual([false, false, false, false, false, false]);
  await expect(db.aiProducer.query('SET ROLE library_owner')).rejects.toThrow();
  await expect(
    db.aiProducer.query(`SELECT library.patch_book('synthetic',1,'{}',gen_random_uuid())`),
  ).rejects.toThrow();
});

it('prevents rewriting or extending published historical revisions', async () => {
  const original = String(
    (await insertBookFixture(db.owner, { stableId: 'storage-immutable' })).id,
  );
  await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
    original,
    libraryB,
  ]);
  const resultStream = (
    await db.owner.query(
      `INSERT INTO library.ai_result_streams(library_id,book_id,kind) VALUES($1,$2,'enrichment') RETURNING id`,
      [libraryB, original],
    )
  ).rows[0].id;
  const result = (
    await db.owner.query(
      `INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,1,'{}','{}',repeat('a',64),'synthetic-v1','{"kind":"application","id":"synthetic","version":"v1"}',now()) RETURNING id`,
      [resultStream, libraryB],
    )
  ).rows[0].id;
  await expect(
    db.owner.query(
      `UPDATE library.ai_result_revisions SET payload='{"changed":true}' WHERE id=$1`,
      [result],
    ),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
  await expect(
    db.owner.query('DELETE FROM library.ai_result_revisions WHERE id=$1', [result]),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
  const planStream = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_streams(library_id,platform) VALUES($1,'Audible') RETURNING id`,
      [libraryB],
    )
  ).rows[0].id;
  const plan = (
    await db.owner.query(
      `INSERT INTO library.reading_plan_revisions(stream_id,library_id,platform,revision,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
    VALUES($1,$2,'Audible',1,'{}',repeat('a',64),'synthetic-v1','{"kind":"application","id":"synthetic","version":"v1"}',now()) RETURNING id,stream_id`,
      [planStream, libraryB],
    )
  ).rows[0];
  await db.owner.query('UPDATE library.reading_plan_streams SET head_revision_id=$1 WHERE id=$2', [
    plan.id,
    plan.stream_id,
  ]);
  const another = String(
    (await insertBookFixture(db.owner, { stableId: 'storage-late-entry' })).id,
  );
  await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
    another,
    libraryB,
  ]);
  await expect(
    db.owner.query(
      `INSERT INTO library.reading_plan_entries(revision_id,library_id,position,book_id,reason,evidence)
    VALUES($1,$2,2,$3,'Late change','[]')`,
      [plan.id, libraryB, another],
    ),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
});
