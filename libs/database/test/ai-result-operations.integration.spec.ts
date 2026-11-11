import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { isStoredResult } from '@smart-library/domain';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
import type { Pool, PoolClient } from 'pg';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let actor: string;
let otherActor: string;
let libraryId: string;
let stableId: string;
let otherStableId: string;
const producer = { kind: 'application', id: 'synthetic-calculator', version: 'v1' };
const payload = {
  description: 'Synthetic enrichment',
  tags: ['mystery'],
  sources: [{ reference: 'synthetic-source', revision: null }],
};
const selector = { fields: ['title'], resultRevisionIds: [] };

beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
beforeEach(async () => {
  const suffix = randomUUID();
  actor = `result-a-${suffix}`;
  otherActor = `result-b-${suffix}`;
  stableId = `result-book-a-${suffix}`;
  otherStableId = `result-book-b-${suffix}`;
  for (const [id, book] of [
    [actor, stableId],
    [otherActor, otherStableId],
  ]) {
    await db.owner.query(
      `INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Synthetic reader',$1||'@example.test',true,now(),now())`,
      [id],
    );
    const lib = (
      await db.owner.query(
        'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) RETURNING id',
        [id],
      )
    ).rows[0].id;
    const b = await insertBookFixture(db.owner, {
      stableId: book,
      title: 'Synthetic source title',
    });
    await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
      b.id,
      lib,
    ]);
    if (id === actor) libraryId = lib;
  }
});

async function configure(kind = 'enrichment', expected: string | null = null, version = 'v1') {
  return (
    await db.aiProducer.query('SELECT library.configure_ai_result($1,$2,$3,$4) AS result', [
      actor,
      randomUUID(),
      expected,
      { bookStableId: stableId, kind, rubricVersion: version, producer },
    ])
  ).rows[0].result;
}
async function inputs(kind = 'enrichment', selection: object = selector) {
  return (
    await db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4) AS result', [
      actor,
      stableId,
      kind,
      selection,
    ])
  ).rows[0].result;
}
function request(context: unknown, kind = 'enrichment', body: unknown = payload) {
  return {
    bookStableId: stableId,
    kind,
    inputs: context,
    payload: body,
    calculatedAt: '2026-11-08T12:00:00.000Z',
  };
}
async function publish(
  body: object,
  expected: string | null = null,
  key = randomUUID(),
  pool: Pool | PoolClient = db.aiProducer,
) {
  return (
    await pool.query('SELECT library.publish_ai_result($1,$2,$3,$4) AS result', [
      actor,
      key,
      expected,
      body,
    ])
  ).rows[0].result;
}
async function read(kind = 'enrichment') {
  return (
    await db.appRuntime.query('SELECT library.ai_result_for_user($1,$2,$3) AS result', [
      actor,
      stableId,
      kind,
    ])
  ).rows[0].result;
}

it('distinguishes missing output and reads/captures inputs without writing', async () => {
  expect(await read()).toEqual({ state: 'missing', kind: 'enrichment', bookStableId: stableId });
  await configure();
  const before = (await db.owner.query('SELECT count(*) FROM library.app_operation_receipts'))
    .rows[0].count;
  const context = await inputs();
  expect(context.manifest.fields).toEqual(['title']);
  expect(context.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(context.policy).toEqual({ rubricVersion: 'v1', producer });
  await read();
  expect(
    (await db.owner.query('SELECT count(*) FROM library.app_operation_receipts')).rows[0].count,
  ).toBe(before);
});

it('publishes a valid immutable revision and projects the domain wire contract', async () => {
  await configure();
  const receipt = await publish(request(await inputs()));
  expect(receipt.revision).toBe('1');
  expect(receipt).not.toHaveProperty('state');
  const result = await read();
  expect(isStoredResult(result)).toBe(true);
  expect(result).toMatchObject({
    state: 'fresh',
    revision: {
      id: receipt.revisionId,
      revision: '1',
      payload,
      producer,
      calculatedAt: '2026-11-08T12:00:00.000Z',
    },
  });
  await expect(
    db.owner.query(`UPDATE library.ai_result_revisions SET payload='{}' WHERE id=$1`, [
      receipt.revisionId,
    ]),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
});

it('replays the original receipt after a later head and rejects changed request identity', async () => {
  await configure();
  const body = request(await inputs());
  const key = randomUUID();
  const first = await publish(body, null, key);
  const second = await publish(body, '1');
  expect(second.revision).toBe('2');
  expect(await publish(body, null, key)).toEqual(first);
  await expect(
    publish({ ...body, payload: { ...payload, description: 'Changed' } }, null, key),
  ).rejects.toThrow('REQUEST_REPLAY_MISMATCH');
  expect((await read()).revision.id).toBe(second.revisionId);
});

it('serializes identical retries and competing first publications', async () => {
  await configure();
  const body = request(await inputs());
  const key = randomUUID();
  const [a, b] = await Promise.all([publish(body, null, key), publish(body, null, key)]);
  expect(a).toEqual(b);
  const competition = await Promise.allSettled([publish(body, '1'), publish(body, '1')]);
  expect(competition.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(competition.filter((r) => r.status === 'rejected').map((r) => r.reason.message)).toEqual([
    'VERSION_CONFLICT',
  ]);
  expect((await read()).revision.revision).toBe('2');
});

it('invalidates selected source fields but preserves freshness after unrelated edits', async () => {
  await configure();
  const body = request(await inputs());
  await publish(body);
  await db.owner.query(
    `UPDATE library.books SET cover_url='https://example.test/synthetic.jpg' WHERE stable_id=$1`,
    [stableId],
  );
  expect((await read()).state).toBe('fresh');
  await db.owner.query(`UPDATE library.books SET title='Changed source' WHERE stable_id=$1`, [
    stableId,
  ]);
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
  await expect(publish(body, '1')).rejects.toThrow('INPUTS_CHANGED');
  expect((await read()).revision.revision).toBe('1');
});

it('detects policy changes before recalculation without erasing the last result', async () => {
  const policy = await configure();
  await publish(request(await inputs()));
  const changed = await configure('enrichment', policy.policyRevision, 'v2');
  expect(changed.policyRevision).toBe('2');
  expect(await read()).toMatchObject({
    state: 'stale',
    reason: 'versions_changed',
    revision: { revision: '1' },
  });
  await expect(configure('enrichment', '1', 'v3')).rejects.toThrow('VERSION_CONFLICT');
});

it('checks current ownership before receipt replay and denies runtime writer access', async () => {
  await configure();
  const body = request(await inputs());
  const key = randomUUID();
  await publish(body, null, key);
  await expect(
    db.aiProducer.query('SELECT library.publish_ai_result($1,$2,NULL,$3)', [otherActor, key, body]),
  ).rejects.toThrow('BOOK_NOT_FOUND');
  await expect(
    db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4)', [
      actor,
      otherStableId,
      'enrichment',
      selector,
    ]),
  ).rejects.toThrow('BOOK_NOT_FOUND');
  await expect(publish(body, null, randomUUID(), db.appRuntime)).rejects.toMatchObject({
    code: '42501',
  });
  await expect(publish(body, null, randomUUID(), db.publicReader)).rejects.toMatchObject({
    code: '42501',
  });
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [stableId]);
  await expect(publish(body, null, key)).rejects.toThrow('BOOK_NOT_FOUND');
  await expect(read()).rejects.toThrow('BOOK_NOT_FOUND');
});

it('rejects invalid payloads, forged fingerprints and UTF-16 text overflow atomically', async () => {
  await configure();
  const context = await inputs();
  for (const bad of [
    request(context, 'enrichment', { ...payload, sources: [] }),
    request(context, 'enrichment', { ...payload, description: '😀'.repeat(10_001) }),
    { ...request(context), actorUserId: otherActor },
    { ...request(context), calculatedAt: '2026-02-30T00:00:00.000Z' },
  ])
    await expect(publish(bad)).rejects.toThrow('INVALID_AI_REQUEST');
  await expect(publish(request({ ...context, fingerprint: '0'.repeat(64) }))).rejects.toThrow(
    'INPUTS_CHANGED',
  );
  expect((await read()).state).toBe('missing');
});

it('keeps policy changes versioned and retry-safe without generating redundant revisions', async () => {
  const key = randomUUID();
  const body = { bookStableId: stableId, kind: 'enrichment', rubricVersion: 'v1', producer };
  const invoke = (expected: string | null, id = key, policy = body) =>
    db.aiProducer
      .query('SELECT library.configure_ai_result($1,$2,$3,$4) AS result', [
        actor,
        id,
        expected,
        policy,
      ])
      .then((r) => r.rows[0].result);
  const first = await invoke(null);
  expect(await invoke(null)).toEqual(first);
  expect((await invoke('1', randomUUID())).policyRevision).toBe('1');
  expect(
    (
      await db.owner.query('SELECT count(*) FROM library.ai_result_policies WHERE library_id=$1', [
        libraryId,
      ])
    ).rows[0].count,
  ).toBe('1');
  await expect(invoke(null, key, { ...body, rubricVersion: 'v2' })).rejects.toThrow(
    'REQUEST_REPLAY_MISMATCH',
  );
  await expect(
    db.owner.query('DELETE FROM library.ai_result_policies WHERE id=$1', [first.policyId]),
  ).rejects.toThrow('APP_REVISION_IMMUTABLE');
});

it('keeps imported values and nonempty provenance unchanged during app-result operations', async () => {
  await db.owner.query(
    `INSERT INTO library.book_feedback(book_id,rating,opinion,notes,updated_by)
    SELECT id,3,'Synthetic opinion','Synthetic note',session_user FROM library.books WHERE stable_id=$1`,
    [stableId],
  );
  await db.owner.query(
    `INSERT INTO library.book_field_provenance(book_id,field_name,origin,source_reference,value_sha256,hash_version)
    SELECT id,'books.title','external','synthetic:source',library.value_hash('books.title','text',to_jsonb(title)),'pg-jsonb-text-v1'
    FROM library.books WHERE stable_id=$1`,
    [stableId],
  );
  const snapshot = () =>
    db.owner
      .query(
        `SELECT to_jsonb(b) AS book,
    (SELECT to_jsonb(f) FROM library.book_feedback f WHERE f.book_id=b.id) AS feedback,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.field_name) FROM library.book_field_provenance p WHERE p.book_id=b.id) AS provenance
    FROM library.books b WHERE b.stable_id=$1`,
        [stableId],
      )
      .then((r) => r.rows[0]);
  const before = await snapshot();
  await configure();
  await publish(request(await inputs()));
  await configure('enrichment', '1', 'v2');
  await publish(request(await inputs()), '1');
  expect(await snapshot()).toEqual(before);
});

it('treats source provenance changes as changed inputs even when the value is unchanged', async () => {
  await configure();
  await publish(request(await inputs()));
  await db.owner.query(
    `INSERT INTO library.book_field_provenance(book_id,field_name,origin,source_reference,value_sha256,hash_version)
    SELECT id,'books.title','external','synthetic:reviewed',library.value_hash('books.title','text',to_jsonb(title)),'pg-jsonb-text-v1'
    FROM library.books WHERE stable_id=$1`,
    [stableId],
  );
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
});

it('tracks owned related-book inputs and rejects foreign related-book references', async () => {
  const related = `related-${randomUUID()}`;
  const book = await insertBookFixture(db.owner, {
    stableId: related,
    title: 'Related synthetic source',
  });
  await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
    book.id,
    libraryId,
  ]);
  await configure();
  const selection = { ...selector, relatedBooks: [{ bookStableId: related, fields: ['title'] }] };
  await publish(request(await inputs('enrichment', selection)));
  await db.owner.query(`UPDATE library.books SET title='Related changed' WHERE stable_id=$1`, [
    related,
  ]);
  expect(await read()).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
  await expect(
    inputs('enrichment', {
      ...selector,
      relatedBooks: [{ bookStableId: otherStableId, fields: ['title'] }],
    }),
  ).rejects.toThrow('BOOK_NOT_FOUND');
});

it('propagates transitive source staleness instead of trusting unchanged dependency IDs', async () => {
  const related = `dependency-${randomUUID()}`;
  const book = await insertBookFixture(db.owner, { stableId: related });
  await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
    book.id,
    libraryId,
  ]);
  await db.aiProducer.query('SELECT library.configure_ai_result($1,$2,NULL,$3)', [
    actor,
    randomUUID(),
    { bookStableId: related, kind: 'enrichment', rubricVersion: 'v1', producer },
  ]);
  const captured = (
    await db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4) AS result', [
      actor,
      related,
      'enrichment',
      selector,
    ])
  ).rows[0].result;
  const dependency = (
    await db.aiProducer.query('SELECT library.publish_ai_result($1,$2,NULL,$3) AS result', [
      actor,
      randomUUID(),
      { ...request(captured), bookStableId: related },
    ])
  ).rows[0].result;
  await configure('taste');
  const selection = { ...selector, resultRevisionIds: [dependency.revisionId] };
  const taste = { scores: [{ factor: 'fit', value: 3, min: 1, max: 5 }], sources: payload.sources };
  await publish(request(await inputs('taste', selection), 'taste', taste));
  expect((await read('taste')).state).toBe('fresh');
  await db.owner.query(`UPDATE library.books SET title='Dependency changed' WHERE stable_id=$1`, [
    related,
  ]);
  expect(await read('taste')).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
  await expect(inputs('taste', selection)).rejects.toThrow('STALE_DEPENDENCY');
});

it('invalidates personal judgments for accepted preference changes, not reusable enrichment', async () => {
  await configure();
  await publish(request(await inputs()));
  await configure('taste');
  const taste = { scores: [{ factor: 'fit', value: 3, min: 1, max: 5 }], sources: payload.sources };
  await publish(request(await inputs('taste'), 'taste', taste));
  await db.owner.query(
    `INSERT INTO library.preference_evidence(library_id,preference_id,revision,authorship,decision,statement,sources,actor_user_id)
    VALUES($1,gen_random_uuid(),1,'explicit','accepted','Synthetic preference','[]',$2)`,
    [libraryId, actor],
  );
  expect((await read()).state).toBe('fresh');
  expect(await read('taste')).toMatchObject({ state: 'stale', reason: 'inputs_changed' });
});

async function waitForLock(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const state = (
      await db.owner.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [pid])
    ).rows[0];
    if (state?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('SYNTHETIC_PUBLICATION_DID_NOT_BLOCK');
}

it.each(['import', 'preference'] as const)(
  'revalidates inputs after a concurrent %s transaction releases its lock',
  async (mode) => {
    const kind = mode === 'preference' ? 'taste' : 'enrichment';
    await configure(kind);
    const body = request(
      await inputs(kind),
      kind,
      kind === 'taste'
        ? { scores: [{ factor: 'fit', value: 3, min: 1, max: 5 }], sources: payload.sources }
        : payload,
    );
    const writer = await db.owner.connect();
    const worker = await db.aiProducer.connect();
    let pending: Promise<{ result?: unknown; error?: Error }> | undefined;
    try {
      await writer.query('BEGIN');
      if (mode === 'import') await writer.query('SELECT pg_advisory_xact_lock(73421,2)');
      else await writer.query('SELECT pg_advisory_xact_lock(73422,hashtext($1))', [libraryId]);
      const pid = (await worker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending = publish(body, null, randomUUID(), worker).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      await waitForLock(pid);
      if (mode === 'import')
        await writer.query(
          `UPDATE library.books SET title='Concurrent synthetic import' WHERE stable_id=$1`,
          [stableId],
        );
      else
        await writer.query(
          `INSERT INTO library.preference_evidence(library_id,preference_id,revision,authorship,decision,statement,sources,actor_user_id)
      VALUES($1,gen_random_uuid(),1,'explicit','accepted','Concurrent synthetic preference','[]',$2)`,
          [libraryId, actor],
        );
      await writer.query('COMMIT');
      expect((await pending).error?.message).toBe('INPUTS_CHANGED');
      expect((await read(kind)).state).toBe('missing');
    } finally {
      await writer.query('ROLLBACK');
      if (pending) await pending;
      writer.release();
      worker.release();
    }
  },
);

it('validates taste and format variants and protects private helpers from runtime callers', async () => {
  await configure('taste');
  const context = await inputs('taste');
  const taste = { scores: [{ factor: 'fit', value: 3, min: 1, max: 5 }], sources: payload.sources };
  await expect(
    publish(
      request(context, 'taste', {
        ...taste,
        scores: [{ factor: 'fit', value: 9, min: 1, max: 5 }],
      }),
    ),
  ).rejects.toThrow('INVALID_AI_REQUEST');
  await publish(request(context, 'taste', taste));
  expect(isStoredResult(await read('taste'))).toBe(true);
  await configure('format');
  const formatContext = await inputs('format');
  await expect(
    publish(
      request(formatContext, 'format', {
        judgments: [{ platform: 'Audible', state: 'known' }],
        sources: payload.sources,
      }),
    ),
  ).rejects.toThrow('INVALID_AI_REQUEST');
  await publish(
    request(formatContext, 'format', {
      judgments: [{ platform: 'Audible', state: 'unknown' }],
      sources: payload.sources,
    }),
  );
  expect(isStoredResult(await read('format'))).toBe(true);
  await expect(
    db.appRuntime.query('SELECT library.ai_all_book_hashes($1,$2)', [actor, stableId]),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    db.aiProducer.query('SELECT library.ai_all_book_hashes($1,$2)', [actor, stableId]),
  ).rejects.toMatchObject({ code: '42501' });
});

it('rejects JavaScript-trim whitespace payloads at the SQL boundary', async () => {
  await configure();
  const context = await inputs();
  for (const description of ['\t\n', '\u00a0', '\ufeff', '\u3000']) {
    await expect(
      publish(request(context, 'enrichment', { ...payload, description })),
    ).rejects.toThrow('INVALID_AI_REQUEST');
  }
});

it('rejects foreign and self-stream dependency revisions without leaving partial output', async () => {
  await configure();
  const own = await publish(request(await inputs()));
  await expect(
    inputs('enrichment', { ...selector, resultRevisionIds: [own.revisionId] }),
  ).rejects.toThrow('INVALID_DEPENDENCY');
  await db.aiProducer.query('SELECT library.configure_ai_result($1,$2,NULL,$3)', [
    otherActor,
    randomUUID(),
    { bookStableId: otherStableId, kind: 'enrichment', rubricVersion: 'v1', producer },
  ]);
  const otherContext = (
    await db.aiProducer.query('SELECT library.ai_result_inputs_for_user($1,$2,$3,$4) AS result', [
      otherActor,
      otherStableId,
      'enrichment',
      selector,
    ])
  ).rows[0].result;
  const other = (
    await db.aiProducer.query('SELECT library.publish_ai_result($1,$2,NULL,$3) AS result', [
      otherActor,
      randomUUID(),
      { ...request(otherContext), bookStableId: otherStableId },
    ])
  ).rows[0].result;
  await expect(
    inputs('enrichment', { ...selector, resultRevisionIds: [other.revisionId] }),
  ).rejects.toThrow('INVALID_DEPENDENCY');
  expect((await read()).revision.id).toBe(own.revisionId);
});

it('does not replay a receipt for a now-unverified owner', async () => {
  await configure();
  const body = request(await inputs());
  const key = randomUUID();
  await publish(body, null, key);
  await db.owner.query('UPDATE auth."user" SET "emailVerified"=false WHERE id=$1', [actor]);
  await expect(publish(body, null, key)).rejects.toThrow('BOOK_NOT_FOUND');
  await expect(read()).rejects.toThrow('BOOK_NOT_FOUND');
});

it('projects malformed stored data as unavailable without disclosing its payload', async () => {
  await configure();
  const context = await inputs();
  await db.owner.query(
    `WITH stream AS (SELECT id,library_id FROM library.ai_result_streams WHERE library_id=$1),
    revision AS (INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
      SELECT id,library_id,1,'{"description":"private malformed result"}',$2,$3,'v1',$4,now() FROM stream RETURNING id,stream_id)
    UPDATE library.ai_result_streams s SET head_revision_id=r.id FROM revision r WHERE s.id=r.stream_id`,
    [libraryId, context.manifest, context.fingerprint, producer],
  );
  expect(await read()).toEqual({
    state: 'unavailable',
    kind: 'enrichment',
    bookStableId: stableId,
  });
});

it('returns unavailable for malformed stored manifest shapes instead of throwing', async () => {
  await configure();
  const context = await inputs();
  const manifest = { ...context.manifest, relatedBooks: {} };
  await db.owner.query(
    `WITH stream AS (SELECT id,library_id FROM library.ai_result_streams WHERE library_id=$1),
    revision AS (INSERT INTO library.ai_result_revisions(stream_id,library_id,revision,payload,input_manifest,input_fingerprint,rubric_version,producer,calculated_at)
      SELECT id,library_id,1,$2,$3,library.ai_hash($3),'v1',$4,now() FROM stream RETURNING id,stream_id)
    UPDATE library.ai_result_streams s SET head_revision_id=r.id FROM revision r WHERE s.id=r.stream_id`,
    [libraryId, payload, manifest, producer],
  );
  expect(await read()).toEqual({
    state: 'unavailable',
    kind: 'enrichment',
    bookStableId: stableId,
  });
});

it('requires READ COMMITTED writers so locks cannot validate an obsolete transaction snapshot', async () => {
  await configure();
  const body = request(await inputs());
  const worker = await db.aiProducer.connect();
  try {
    await worker.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await expect(publish(body, null, randomUUID(), worker)).rejects.toThrow(
      'UNSUPPORTED_AI_ISOLATION',
    );
  } finally {
    await worker.query('ROLLBACK');
    worker.release();
  }
  expect((await read()).state).toBe('missing');
});

it('rejects raw JSON numeric scales that collapse after JavaScript double conversion', async () => {
  await configure('taste');
  const context = await inputs('taste');
  const raw = JSON.stringify(
    request(context, 'taste', {
      scores: [{ factor: 'fit', value: 1, min: 1, max: 'raw-max' }],
      sources: payload.sources,
    }),
  ).replace('"raw-max"', '1.00000000000000001');
  await expect(
    db.aiProducer.query('SELECT library.publish_ai_result($1,$2,NULL,$3)', [
      actor,
      randomUUID(),
      raw,
    ]),
  ).rejects.toThrow('INVALID_AI_REQUEST');
});

it('allows exactly one competing first publication and one receipt', async () => {
  await configure();
  const body = request(await inputs());
  const outcomes = await Promise.allSettled([publish(body), publish(body)]);
  expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(
    outcomes
      .filter((outcome) => outcome.status === 'rejected')
      .map((outcome) => outcome.reason.message),
  ).toEqual(['VERSION_CONFLICT']);
  expect(
    (
      await db.owner.query(
        "SELECT count(*) FROM library.app_operation_receipts WHERE library_id=$1 AND operation='publish_ai_result'",
        [libraryId],
      )
    ).rows[0].count,
  ).toBe('1');
  expect(
    (
      await db.owner.query('SELECT count(*) FROM library.ai_result_revisions WHERE library_id=$1', [
        libraryId,
      ])
    ).rows[0].count,
  ).toBe('1');
});

it('rolls back the result, head and receipt together', async () => {
  await configure();
  const body = request(await inputs());
  const worker = await db.aiProducer.connect();
  try {
    await worker.query('BEGIN');
    await publish(body, null, randomUUID(), worker);
    await worker.query('ROLLBACK');
  } finally {
    worker.release();
  }
  expect((await read()).state).toBe('missing');
  expect(
    (
      await db.owner.query(
        "SELECT count(*) FROM library.app_operation_receipts WHERE library_id=$1 AND operation='publish_ai_result'",
        [libraryId],
      )
    ).rows[0].count,
  ).toBe('0');
  expect(
    (
      await db.owner.query('SELECT count(*) FROM library.ai_result_revisions WHERE library_id=$1', [
        libraryId,
      ])
    ).rows[0].count,
  ).toBe('0');
});

it('retains a stale result when a selected related source is archived', async () => {
  const related = `archived-source-${randomUUID()}`;
  const book = await insertBookFixture(db.owner, { stableId: related });
  await db.owner.query('INSERT INTO library.library_books(book_id,library_id) VALUES($1,$2)', [
    book.id,
    libraryId,
  ]);
  await configure();
  const captured = await inputs('enrichment', {
    ...selector,
    relatedBooks: [{ bookStableId: related, fields: ['title'] }],
  });
  const receipt = await publish(request(captured));
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [related]);
  expect(await read()).toMatchObject({
    state: 'stale',
    reason: 'source_unavailable',
    revision: { id: receipt.revisionId },
  });
});
