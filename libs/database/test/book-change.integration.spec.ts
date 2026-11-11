import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase } from './harness';
import { insertBookFixture } from './fixtures';
import {
  isChangeProposal,
  isChangeReceipt,
  isEditableBook,
} from '../../domain/src/lib/book-change';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let actor: string, lib: string;
const create = {
  type: 'create',
  title: 'Synthetic Capture',
  authors: ['Synthetic Writer'],
  platform: 'Kindle',
  status: 'unread',
};
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
beforeEach(async () => {
  actor = randomUUID();
  await db.owner.query(
    'INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Synthetic\',$1||\'@example.test\',true,now(),now())',
    [actor],
  );
  lib = (
    await db.owner.query(
      'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) RETURNING id',
      [actor],
    )
  ).rows[0].id;
});
async function enable() {
  await db.owner.query(
    "INSERT INTO library.native_write_permissions(library_id,enabled,approved_by,approved_at) VALUES($1,true,'synthetic-offline',now())",
    [lib],
  );
}
async function prepare(change: object = create, key = randomUUID(), channel = 'site') {
  return (
    await db.appRuntime.query('SELECT library.prepare_book_change($1,$2,$3,$4) result', [
      actor,
      key,
      change,
      channel,
    ])
  ).rows[0].result;
}
async function commit(p: { id: string; digest: string }, confirm = true, key = randomUUID()) {
  return (
    await db.appRuntime.query(
      `SELECT library.${confirm ? 'confirm_and_commit_book_change' : 'commit_book_change'}($1,$2,$3,$4) result`,
      [actor, key, p.id, p.digest],
    )
  ).rows[0].result;
}
async function editable(stable: string) {
  return (
    await db.appRuntime.query('SELECT library.editable_book_for_user($1,$2) result', [
      actor,
      stable,
    ])
  ).rows[0].result;
}
async function update(stable: string, patch: object) {
  const b = await editable(stable);
  return prepare({
    type: 'update',
    stableId: stable,
    expectedVersion: b.version,
    expectedFeedbackVersion: b.feedbackVersion,
    patch,
  });
}
it('defaults to disabled and validates closed SQL input', async () => {
  await expect(prepare()).rejects.toThrow('NATIVE_WRITES_DISABLED');
  await enable();
  for (const invalid of [
    { ...create, owner: 'foreign' },
    { ...create, authors: ['Writer', ' writer '] },
    { ...create, rating: 3.1 },
    { ...create, status: 'read', finishedDate: '2023-02-29' },
    { ...create, finishedDate: '2024-01-01' },
  ])
    await expect(prepare(invalid)).rejects.toThrow('INVALID_BOOK_CHANGE');
});
it('prepares without mutation and requires browser confirmation, then replays once', async () => {
  await enable();
  const key = randomUUID();
  const p = await prepare(create, key, 'mcp');
  expect(isChangeProposal(p)).toBe(true);
  expect(p.before).toBe(null);
  expect(await prepare(create, key, 'mcp')).toEqual(p);
  await expect(prepare({ ...create, title: 'Different' }, key, 'mcp')).rejects.toThrow(
    'REQUEST_REPLAY_MISMATCH',
  );
  expect(
    (
      await db.owner.query(
        'SELECT count(*)::int n FROM library.library_books WHERE library_id=$1',
        [lib],
      )
    ).rows[0].n,
  ).toBe(0);
  await expect(commit(p, false)).rejects.toThrow('CONFIRMATION_REQUIRED');
  await expect(commit({ ...p, digest: '0'.repeat(64) })).rejects.toThrow(
    'PROPOSAL_DIGEST_MISMATCH',
  );
  const r = await commit(p);
  expect(isChangeReceipt(r)).toBe(true);
  expect(r.changed).toBe(true);
  expect(await commit(p, false)).toEqual(r);
  expect(await commit(p)).toEqual(r);
  const b = await editable(r.stableId);
  expect(isEditableBook(b)).toBe(true);
  expect(b).toMatchObject({ native: true, writable: true, version: '1', feedbackVersion: null });
  const prov = (
    await db.owner.query(
      'SELECT DISTINCT actor FROM library.book_field_provenance p JOIN library.books b ON b.id=p.book_id WHERE b.stable_id=$1',
      [r.stableId],
    )
  ).rows;
  expect(prov).toEqual([{ actor }]);
});
it('retains independent versions and no-op timestamps, and atomically clears feedback', async () => {
  await enable();
  const r = await commit(await prepare());
  const initial = await editable(r.stableId);
  const first = await commit(
    await update(r.stableId, { rating: 4.5, opinion: 'Synthetic view', notes: 'Synthetic note' }),
  );
  expect(first).toMatchObject({ version: '1', feedbackVersion: '1', changed: true });
  const before = (
    await db.owner.query(
      'SELECT b.updated_at,f.updated_at feedback_at FROM library.books b JOIN library.book_feedback f ON f.book_id=b.id WHERE b.stable_id=$1',
      [r.stableId],
    )
  ).rows[0];
  const noop = await commit(await update(r.stableId, { rating: 4.5 }));
  expect(noop.changed).toBe(false);
  expect(
    (
      await db.owner.query(
        'SELECT b.updated_at,f.updated_at feedback_at FROM library.books b JOIN library.book_feedback f ON f.book_id=b.id WHERE b.stable_id=$1',
        [r.stableId],
      )
    ).rows[0],
  ).toEqual(before);
  await expect(
    prepare({
      type: 'update',
      stableId: r.stableId,
      expectedVersion: initial.version,
      expectedFeedbackVersion: null,
      patch: { notes: 'stale' },
    }),
  ).rejects.toThrow('VERSION_CONFLICT');
  const cleared = await commit(
    await update(r.stableId, {
      rating: null,
      opinion: null,
      notes: null,
      status: 'read',
      finishedDate: '2024-02-29',
    }),
  );
  expect(cleared).toMatchObject({ version: '2', feedbackVersion: '2' });
  expect(await editable(r.stableId)).toMatchObject({
    rating: null,
    opinion: null,
    notes: null,
    finishedDate: '2024-02-29',
  });
});
it('denies imported, foreign and archived books and never promotes existing books', async () => {
  await enable();
  const fixture = await insertBookFixture(db.owner);
  await db.owner.query('INSERT INTO library.library_books(library_id,book_id) VALUES($1,$2)', [
    lib,
    fixture.id,
  ]);
  expect(await editable(fixture.stableId)).toMatchObject({ native: false, writable: false });
  await expect(update(fixture.stableId, { status: 'read' })).rejects.toThrow('BOOK_NOT_WRITABLE');
  const native = await commit(await prepare());
  await db.owner.query('UPDATE library.books SET archived_at=now() WHERE stable_id=$1', [
    native.stableId,
  ]);
  await expect(editable(native.stableId)).rejects.toThrow('BOOK_NOT_FOUND');
  actor = randomUUID();
  await expect(commit(native, false)).rejects.toThrow();
});
it('rejects stale and expired proposals without persisting confirmation', async () => {
  await enable();
  const r = await commit(await prepare());
  const a = await update(r.stableId, { status: 'reading' }),
    b = await update(r.stableId, { status: 'read' });
  await commit(a);
  await expect(commit(b)).rejects.toThrow('VERSION_CONFLICT');
  expect(
    (
      await db.owner.query('SELECT confirmed_at FROM library.book_change_proposals WHERE id=$1', [
        b.id,
      ])
    ).rows[0].confirmed_at,
  ).toBe(null);
  const p = await prepare();
  await db.owner.query(
    "UPDATE library.book_change_proposals SET expires_at=now()-interval '1 second' WHERE id=$1",
    [p.id],
  );
  await expect(commit(p)).rejects.toThrow('PROPOSAL_EXPIRED');
});
it('serializes competing commits and prevents runtime table or private helper access', async () => {
  await enable();
  const p = await prepare();
  const rs = await Promise.all([commit(p), commit(p)]);
  expect(rs[0]).toEqual(rs[1]);
  expect(
    (
      await db.owner.query(
        'SELECT count(*)::int n FROM library.library_books WHERE library_id=$1',
        [lib],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(db.appRuntime.query('SELECT * FROM library.book_change_proposals')).rejects.toThrow(
    'permission denied',
  );
  await expect(
    db.appRuntime.query('UPDATE library.native_write_permissions SET enabled=true'),
  ).rejects.toThrow('permission denied');
  const grants = await db.owner.query(
    "SELECT has_function_privilege('public','library.commit_book_change(text,uuid,uuid,text)','execute') ok",
  );
  expect(grants.rows[0].ok).toBe(false);
});
it('requires read status whenever a resulting finished date remains, and permits explicit clear', async () => {
  await enable();
  const r = await commit(await prepare({ ...create, status: 'read', finishedDate: '2024-01-01' }));
  await expect(update(r.stableId, { status: 'paused' })).rejects.toThrow('INVALID_BOOK_CHANGE');
  const p = await update(r.stableId, { status: 'paused', finishedDate: null });
  await commit(p);
  expect(await editable(r.stableId)).toMatchObject({ status: 'paused', finishedDate: null });
});
it('rejects import evidence even when a native marker exists, before receipt replay', async () => {
  await enable();
  const p = await prepare();
  const r = await commit(p);
  await db.owner.query(
    "UPDATE library.books SET source_updated_by='synthetic-sheet' WHERE stable_id=$1",
    [r.stableId],
  );
  expect(await editable(r.stableId)).toMatchObject({ native: false, writable: false });
  await expect(commit(p, false)).rejects.toThrow('BOOK_NOT_WRITABLE');
});
it('denies foreign proposals to an otherwise verified enabled owner', async () => {
  await enable();
  const p = await prepare();
  const foreign = randomUUID();
  await db.owner.query(
    'INSERT INTO auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Synthetic\',$1||\'@example.test\',true,now(),now())',
    [foreign],
  );
  const foreignLib = (
    await db.owner.query(
      'INSERT INTO library.user_libraries(owner_user_id) VALUES($1) RETURNING id',
      [foreign],
    )
  ).rows[0].id;
  await db.owner.query(
    "INSERT INTO library.native_write_permissions(library_id,enabled,approved_by,approved_at) VALUES($1,true,'synthetic-offline',now())",
    [foreignLib],
  );
  actor = foreign;
  await expect(commit(p)).rejects.toThrow('PROPOSAL_NOT_FOUND');
  await expect(
    db.appRuntime.query('SELECT library.book_change_for_user($1,$2)', [actor, p.id]),
  ).rejects.toThrow('PROPOSAL_NOT_FOUND');
});
it('rolls back create, authors and confirmation when author aliases converge', async () => {
  await enable();
  const key = randomUUID();
  const author = (
    await db.owner.query(
      "INSERT INTO library.authors(name,name_key,updated_by) VALUES('Synthetic Shared',$1,'synthetic-owner') RETURNING id",
      [key],
    )
  ).rows[0].id;
  await db.owner.query(
    "INSERT INTO library.author_aliases(alias_key,alias,author_id,resolution_note) VALUES($1,$1,$3,'synthetic alias'),($2,$2,$3,'synthetic alias')",
    [key + 'a', key + 'b', author],
  );
  const p = await prepare({ ...create, authors: [key + 'a', key + 'b', 'New Synthetic ' + key] });
  await expect(commit(p)).rejects.toThrow('INVALID_BOOK_CHANGE');
  expect(
    (
      await db.owner.query(
        'SELECT count(*)::int n FROM library.library_books WHERE library_id=$1',
        [lib],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.owner.query(
        'SELECT confirmed_at,result FROM library.book_change_proposals WHERE id=$1',
        [p.id],
      )
    ).rows[0],
  ).toEqual({ confirmed_at: null, result: null });
  expect(
    (
      await db.owner.query('SELECT count(*)::int n FROM library.authors WHERE name_key=$1', [
        'new synthetic ' + key,
      ])
    ).rows[0].n,
  ).toBe(0);
});
it('rejects changed commit-key reuse, altered payload and disabled permission on retries', async () => {
  await enable();
  const p = await prepare();
  const q = await prepare();
  const key = randomUUID();
  await commit(p, true, key);
  await expect(commit(q, true, key)).rejects.toThrow('REQUEST_REPLAY_MISMATCH');
  await expect(
    db.owner.query('UPDATE library.book_change_proposals SET change=$1 WHERE id=$2', [
      { ...create, title: 'tampered' },
      q.id,
    ]),
  ).rejects.toThrow('PROPOSAL_IMMUTABLE');
  await db.owner.query(
    'UPDATE library.native_write_permissions SET enabled=false WHERE library_id=$1',
    [lib],
  );
  await expect(commit(p, false)).rejects.toThrow('NATIVE_WRITES_DISABLED');
});
it('serializes stale feedback proposals and keeps the winning parent version unchanged', async () => {
  await enable();
  const r = await commit(await prepare());
  const a = await update(r.stableId, { notes: 'first' }),
    b = await update(r.stableId, { notes: 'second' });
  const outcomes = await Promise.allSettled([commit(a), commit(b)]);
  expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((v) => v.status === 'rejected')).toHaveLength(1);
  expect(await editable(r.stableId)).toMatchObject({ version: '1', feedbackVersion: '1' });
});
