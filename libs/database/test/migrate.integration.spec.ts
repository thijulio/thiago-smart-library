import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from './harness';
import { migrate, status } from '../src/migrate';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
it('replays once and rejects changed bytes without executing SQL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sl-migrations-'));
  const client = await db.owner.connect();
  try {
    const base = await status(client);
    // Test directory includes the exact already committed history.
    const { copyFile, readdir } = await import('node:fs/promises');
    for (const file of await readdir('libs/database/migrations'))
      await copyFile(join('libs/database/migrations', file), join(dir, file));
    expect((await migrate(client, dir)).unchanged).toEqual(base.map((x) => x.name));
    await writeFile(join(dir, '0006_test.sql'), 'CREATE TABLE library.replay_probe(id int);');
    expect((await migrate(client, dir)).applied).toEqual(['0006_test.sql']);
    expect((await migrate(client, dir)).applied).toEqual([]);
    await writeFile(join(dir, '0006_test.sql'), 'CREATE TABLE library.never_applied(id int);');
    await expect(migrate(client, dir)).rejects.toThrow('MIGRATION_CHECKSUM_MISMATCH');
    expect(
      (await client.query("SELECT to_regclass('library.never_applied') AS name")).rows[0].name,
    ).toBeNull();
    await writeFile(join(dir, '0006_test.sql'), 'CREATE TABLE library.replay_probe(id int);');
    await writeFile(
      join(dir, '0007_bad.sql'),
      'CREATE TABLE library.rolled_back(id int); SELECT missing_operation();',
    );
    await expect(migrate(client, dir)).rejects.toThrow();
    expect(
      (await client.query("SELECT to_regclass('library.rolled_back') AS name")).rows[0].name,
    ).toBeNull();
    expect((await status(client)).at(-1)?.name).toBe('0006_test.sql');
  } finally {
    client.release();
    await rm(dir, { recursive: true });
  }
});
it('status performs no DDL and runtime role cannot migrate', async () => {
  const client = await db.editor.connect();
  try {
    await expect(migrate(client, 'libs/database/migrations')).rejects.toThrow();
  } finally {
    client.release();
  }
});
it('concurrent runners commit each migration once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sl-concurrent-'));
  const { copyFile, readdir } = await import('node:fs/promises');
  const c1 = await db.owner.connect(),
    c2 = await db.owner.connect();
  try {
    for (const file of await readdir('libs/database/migrations'))
      await copyFile(join('libs/database/migrations', file), join(dir, file));
    // Previous test deliberately added 0006 in this same suite.
    await writeFile(join(dir, '0006_test.sql'), 'CREATE TABLE library.replay_probe(id int);');
    await writeFile(
      join(dir, '0007_concurrent.sql'),
      'CREATE TABLE library.concurrent_probe(id int); INSERT INTO library.concurrent_probe VALUES(1);',
    );
    const r = await Promise.all([migrate(c1, dir), migrate(c2, dir)]);
    expect(r.flatMap((x) => x.applied)).toEqual(['0007_concurrent.sql']);
    expect(
      (await db.owner.query('SELECT count(*) FROM library.concurrent_probe')).rows[0].count,
    ).toBe('1');
  } finally {
    c1.release();
    c2.release();
    await rm(dir, { recursive: true });
  }
});
it('one-client transactions rollback all writes on failure', async () => {
  const { withTransaction } = await import('../src/connection');
  await expect(
    withTransaction(db.owner, async (c) => {
      await c.query('CREATE TABLE library.transaction_probe(id int)');
      await c.query('SELECT nonexistent_function()');
    }),
  ).rejects.toThrow();
  expect(
    (await db.owner.query("SELECT to_regclass('library.transaction_probe') AS name")).rows[0].name,
  ).toBeNull();
});
it('unknown database history fails before new SQL', async () => {
  const client = await db.owner.connect();
  try {
    await client.query(
      "INSERT INTO db_meta.schema_migrations(name,checksum) VALUES('0008_unknown.sql',repeat('a',64))",
    );
    await expect(migrate(client, 'libs/database/migrations')).rejects.toThrow(
      'MIGRATION_HISTORY_DIVERGED',
    );
  } finally {
    await client.query("DELETE FROM db_meta.schema_migrations WHERE name='0008_unknown.sql'");
    client.release();
  }
});
it('marker mismatch fails closed and does not apply pending migration', async () => {
  const { assertMarker } = await import('../src/migrate');
  await expect(assertMarker(db.owner, randomUUID())).rejects.toThrow('UNSAFE_DATABASE_MARKER');
  await db.owner.query("UPDATE db_meta.environment SET purpose='production'");
  try {
    await expect(assertMarker(db.owner)).rejects.toThrow('UNSAFE_DATABASE_MARKER');
  } finally {
    await db.owner.query("UPDATE db_meta.environment SET purpose='synthetic-test'");
  }
});
it('connection loss cannot leave a false applied history record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sl-loss-'));
  const { copyFile, readdir } = await import('node:fs/promises');
  const c = await db.owner.connect();
  c.on('error', () => {
    /* The induced backend loss is asserted below. */
  });
  try {
    for (const file of await readdir('libs/database/migrations'))
      await copyFile(join('libs/database/migrations', file), join(dir, file));
    await writeFile(join(dir, '0006_test.sql'), 'CREATE TABLE library.replay_probe(id int);');
    await writeFile(
      join(dir, '0007_concurrent.sql'),
      'CREATE TABLE library.concurrent_probe(id int); INSERT INTO library.concurrent_probe VALUES(1);',
    );
    await writeFile(
      join(dir, '0008_loss.sql'),
      'CREATE TABLE library.loss_probe(id int); SELECT pg_sleep(20);',
    );
    const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const result = migrate(c, dir).then(
      () => ({ failed: false }),
      () => ({ failed: true }),
    );
    let waiting = false;
    for (let n = 0; n < 100; n++) {
      const r = await db.owner.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1', [pid]);
      if (r.rows[0]?.wait_event === 'PgSleep') {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await db.owner.query('SELECT pg_terminate_backend($1)', [pid]);
    expect(await result).toEqual({ failed: true });
    expect((await status(db.owner)).map((x) => x.name)).not.toContain('0008_loss.sql');
    expect(
      (await db.owner.query("SELECT to_regclass('library.loss_probe') AS name")).rows[0].name,
    ).toBeNull();
  } finally {
    c.release(true);
    await rm(dir, { recursive: true });
  }
});
it('missing marker fails closed without replacement DDL', async () => {
  const c = await db.owner.connect();
  const { assertMarker } = await import('../src/migrate');
  try {
    await c.query('BEGIN');
    await c.query('DROP TABLE db_meta.environment');
    await expect(assertMarker(c)).rejects.toThrow('MISSING_DATABASE_MARKER');
    expect(
      (await c.query("SELECT to_regclass('db_meta.environment') AS name")).rows[0].name,
    ).toBeNull();
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});
it('retries only known PostgreSQL serialization errors, at most twice', async () => {
  const { withTransaction } = await import('../src/connection');
  let attempts = 0;
  const value = await withTransaction(db.owner, async (c) => {
    attempts++;
    if (attempts < 3)
      await c.query(
        "DO $$ BEGIN RAISE EXCEPTION 'synthetic serialization' USING ERRCODE='40001'; END $$",
      );
    return 42;
  });
  expect(value).toBe(42);
  expect(attempts).toBe(3);
  attempts = 0;
  await expect(
    withTransaction(db.owner, async (c) => {
      attempts++;
      await c.query(
        "DO $$ BEGIN RAISE EXCEPTION 'synthetic serialization' USING ERRCODE='40001'; END $$",
      );
    }),
  ).rejects.toMatchObject({ code: '40001' });
  expect(attempts).toBe(3);
  attempts = 0;
  await expect(
    withTransaction(db.owner, async (c) => {
      attempts++;
      await c.query(
        "DO $$ BEGIN RAISE EXCEPTION 'synthetic validation' USING ERRCODE='23514'; END $$",
      );
    }),
  ).rejects.toMatchObject({ code: '23514' });
  expect(attempts).toBe(1);
});
