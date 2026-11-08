import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { runImport } from '../../importer/src/run-import';
import { syntheticSnapshot } from '../../importer/test/synthetic';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { isStoredPlan } from '@smart-library/domain';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let actor: string, libraryId: string, stableId: string;
const producer = { kind: 'application', id: 'synthetic-planner', version: 'v1' };
const sources = [{ reference: 'synthetic:evidence', revision: null }];
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
beforeEach(async () => {
  actor = `plan-${randomUUID()}`;
  stableId = `book-${randomUUID()}`;
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Synthetic',$1||'@example.test',true,now(),now())`,
    [actor],
  );
  libraryId = (
    await db.owner.query(
      'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) RETURNING id',
      [actor],
    )
  ).rows[0].id;
  const book = await insertBookFixture(db.owner, { stableId });
  await db.owner.query('INSERT INTO library.library_books(library_id,book_id) VALUES($1,$2)', [
    libraryId,
    book.id,
  ]);
});
async function call(
  name: string,
  body: object,
  expected: string | null = null,
  key = randomUUID(),
  pool: Pool | PoolClient = db.aiProducer,
) {
  return (
    await pool.query(`SELECT library.${name}($1,$2,$3,$4) AS result`, [actor, key, expected, body])
  ).rows[0].result;
}
async function configure(platform = 'Kindle') {
  return call('configure_reading_plan', { platform, rubricVersion: 'v1', producer });
}
async function inputs(platform = 'Kindle') {
  return (
    await db.aiProducer.query('SELECT library.reading_plan_inputs_for_user($1,$2,$3) AS result', [
      actor,
      platform,
      { books: [{ bookStableId: stableId, fields: ['title', 'status'] }], resultRevisionIds: [] },
    ])
  ).rows[0].result;
}
async function read(platform = 'Kindle') {
  return (
    await db.appRuntime.query('SELECT library.reading_plan_for_user($1,$2) AS result', [
      actor,
      platform,
    ])
  ).rows[0].result;
}
function entry() {
  return {
    bookStableId: stableId,
    position: 1,
    reason: 'Synthetic scheduling reason',
    evidence: sources,
    judgmentRevisionIds: [],
  };
}
async function request(platform = 'Kindle', entries: object[] = [entry()]) {
  return {
    platform,
    inputs: await inputs(platform),
    entries,
    calculatedAt: '2026-11-08T12:00:00.000Z',
  };
}
it('keeps explicit preferences separate from producer proposals and user decisions', async () => {
  const id = randomUUID();
  const proposal = { preferenceId: id, statement: 'Synthetic inference', sources, producer };
  const first = await call('propose_preference_evidence', proposal);
  expect(first.revision).toBe('1');
  await expect(
    call(
      'save_preference_evidence',
      { ...proposal, decision: 'accepted' },
      '1',
      randomUUID(),
      db.appRuntime,
    ),
  ).rejects.toThrow('INVALID_PLAN_REQUEST');
  const accepted = await call(
    'save_preference_evidence',
    { preferenceId: id, decision: 'accepted' },
    '1',
    randomUUID(),
    db.appRuntime,
  );
  expect(accepted.revision).toBe('2');
  await expect(call('propose_preference_evidence', proposal, '2')).rejects.toThrow(
    'PREFERENCE_DECISION_REQUIRED',
  );
  const explicit = await call(
    'save_preference_evidence',
    { preferenceId: randomUUID(), statement: 'Explicit intent', sources: [], decision: 'accepted' },
    null,
    randomUUID(),
    db.appRuntime,
  );
  expect(explicit.revision).toBe('1');
  await expect(
    call('save_preference_evidence', { preferenceId: id, decision: 'rejected' }, '2'),
  ).rejects.toMatchObject({ code: '42501' });
});
it('replays preference receipts after updates and rejects changed bodies', async () => {
  const body = {
    preferenceId: randomUUID(),
    statement: 'Explicit preference',
    sources: [],
    decision: 'accepted',
  };
  const key = randomUUID();
  const first = await call('save_preference_evidence', body, null, key, db.appRuntime);
  await call(
    'save_preference_evidence',
    { ...body, statement: 'Edited preference' },
    '1',
    randomUUID(),
    db.appRuntime,
  );
  expect(await call('save_preference_evidence', body, null, key, db.appRuntime)).toEqual(first);
  await expect(
    call(
      'save_preference_evidence',
      { ...body, statement: 'Changed retry' },
      null,
      key,
      db.appRuntime,
    ),
  ).rejects.toThrow('REQUEST_REPLAY_MISMATCH');
});
it('distinguishes missing and accepted empty plans with valid wire DTOs', async () => {
  expect(await read()).toEqual({ platform: 'Kindle', state: 'missing' });
  await configure();
  await call('publish_reading_plan', await request('Kindle', []));
  const result = await read();
  expect(isStoredPlan(result)).toBe(true);
  expect(result).toMatchObject({ state: 'fresh', revision: { entries: [], revision: '1' } });
});
it('publishes immutable ordered plans and rejects invalid positions without replacing output', async () => {
  await configure();
  const body = await request();
  const first = await call('publish_reading_plan', body);
  expect(isStoredPlan(await read())).toBe(true);
  await expect(
    call('publish_reading_plan', { ...body, entries: [{ ...entry(), position: 2 }] }, '1'),
  ).rejects.toThrow('INVALID_PLAN_REQUEST');
  expect((await read()).revision.id).toBe(first.revisionId);
  await expect(
    db.owner.query(
      `INSERT INTO library.reading_plan_entry_judgments(revision_id,position,library_id,result_revision_id) VALUES($1,1,$2,gen_random_uuid())`,
      [first.revisionId, libraryId],
    ),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
});
it('keeps Kindle deferral changes independent from Audible and preserves intent through publication', async () => {
  await configure();
  await configure('Audible');
  const kindle = await call('publish_reading_plan', await request());
  await call('publish_reading_plan', await request('Audible'));
  const deferralId = randomUUID();
  const body = {
    deferralId,
    bookStableId: stableId,
    platform: 'Kindle',
    state: 'active',
    reason: 'Synthetic later intent',
    expectedDeferralRevision: null,
  };
  const deferral = await call('record_plan_deferral', body, '1', randomUUID(), db.appRuntime);
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
  expect((await read('Audible')).state).toBe('fresh');
  const next = await call('publish_reading_plan', await request(), '1');
  expect(next.revision).toBe('2');
  const manifest = (
    await db.owner.query('SELECT input_manifest FROM library.reading_plan_revisions WHERE id=$1', [
      next.revisionId,
    ])
  ).rows[0].input_manifest;
  expect(manifest.deferralRevisionIds).toContain(deferral.revisionId);
  expect(
    (
      await db.owner.query('SELECT state FROM library.plan_deferrals WHERE id=$1', [
        deferral.revisionId,
      ])
    ).rows[0].state,
  ).toBe('active');
  await expect(
    call(
      'record_plan_deferral',
      { ...body, state: 'cancelled', expectedDeferralRevision: '1' },
      '1',
      randomUUID(),
      db.appRuntime,
    ),
  ).rejects.toThrow('VERSION_CONFLICT');
  await call(
    'record_plan_deferral',
    { ...body, state: 'cancelled', expectedDeferralRevision: '1' },
    '2',
    randomUUID(),
    db.appRuntime,
  );
  expect((await read()).state).toBe('stale');
  expect((await read('Audible')).state).toBe('fresh');
  expect(kindle.revision).toBe('1');
});
it('serializes first publication and exact replay after the head advances', async () => {
  await configure();
  const body = await request();
  const key = randomUUID();
  const [first, replay] = await Promise.all([
    call('publish_reading_plan', body, null, key),
    call('publish_reading_plan', body, null, key),
  ]);
  expect(first).toEqual(replay);
  const race = await Promise.allSettled([
    call('publish_reading_plan', body, '1'),
    call('publish_reading_plan', body, '1'),
  ]);
  expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await call('publish_reading_plan', body, null, key)).toEqual(first);
});
it('rejects obsolete recovery inputs and hides archived entries while retaining history', async () => {
  await configure();
  const body = await request();
  const first = await call('publish_reading_plan', body);
  await db.owner.query(`UPDATE library.books SET title='Changed source' WHERE stable_id=$1`, [
    stableId,
  ]);
  await expect(call('publish_reading_plan', body, '1')).rejects.toThrow('INPUTS_CHANGED');
  expect((await read()).state).toBe('stale');
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [stableId]);
  expect(await read()).toEqual({ platform: 'Kindle', state: 'unavailable' });
  expect(
    (
      await db.owner.query(
        'SELECT count(*) FROM library.reading_plan_entries WHERE revision_id=$1',
        [first.revisionId],
      )
    ).rows[0].count,
  ).toBe('1');
});
it('denies direct storage and separates public, runtime and producer capabilities', async () => {
  for (const pool of [db.appRuntime, db.aiProducer, db.publicReader])
    await expect(pool.query('SELECT * FROM library.reading_plan_policies')).rejects.toMatchObject({
      code: '42501',
    });
  await configure();
  const body = await request();
  await expect(
    call('publish_reading_plan', body, null, randomUUID(), db.appRuntime),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    call('publish_reading_plan', body, null, randomUUID(), db.publicReader),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    call('record_plan_deferral', {
      deferralId: randomUUID(),
      bookStableId: stableId,
      platform: 'Kindle',
      state: 'active',
      reason: 'Later',
      expectedDeferralRevision: null,
    }),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    db.appRuntime.query('SELECT library.plan_inputs($1,$2,$3)', [
      actor,
      'Kindle',
      { books: [], resultRevisionIds: [] },
    ]),
  ).rejects.toMatchObject({ code: '42501' });
});
it('invalidates both platform plans only after a preference is accepted', async () => {
  await configure();
  await configure('Audible');
  await call('publish_reading_plan', await request());
  await call('publish_reading_plan', await request('Audible'));
  const preferenceId = randomUUID();
  await call('propose_preference_evidence', {
    preferenceId,
    statement: 'Proposed inference',
    sources,
    producer,
  });
  expect((await read()).state).toBe('fresh');
  expect((await read('Audible')).state).toBe('fresh');
  await call(
    'save_preference_evidence',
    { preferenceId, decision: 'accepted' },
    '1',
    randomUUID(),
    db.appRuntime,
  );
  expect((await read()).state).toBe('stale');
  expect((await read('Audible')).state).toBe('stale');
});
it('tracks platform-specific policy versions before recalculation', async () => {
  await configure();
  await configure('Audible');
  await call('publish_reading_plan', await request());
  await call('publish_reading_plan', await request('Audible'));
  await call('configure_reading_plan', { platform: 'Kindle', rubricVersion: 'v2', producer }, '1');
  expect(await read()).toMatchObject({ state: 'stale', reason: 'versions_changed' });
  expect((await read('Audible')).state).toBe('fresh');
});
it('checks ownership before deferral replay and rejects unknown books', async () => {
  const body = {
    deferralId: randomUUID(),
    bookStableId: stableId,
    platform: 'Kindle',
    state: 'active',
    reason: 'Later',
    expectedDeferralRevision: null,
  };
  const key = randomUUID();
  await call('record_plan_deferral', body, null, key, db.appRuntime);
  await expect(
    call(
      'record_plan_deferral',
      { ...body, bookStableId: 'unknown' },
      null,
      randomUUID(),
      db.appRuntime,
    ),
  ).rejects.toThrow('BOOK_NOT_FOUND');
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [stableId]);
  await expect(call('record_plan_deferral', body, null, key, db.appRuntime)).rejects.toThrow(
    'BOOK_NOT_FOUND',
  );
});
it('rejects foreign selected books and same-library heads from another platform stream', async () => {
  await configure();
  await configure('Audible');
  const a = await call('publish_reading_plan', await request());
  const b = await call('publish_reading_plan', await request('Audible'));
  const foreignActor = `foreign-${randomUUID()}`;
  await db.owner.query(
    `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Synthetic',$1||'@example.test',true,now(),now())`,
    [foreignActor],
  );
  const foreignLib = (
    await db.owner.query(
      'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) RETURNING id',
      [foreignActor],
    )
  ).rows[0].id;
  const book = await insertBookFixture(db.owner);
  await db.owner.query('INSERT INTO library.library_books(library_id,book_id) VALUES($1,$2)', [
    foreignLib,
    book.id,
  ]);
  await expect(
    db.aiProducer.query('SELECT library.reading_plan_inputs_for_user($1,$2,$3)', [
      actor,
      'Kindle',
      { books: [{ bookStableId: book.stableId, fields: ['title'] }], resultRevisionIds: [] },
    ]),
  ).rejects.toThrow('BOOK_NOT_FOUND');
  await expect(
    db.owner.query(
      'UPDATE library.reading_plan_streams SET head_revision_id=$1 WHERE head_revision_id=$2',
      [b.revisionId, a.revisionId],
    ),
  ).rejects.toMatchObject({ code: '23503' });
});
it('revalidates a preference change after waiting on the library context lock', async () => {
  await configure();
  const body = await request();
  const writer = await db.owner.connect();
  const worker = await db.aiProducer.connect();
  let pending: Promise<{ error?: Error }> | undefined;
  try {
    await writer.query('BEGIN');
    await writer.query('SELECT pg_advisory_xact_lock(73422,hashtext($1))', [libraryId]);
    const pid = (await worker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending = call('publish_reading_plan', body, null, randomUUID(), worker).then(
      () => ({}),
      (error) => ({ error }),
    );
    let blocked = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      blocked = (
        await db.owner.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [pid])
      ).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    await writer.query(
      `INSERT INTO library.preference_evidence(library_id,preference_id,revision,authorship,decision,statement,sources,actor_user_id) VALUES($1,gen_random_uuid(),1,'explicit','accepted','Concurrent preference','[]',$2)`,
      [libraryId, actor],
    );
    await writer.query('COMMIT');
    expect((await pending).error?.message).toBe('INPUTS_CHANGED');
    expect((await read()).state).toBe('missing');
  } finally {
    await writer.query('ROLLBACK');
    if (pending) await pending;
    writer.release();
    worker.release();
  }
});
it('preserves app revisions, heads, receipts and deferrals when a synthetic import is replayed', async () => {
  const snapshot = await syntheticSnapshot();
  try {
    const apply = () =>
      runImport(
        {
          snapshotDirectory: snapshot.directory,
          scope: 'core',
          mode: 'apply',
          reportDirectory: snapshot.report(),
        },
        db.importer,
      );
    const imported = await apply();
    expect(imported.status).toBe('applied');
    await call(
      'save_preference_evidence',
      {
        preferenceId: randomUUID(),
        statement: 'Synthetic retained preference',
        sources: [],
        decision: 'accepted',
      },
      null,
      randomUUID(),
      db.appRuntime,
    );
    await call('configure_ai_result', {
      bookStableId: stableId,
      kind: 'enrichment',
      rubricVersion: 'v1',
      producer,
    });
    const captured = (
      await db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4) AS result', [
        actor,
        stableId,
        'enrichment',
        { fields: ['title'], resultRevisionIds: [] },
      ])
    ).rows[0].result;
    await call('publish_ai_result', {
      bookStableId: stableId,
      kind: 'enrichment',
      inputs: captured,
      payload: { description: 'Synthetic enrichment', tags: [], sources },
      calculatedAt: '2026-11-08T12:00:00.000Z',
    });
    await configure();
    await call(
      'record_plan_deferral',
      {
        deferralId: randomUUID(),
        bookStableId: stableId,
        platform: 'Kindle',
        state: 'active',
        reason: 'Retain synthetic intent',
        expectedDeferralRevision: null,
      },
      null,
      randomUUID(),
      db.appRuntime,
    );
    await call('publish_reading_plan', await request());
    const snapshotStores = async () => {
      const result: Record<string, unknown> = {};
      for (const table of [
        'ai_result_streams',
        'ai_result_policies',
        'ai_result_revisions',
        'reading_plan_streams',
        'reading_plan_policies',
        'reading_plan_revisions',
        'reading_plan_entries',
        'reading_plan_entry_judgments',
        'preference_evidence',
        'plan_deferrals',
        'app_operation_receipts',
      ]) {
        result[table] = (
          await db.owner.query(
            `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS data FROM library.${table} t`,
          )
        ).rows[0].data;
      }
      return result;
    };
    const before = await snapshotStores();
    expect((await apply()).runId).toBe(imported.runId);
    expect(await snapshotStores()).toEqual(before);
  } finally {
    await snapshot.dispose();
  }
});
it('treats automatic candidate provenance changes as changed plan inputs', async () => {
  await configure();
  const captured = (
    await db.aiProducer.query('SELECT library.reading_plan_inputs_for_user($1,$2,$3) AS result', [
      actor,
      'Kindle',
      { books: [], resultRevisionIds: [] },
    ])
  ).rows[0].result;
  await call('publish_reading_plan', {
    platform: 'Kindle',
    inputs: captured,
    entries: [],
    calculatedAt: '2026-11-08T12:00:00.000Z',
  });
  await db.owner.query(
    `INSERT INTO library.book_field_provenance(book_id,field_name,origin,source_reference,value_sha256,hash_version)
 SELECT id,'books.status','external','synthetic:source',library.value_hash('books.status','text',to_jsonb(status)),'pg-jsonb-text-v1' FROM library.books WHERE stable_id=$1`,
    [stableId],
  );
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
});
it('tracks judgment freshness transitively and normalizes entry dependency references', async () => {
  await call('configure_ai_result', {
    bookStableId: stableId,
    kind: 'enrichment',
    rubricVersion: 'v1',
    producer,
  });
  const captured = (
    await db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4) AS result', [
      actor,
      stableId,
      'enrichment',
      { fields: ['title'], resultRevisionIds: [] },
    ])
  ).rows[0].result;
  const result = await call('publish_ai_result', {
    bookStableId: stableId,
    kind: 'enrichment',
    inputs: captured,
    payload: { description: 'Synthetic result', tags: [], sources },
    calculatedAt: '2026-11-08T12:00:00.000Z',
  });
  await configure();
  const context = (
    await db.aiProducer.query('SELECT library.reading_plan_inputs_for_user($1,$2,$3) AS result', [
      actor,
      'Kindle',
      {
        books: [{ bookStableId: stableId, fields: ['status'] }],
        resultRevisionIds: [result.revisionId],
      },
    ])
  ).rows[0].result;
  const plan = await call('publish_reading_plan', {
    platform: 'Kindle',
    inputs: context,
    entries: [{ ...entry(), judgmentRevisionIds: [result.revisionId] }],
    calculatedAt: '2026-11-08T12:00:00.000Z',
  });
  expect((await read()).state).toBe('fresh');
  expect(
    (
      await db.owner.query(
        'SELECT result_revision_id FROM library.reading_plan_entry_judgments WHERE revision_id=$1',
        [plan.revisionId],
      )
    ).rows[0].result_revision_id,
  ).toBe(result.revisionId);
  await call(
    'configure_ai_result',
    { bookStableId: stableId, kind: 'enrichment', rubricVersion: 'v2', producer },
    '1',
  );
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
});
it('replays only revision identity after archive while hiding current entries', async () => {
  await configure();
  const body = await request();
  const key = randomUUID();
  const first = await call('publish_reading_plan', body, null, key);
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [stableId]);
  expect(await call('publish_reading_plan', body, null, key)).toEqual(first);
  expect(await read()).toEqual({ platform: 'Kindle', state: 'unavailable' });
  await db.owner.query('UPDATE auth."user" SET "emailVerified"=false WHERE id=$1', [actor]);
  await expect(call('publish_reading_plan', body, null, key)).rejects.toThrow('LIBRARY_NOT_FOUND');
});
it('rolls back plan revision, head and receipt without erasing pending deferral intent', async () => {
  await configure();
  const original = await call('publish_reading_plan', await request());
  const deferral = await call(
    'record_plan_deferral',
    {
      deferralId: randomUUID(),
      bookStableId: stableId,
      platform: 'Kindle',
      state: 'active',
      reason: 'Pending reason',
      expectedDeferralRevision: null,
    },
    '1',
    randomUUID(),
    db.appRuntime,
  );
  const body = await request();
  const worker = await db.aiProducer.connect();
  const key = randomUUID();
  try {
    await worker.query('BEGIN');
    await call('publish_reading_plan', body, '1', key, worker);
    await worker.query('ROLLBACK');
  } finally {
    worker.release();
  }
  expect((await read()).revision.id).toBe(original.revisionId);
  expect(
    (
      await db.owner.query(
        'SELECT count(*) FROM library.reading_plan_revisions WHERE library_id=$1',
        [libraryId],
      )
    ).rows[0].count,
  ).toBe('1');
  expect(
    (
      await db.owner.query(
        'SELECT count(*) FROM library.app_operation_receipts WHERE request_id=$1',
        [key],
      )
    ).rows[0].count,
  ).toBe('0');
  expect(
    (
      await db.owner.query('SELECT state FROM library.plan_deferrals WHERE id=$1', [
        deferral.revisionId,
      ])
    ).rows[0].state,
  ).toBe('active');
});
