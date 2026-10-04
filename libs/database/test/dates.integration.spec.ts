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
  ['day', '2026-03-23', '2026-03-23'],
  ['month', '2026-02-01', '2026-02-28'],
  ['year', '2024-01-01', '2024-12-31'],
  ['range', '2026-07-01', '2026-08-31'],
  ['unknown', null, null],
])('round trips %s without timezone shift', async (precision, from, to) => {
  const b = await insertBookFixture(db.owner);
  await db.owner.query(
    'UPDATE library.books SET finished_precision=$1,finished_from=$2,finished_to=$3 WHERE id=$4',
    [precision, from, to, b.id],
  );
  expect(
    (
      await db.owner.query(
        'SELECT finished_from::text,finished_to::text FROM library.books WHERE id=$1',
        [b.id],
      )
    ).rows[0],
  ).toEqual({ finished_from: from, finished_to: to });
});
it.each([
  ['day', null, '2026-01-01'],
  ['unknown', '2026-01-01', null],
  ['month', '2026-02-02', '2026-02-28'],
  ['year', '2026-01-01', '2026-12-30'],
  ['range', '2026-01-01', '2026-01-01'],
  ['day', 'infinity', 'infinity'],
  ['day', '2026-02-30', '2026-02-30'],
])('rejects invalid %s bounds %s %s', async (precision, from, to) => {
  const b = await insertBookFixture(db.owner);
  await expect(
    db.owner.query(
      'UPDATE library.books SET finished_precision=$1,finished_from=$2,finished_to=$3 WHERE id=$4',
      [precision, from, to, b.id],
    ),
  ).rejects.toThrow();
});
